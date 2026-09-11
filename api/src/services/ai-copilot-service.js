'use strict';

const db = require('../models');
const { getAiAdapter, AiUnavailableError } = require('../lib/ai/adapter');
const { buildContext, PROMPT_VERSION } = require('../lib/ai/prompt');
const { buildFallbackBundle } = require('../lib/ai/fallback');
const { validateBundle } = require('../lib/ai/schema');
const { notFound } = require('../middleware/errors');
const { logger } = require('../lib/logger');

/**
 * Generate a suggestion for a lead.
 *
 * A22 is the whole shape of this function: it writes one row to `ai_suggestions` with
 * status `proposed` and touches nothing else. No lead is updated, no message is sent, no
 * stage moves. Everything the model produces is a proposal until a person acts on it,
 * and the database enforces that rather than trusting this code to keep behaving.
 *
 * A20: it only runs because someone asked. Nothing generates suggestions on inbound
 * messages — that would spend money on leads nobody is working and fill the table with
 * advice no one reads.
 */
async function generateSuggestion({ leadId, actor, adapter = getAiAdapter(), log = logger }) {
  const lead = await db.Lead.findByPk(leadId, {
    include: [
      { model: db.Contact, as: 'contact' },
      { model: db.Company, as: 'company' },
    ],
  });
  if (!lead) throw notFound('Lead');

  const messages = await db.Message.findAll({
    where: { lead_id: lead.id },
    order: [['created_at', 'ASC']],
    limit: 200,
  });

  const context = buildContext({
    lead,
    contact: lead.contact,
    company: lead.company,
    messages,
  });

  let bundle;
  let model = null;
  let degraded = false;
  let degradedReason = null;

  try {
    const result = await adapter.generate(context);
    // Validated even on the happy path. A schema-shaped response is not necessarily a
    // coherent one — the cross-field check catches a score that disagrees with the
    // reasons printed next to it, which is worse than no score because it looks right.
    bundle = validateBundle(result.bundle);
    model = result.model;
  } catch (err) {
    degraded = true;
    degradedReason =
      err instanceof AiUnavailableError ? err.message : `invalid model output: ${err.message}`;
    // Warn, not error: the system did what it was designed to do. Paging someone at 3am
    // for a working fallback is how alerts get muted.
    log.warn({ leadId: lead.id, reason: degradedReason }, 'AI copilot degraded to rule-based');
    bundle = validateBundle(buildFallbackBundle(context, { reason: degradedReason }));
  }

  const suggestion = await db.AiSuggestion.create(
    {
      lead_id: lead.id,
      kind: 'copilot_bundle',
      payload: bundle,
      // A17: what the model was shown, frozen. Without it, "why did it score 62?" stops
      // being answerable the moment the lead is edited.
      context_snapshot: context,
      model,
      prompt_version: PROMPT_VERSION,
      degraded,
      status: 'proposed',
      requested_by: actor.id,
    },
    { actorId: actor.id },
  );

  // The request itself is worth a timeline entry: it shows the salesperson asked, which
  // is context for whatever they do next.
  await db.Activity.create(
    {
      lead_id: lead.id,
      actor_id: actor.id,
      type: 'ai_suggestion_requested',
      note: degraded ? `โหมดสำรอง: ${degradedReason}`.slice(0, 500) : null,
      occurred_at: new Date(),
    },
    { actorId: actor.id },
  );

  return suggestion;
}

/** Suggestions for a lead, newest first. */
const listForLead = (leadId, { limit = 10 } = {}) =>
  db.AiSuggestion.findAll({
    where: { lead_id: leadId },
    include: [
      { model: db.User, as: 'requestedBy', attributes: ['id', 'name'] },
      { model: db.User, as: 'decidedBy', attributes: ['id', 'name'] },
    ],
    order: [['created_at', 'DESC']],
    limit,
  });

module.exports = { generateSuggestion, listForLead };
