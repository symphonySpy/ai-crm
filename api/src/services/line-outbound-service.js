'use strict';

const db = require('../models');
const { getLineAdapter } = require('../lib/line/adapter');
const { notFound, badRequest, forbidden } = require('../middleware/errors');
const { logger } = require('../lib/logger');

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 300;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send one message, retrying only what is worth retrying.
 *
 * A35: three attempts with exponential backoff on 5xx, rate limits and network failures.
 * A 4xx is not retried — the request was rejected on its merits, and repeating it just
 * asks the same question and gets the same answer while delaying everything behind it.
 */
async function sendWithRetry({ to, text, adapter, log = logger }) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await adapter.sendText({ to, text });
      return { ok: true, attempts: attempt, messageId: result.messageId };
    } catch (err) {
      lastError = err;
      if (!err.retryable || attempt === MAX_ATTEMPTS) break;

      const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1);
      log.warn({ attempt, delay, err: err.message }, 'LINE send failed, retrying');
      await sleep(delay);
    }
  }

  return { ok: false, attempts: MAX_ATTEMPTS, error: lastError };
}

/**
 * Send a reply to the contact on a lead.
 *
 * A34: the approval gate. An outbound Message row cannot exist without approved_by —
 * the database refuses it (chk_messages_outbound_requires_approver) — so there is no
 * code path, present or future, that sends a customer a message nobody agreed to.
 *
 * When the text came from an AI suggestion, approving it here is what moves that
 * suggestion out of 'proposed'. Until a person clicks, the model's draft is a row in
 * ai_suggestions and nothing more (A22).
 */
async function sendReply({ leadId, text, actor, suggestionId = null, adapter = getLineAdapter(), log = logger }) {
  const lead = await db.Lead.findByPk(leadId, {
    include: [{ model: db.Contact, as: 'contact' }],
  });
  if (!lead) throw notFound('Lead');
  if (!lead.contact || !lead.contact.line_user_id) {
    throw badRequest('This lead has no LINE contact to reply to');
  }

  // A3: the one place role matters, because getting it wrong reaches a customer.
  if (actor.role !== 'manager' && lead.owner_id !== actor.id) {
    throw forbidden('You can only send messages on leads you own');
  }

  let suggestion = null;
  if (suggestionId) {
    suggestion = await db.AiSuggestion.findByPk(suggestionId);
    if (!suggestion) throw notFound('AI suggestion');
    if (suggestion.lead_id !== lead.id) throw badRequest('Suggestion belongs to another lead');
    if (suggestion.status !== 'proposed') {
      throw badRequest(`Suggestion was already ${suggestion.status}`);
    }
  }

  // The row is created as 'pending' BEFORE the network call. If the process dies
  // mid-send, the message is visible and stuck rather than invisible and lost — which is
  // the difference between a salesperson noticing and a customer being ignored.
  const message = await db.sequelize.transaction(async (transaction) => {
    const created = await db.Message.create(
      {
        lead_id: lead.id,
        contact_id: lead.contact.id,
        direction: 'outbound',
        channel: 'line',
        content_type: 'text',
        body: text,
        send_status: 'pending',
        approved_by: actor.id,
      },
      { transaction, actorId: actor.id },
    );

    if (suggestion) {
      await suggestion.update(
        { status: 'approved', decided_by: actor.id, decided_at: new Date() },
        { transaction, actorId: actor.id },
      );
      await db.Activity.create(
        {
          lead_id: lead.id,
          actor_id: actor.id,
          type: 'ai_suggestion_approved',
          occurred_at: new Date(),
        },
        { transaction, actorId: actor.id },
      );
    }

    return created;
  });

  const result = await sendWithRetry({ to: lead.contact.line_user_id, text, adapter, log });

  if (result.ok) {
    await message.update(
      {
        send_status: 'sent',
        sent_at: new Date(),
        attempt_count: result.attempts,
        line_message_id: result.messageId,
      },
      { actorId: actor.id },
    );

    await db.Activity.create(
      { lead_id: lead.id, actor_id: actor.id, type: 'message_sent', occurred_at: new Date() },
      { actorId: actor.id },
    );
    await lead.update({ last_contact_at: new Date() }, { actorId: actor.id });
  } else {
    // A35: a failed message stays visible with its error rather than disappearing.
    await message.update(
      {
        send_status: 'failed',
        attempt_count: result.attempts,
        error_detail: String(result.error && result.error.message).slice(0, 2000),
      },
      { actorId: actor.id },
    );
    log.error({ leadId: lead.id, messageId: message.id }, 'LINE send gave up');
  }

  await message.reload();
  return { message, delivered: result.ok };
}

/** Reject a draft. The suggestion is closed and nothing is sent. */
async function rejectSuggestion({ suggestionId, actor }) {
  const suggestion = await db.AiSuggestion.findByPk(suggestionId);
  if (!suggestion) throw notFound('AI suggestion');
  if (suggestion.status !== 'proposed') {
    throw badRequest(`Suggestion was already ${suggestion.status}`);
  }

  await db.sequelize.transaction(async (transaction) => {
    await suggestion.update(
      { status: 'rejected', decided_by: actor.id, decided_at: new Date() },
      { transaction, actorId: actor.id },
    );
    await db.Activity.create(
      {
        lead_id: suggestion.lead_id,
        actor_id: actor.id,
        type: 'ai_suggestion_rejected',
        occurred_at: new Date(),
      },
      { transaction, actorId: actor.id },
    );
  });

  return suggestion;
}

/**
 * Retry messages left in 'pending'.
 *
 * Covers the gap the per-request path cannot: a process killed between creating the row
 * and finishing the send. Run from a scheduled job; see A35.
 */
async function retryPending({ limit = 20, adapter = getLineAdapter(), log = logger } = {}) {
  const stuck = await db.Message.findAll({
    where: { direction: 'outbound', send_status: 'pending' },
    include: [{ model: db.Contact, as: 'contact' }],
    order: [['created_at', 'ASC']],
    limit,
  });

  let sent = 0;
  for (const message of stuck) {
    if (!message.contact || !message.contact.line_user_id) continue;
    const result = await sendWithRetry({
      to: message.contact.line_user_id,
      text: message.body,
      adapter,
      log,
    });

    if (result.ok) {
      await message.update({
        send_status: 'sent',
        sent_at: new Date(),
        attempt_count: message.attempt_count + result.attempts,
        line_message_id: result.messageId,
      });
      sent += 1;
    } else {
      await message.update({
        send_status: 'failed',
        attempt_count: message.attempt_count + result.attempts,
        error_detail: String(result.error && result.error.message).slice(0, 2000),
      });
    }
  }

  return { examined: stuck.length, sent };
}

module.exports = { sendReply, rejectSuggestion, retryPending, sendWithRetry, MAX_ATTEMPTS };
