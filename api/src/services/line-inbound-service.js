'use strict';

const { UniqueConstraintError } = require('sequelize');
const db = require('../models');
const { getLineAdapter } = require('../lib/line/adapter');
const { logger } = require('../lib/logger');

// LINE message types that carry no text we can use. They are recorded with their type so
// the conversation stays honest — a salesperson seeing a gap would assume the customer
// went quiet, when in fact they sent a photo (A37).
const CONTENT_TYPE_BY_LINE_TYPE = {
  text: 'text',
  sticker: 'sticker',
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'file',
  location: 'location',
};

/**
 * Claim an event id.
 *
 * A30: this IS the idempotency mechanism. webhook_event_id is the primary key, so a
 * redelivery loses the insert race and is recognised as already seen. The deliberate
 * choice is to write first and let the constraint decide, rather than reading to check
 * whether the id exists and then writing — that check has a window between the read and
 * the write, and LINE retries concurrently, which is exactly when the window opens.
 *
 * Returns the row on a first delivery, null on a duplicate.
 */
async function claimEvent({ event, destination }) {
  try {
    return await db.LineWebhookEvent.create({
      webhook_event_id: event.webhookEventId,
      destination: destination || null,
      event_type: event.type || null,
      raw_payload: event,
      signature_valid: true,
      process_status: 'received',
      received_at: new Date(),
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) return null;
    throw err;
  }
}

/**
 * Find the contact behind a LINE user id, creating one if this is a first contact.
 *
 * A32: contacts.line_user_id is unique, so a returning sender can never produce a second
 * contact row. A26: the display name is captured once here and never overwrites a name a
 * human has since edited.
 */
async function findOrCreateContact({ lineUserId, transaction }) {
  const existing = await db.Contact.findOne({ where: { line_user_id: lineUserId }, transaction });
  if (existing) return { contact: existing, isNew: false };

  const profile = await getLineAdapter().getProfile(lineUserId);
  const displayName = (profile && profile.displayName) || 'ผู้ติดต่อจาก LINE';

  const contact = await db.Contact.create(
    {
      name: displayName,
      line_user_id: lineUserId,
      line_display_name: displayName,
      // No actorId: the system created this, not a person. Recording a placeholder user
      // would be a wrong answer someone later has to untangle.
    },
    { transaction },
  );

  return { contact, isNew: true };
}

/**
 * The lead this message belongs to.
 *
 * An open lead is reused so a continuing conversation stays in one thread. Only when
 * every lead for this contact is closed does a new one open — a customer coming back
 * after a Won or Lost deal is a new opportunity, not a footnote on the old one.
 */
async function findOrCreateLead({ contact, transaction }) {
  const open = await db.Lead.findOne({
    where: { contact_id: contact.id, stage: ['New', 'Qualified', 'Proposal'] },
    order: [['created_at', 'DESC']],
    transaction,
  });
  if (open) return { lead: open, isNew: false };

  const lead = await db.Lead.create(
    {
      contact_id: contact.id,
      company_id: contact.company_id || null,
      owner_id: null,
      title: `สอบถามผ่าน LINE — ${contact.name}`,
      stage: 'New',
      source: 'line',
      // A32 and chk_leads_triage_requires_no_owner: no owner means it must be flagged,
      // otherwise it is work nobody can see.
      needs_triage: true,
      last_contact_at: new Date(),
    },
    { transaction },
  );

  await db.Activity.create(
    {
      lead_id: lead.id,
      actor_id: null,
      type: 'lead_created',
      to_stage: 'New',
      note: 'สร้างอัตโนมัติจากข้อความ LINE ขาเข้า',
      occurred_at: new Date(),
    },
    { transaction },
  );

  return { lead, isNew: true };
}

/**
 * Process one inbound event.
 *
 * Everything after the event has been claimed runs in a transaction: contact, lead,
 * message and timeline entry either all exist or none do. A message stored against a
 * lead that failed to be created is a conversation with no home.
 */
async function processEvent({ event, destination, log = logger }) {
  const claimed = await claimEvent({ event, destination });
  if (!claimed) {
    log.info({ webhookEventId: event.webhookEventId }, 'duplicate LINE event ignored');
    return { status: 'duplicate' };
  }

  // Only user messages become CRM records. Follows, unfollows and postbacks are stored
  // as raw events for completeness and marked 'ignored' rather than silently dropped —
  // "we never received it" and "we received it and did nothing" are different answers.
  const isUserMessage =
    event.type === 'message' && event.source && event.source.type === 'user' && event.message;

  if (!isUserMessage) {
    await claimed.update({ process_status: 'ignored', processed_at: new Date() });
    return { status: 'ignored', reason: `event type ${event.type}` };
  }

  try {
    const result = await db.sequelize.transaction(async (transaction) => {
      const { contact, isNew: contactIsNew } = await findOrCreateContact({
        lineUserId: event.source.userId,
        transaction,
      });
      const { lead, isNew: leadIsNew } = await findOrCreateLead({ contact, transaction });

      const lineType = event.message.type;
      const contentType = CONTENT_TYPE_BY_LINE_TYPE[lineType] || 'other';

      const message = await db.Message.create(
        {
          lead_id: lead.id,
          contact_id: contact.id,
          direction: 'inbound',
          channel: 'line',
          content_type: contentType,
          // Non-text messages keep a null body; the type already says what arrived.
          body: lineType === 'text' ? event.message.text : null,
          // A30: unique, so the same LINE message cannot be stored twice even if the
          // event id were to change between deliveries.
          line_message_id: event.message.id || null,
          // chk_messages_direction_status: inbound is always 'received'.
          send_status: 'received',
        },
        { transaction },
      );

      await db.Activity.create(
        {
          lead_id: lead.id,
          actor_id: null,
          type: 'message_received',
          occurred_at: new Date(),
        },
        { transaction },
      );

      // Recency feeds the qualification score, so it has to move when the customer
      // actually reaches out.
      await lead.update({ last_contact_at: new Date() }, { transaction });

      return { contact, lead, message, contactIsNew, leadIsNew };
    });

    await claimed.update({
      process_status: 'processed',
      processed_at: new Date(),
      message_id: result.message.id,
    });

    log.info(
      {
        webhookEventId: event.webhookEventId,
        leadId: result.lead.id,
        newContact: result.contactIsNew,
        newLead: result.leadIsNew,
      },
      'LINE message recorded',
    );

    return { status: 'processed', ...result };
  } catch (err) {
    // The raw payload is already stored, so a processing failure delays the message
    // rather than losing it: fix the cause, replay the row (A31).
    await claimed.update({
      process_status: 'failed',
      processed_at: new Date(),
      error_detail: String(err.message).slice(0, 2000),
    });
    log.error({ err, webhookEventId: event.webhookEventId }, 'LINE event processing failed');
    return { status: 'failed', error: err };
  }
}

module.exports = { processEvent, claimEvent, findOrCreateContact, findOrCreateLead };
