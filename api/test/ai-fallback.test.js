'use strict';

/**
 * Required test 3 of 3: the AI fallback path.
 *
 * The copilot is allowed to fail; it is not allowed to fail silently, to block the CRM,
 * or to write anything a person did not approve. This exercises the degraded path
 * through the real service and the real database, so the guarantees are checked where
 * they are actually enforced.
 *
 * skills/crm-copilot/evals.js covers the same fallback at the skill level (scoring
 * rubric, output shape, refusal cases); `npm run test:skill` runs it.
 */

const { db, tag, createUser } = require('./helpers');
const { MockAiAdapter, AiUnavailableError } = require('../src/lib/ai/adapter');
const { generateSuggestion } = require('../src/services/ai-copilot-service');
const { validateBundle } = require('../src/lib/ai/schema');

const silentLog = { warn() {}, info() {}, error() {} };

describe('AI copilot fallback', () => {
  let actor;
  let lead;
  let contact;

  beforeAll(async () => {
    const m = await createUser({ role: 'manager' });
    actor = m.user;
    contact = await db.Contact.create({ name: `ผู้ติดต่อ AI ${tag()}` });
    lead = await db.Lead.create(
      {
        contact_id: contact.id,
        title: `ทดสอบ fallback ${tag()}`,
        stage: 'New',
        value_thb: 80000,
        source: 'manual',
        needs_triage: true,
      },
      { actorId: actor.id },
    );
    await db.Message.create(
      {
        lead_id: lead.id,
        contact_id: contact.id,
        direction: 'inbound',
        channel: 'line',
        content_type: 'text',
        body: 'ขอราคาแพ็กเกจเล็กสุดครับ',
        send_status: 'received',
        occurred_at: new Date(),
      },
      { actorId: actor.id },
    );
  });

  afterAll(async () => {
    await db.AiSuggestion.destroy({ where: { lead_id: lead.id }, force: true });
    await db.Activity.destroy({ where: { lead_id: lead.id }, force: true });
    await db.Message.destroy({ where: { lead_id: lead.id }, force: true });
    await db.AuditHistory.destroy({ where: { entity_id: [lead.id, contact.id] }, force: true });
    await db.Lead.destroy({ where: { id: lead.id }, force: true });
    await db.Contact.destroy({ where: { id: contact.id }, force: true });
    await db.User.destroy({ where: { id: actor.id }, force: true });
    await db.sequelize.close();
  });

  it('still returns a usable suggestion when the provider is unavailable', async () => {
    const adapter = new MockAiAdapter();
    adapter.failNext();

    const suggestion = await generateSuggestion({
      leadId: lead.id,
      actor,
      adapter,
      log: silentLog,
    });

    // The request succeeds. A provider outage must not take the CRM down with it.
    expect(suggestion.degraded).toBe(true);
    expect(suggestion.status).toBe('proposed');
    // Marked as degraded and with no model recorded, so nobody later mistakes a
    // rule-based score for something the model said.
    expect(suggestion.model).toBeNull();

    const payload = suggestion.payload;
    expect(() => validateBundle(payload)).not.toThrow();
    expect(payload.score).toBeGreaterThanOrEqual(0);
    expect(payload.score).toBeLessThanOrEqual(100);
    expect(payload.score_reasons).toHaveLength(5);
    // The fallback will not put words in a salesperson's mouth: it scores and
    // summarises from the data, and leaves the customer-facing draft empty.
    expect(payload.draft_line_reply).toBeNull();
  });

  it('rejects a well-formed response whose numbers disagree with its own score', async () => {
    const adapter = new MockAiAdapter();
    adapter.returnInconsistentNext();

    const suggestion = await generateSuggestion({
      leadId: lead.id,
      actor,
      adapter,
      log: silentLog,
    });

    // Schema-valid but internally inconsistent — the reasons do not add up to the score.
    // That is worse than an outage, because it looks trustworthy, so it is treated as a
    // failure and the fallback answers instead.
    expect(suggestion.degraded).toBe(true);
    const sum = suggestion.payload.score_reasons.reduce((t, r) => t + r.points, 0);
    expect(sum).toBe(suggestion.payload.score);
  });

  it('writes a proposal and nothing else — no message, no stage change', async () => {
    const adapter = new MockAiAdapter();
    adapter.failNext();

    const stageBefore = lead.stage;
    const outboundBefore = await db.Message.count({
      where: { lead_id: lead.id, direction: 'outbound' },
    });

    await generateSuggestion({ leadId: lead.id, actor, adapter, log: silentLog });

    const after = await db.Lead.findByPk(lead.id);
    expect(after.stage).toBe(stageBefore);
    // A22: the model proposes, a person disposes. Nothing reaches the customer without
    // an approval, and the outbound CHECK constraint enforces that independently.
    expect(
      await db.Message.count({ where: { lead_id: lead.id, direction: 'outbound' } }),
    ).toBe(outboundBefore);

    const activities = await db.Activity.findAll({
      where: { lead_id: lead.id, type: 'ai_suggestion_requested' },
    });
    // The request is on the timeline, attributed to the person who asked.
    expect(activities.length).toBeGreaterThan(0);
    expect(activities[0].actor_id).toBe(actor.id);
  });

  it('reports an unavailable provider as its own error type', () => {
    expect(new AiUnavailableError('timeout')).toBeInstanceOf(Error);
    expect(new AiUnavailableError('timeout').message).toContain('timeout');
  });
});
