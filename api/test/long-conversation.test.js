'use strict';

/**
 * A conversation longer than any window the API returns.
 *
 * Written after finding that the lead screen and the AI copilot both ordered messages
 * ascending and then limited — returning the OLDEST rows. Nothing in the other suites
 * could catch it, because none of them had more than a handful of messages: below the
 * limit, "the first N" and "the last N" are the same set.
 *
 * So this suite builds 250 messages, which is past the old 200 limit and five windows of
 * the new 50, and includes a burst that shares one millisecond — the case where ordering
 * by timestamp alone is not a total order and a cursor can skip or repeat rows.
 */

const request = require('supertest');
const { app, db, tag, createUser, signIn } = require('./helpers');
const { MockAiAdapter } = require('../src/lib/ai/adapter');
const { generateSuggestion } = require('../src/services/ai-copilot-service');

const TOTAL = 250;
const WINDOW = 50;
// Messages 98..103 share one timestamp. Windows are taken from the newest end, so the
// boundary between the 3rd and 4th page falls between messages 100 and 101 — inside
// the burst. That is the only place the id tie-breaker is actually exercised: a burst
// wholly inside one page would pass even with timestamp-only ordering.
const BURST = new Set([98, 99, 100, 101, 102, 103]);
const BURST_SLOT = 98;

const silentLog = { warn() {}, info() {}, error() {} };
const label = (n) => `msg ${String(n).padStart(3, '0')}`;
const bodies = (rows) => rows.map((m) => m.body);

describe('long conversation', () => {
  let manager;
  let cookie;
  let contact;
  let lead;

  beforeAll(async () => {
    const m = await createUser({ role: 'manager' });
    manager = m.user;
    cookie = await signIn(request, { email: manager.email, password: m.password });

    contact = await db.Contact.create({ name: `ลูกค้าคุยเยอะ ${tag()}` });
    lead = await db.Lead.create(
      { contact_id: contact.id, title: `บทสนทนายาว ${tag()}`, owner_id: manager.id, needs_triage: false },
      { actorId: manager.id },
    );

    // Oldest first, one second apart, so creation order and time order agree — except
    // inside the burst, where only the id can tell the rows apart.
    const start = Date.now() - TOTAL * 1000;
    const burstAt = new Date(start + BURST_SLOT * 1000);
    const rows = [];
    for (let n = 1; n <= TOTAL; n += 1) {
      const at = BURST.has(n) ? burstAt : new Date(start + n * 1000);
      // Alternate directions so the totals are checkable: 125 inbound, 125 outbound.
      const inbound = n % 2 === 1;
      rows.push({
        lead_id: lead.id,
        contact_id: contact.id,
        direction: inbound ? 'inbound' : 'outbound',
        content_type: 'text',
        body: label(n),
        send_status: inbound ? 'received' : 'sent',
        // chk_messages_outbound_requires_approver: every outbound row has an approver.
        approved_by: inbound ? null : manager.id,
        sent_at: inbound ? null : at,
        createdAt: at,
        updatedAt: at,
      });
    }
    await db.Message.bulkCreate(rows);
  });

  afterAll(async () => {
    await db.AiSuggestion.destroy({ where: { lead_id: lead.id }, force: true });
    await db.Activity.destroy({ where: { lead_id: lead.id }, force: true });
    await db.Message.destroy({ where: { lead_id: lead.id }, force: true });
    await db.AuditHistory.destroy({ where: { entity_id: [lead.id, contact.id] }, force: true });
    await db.Lead.destroy({ where: { id: lead.id }, force: true });
    await db.Contact.destroy({ where: { id: contact.id }, force: true });
    await db.User.destroy({ where: { id: manager.id }, force: true });
    await db.sequelize.close();
  });

  it('opens on the newest window, not the oldest', async () => {
    const res = await request(app).get(`/api/leads/${lead.id}`).set('Cookie', cookie);
    expect(res.status).toBe(200);

    const { messages, hasOlderMessages } = res.body.data;
    expect(messages).toHaveLength(WINDOW);
    // The message the customer just sent is the one that must be on screen.
    expect(messages[messages.length - 1].body).toBe(label(TOTAL));
    expect(messages[0].body).toBe(label(TOTAL - WINDOW + 1));
    expect(hasOlderMessages).toBe(true);
  });

  it('pages back through the whole conversation with no gaps and no repeats', async () => {
    const first = await request(app).get(`/api/leads/${lead.id}`).set('Cookie', cookie);
    let seen = bodies(first.body.data.messages);
    let hasOlder = first.body.data.hasOlderMessages;
    let cursor = first.body.data.messages[0].id;
    let pages = 1;

    while (hasOlder) {
      const res = await request(app)
        .get(`/api/leads/${lead.id}/messages`)
        .query({ before: cursor })
        .set('Cookie', cookie);
      expect(res.status).toBe(200);

      const { rows } = res.body.data;
      expect(rows.length).toBeGreaterThan(0);
      // Each page is itself in reading order, and ends just before the previous one began.
      seen = [...bodies(rows), ...seen];
      hasOlder = res.body.data.hasOlder;
      cursor = rows[0].id;
      pages += 1;
      // A cursor that never advances would loop forever rather than fail.
      expect(pages).toBeLessThanOrEqual(Math.ceil(TOTAL / WINDOW) + 1);
    }

    const expected = Array.from({ length: TOTAL }, (_, i) => label(i + 1));
    // Outside the burst the order is exact. Inside it, rows share a timestamp and are
    // ordered by id, which is random — so the check there is membership, not position.
    const outsideBurst = (list) => list.filter((b) => !BURST.has(Number(b.slice(4))));
    expect(outsideBurst(seen)).toEqual(outsideBurst(expected));
    expect([...seen].sort()).toEqual([...expected].sort());
    expect(new Set(seen).size).toBe(TOTAL);
    expect(pages).toBe(Math.ceil(TOTAL / WINDOW));
  });

  it('rejects a cursor from another lead instead of returning its messages', async () => {
    const otherContact = await db.Contact.create({ name: `อีกคน ${tag()}` });
    const otherLead = await db.Lead.create(
      { contact_id: otherContact.id, title: `อีก lead ${tag()}`, owner_id: manager.id, needs_triage: false },
      { actorId: manager.id },
    );
    const foreign = await db.Message.create({
      lead_id: otherLead.id,
      contact_id: otherContact.id,
      direction: 'inbound',
      content_type: 'text',
      body: 'ไม่ควรโผล่ใน lead อื่น',
      send_status: 'received',
    });

    try {
      const res = await request(app)
        .get(`/api/leads/${lead.id}/messages`)
        .query({ before: foreign.id })
        .set('Cookie', cookie);
      expect(res.status).toBe(400);
    } finally {
      await db.Message.destroy({ where: { id: foreign.id }, force: true });
      await db.AuditHistory.destroy({ where: { entity_id: [otherLead.id, otherContact.id] }, force: true });
      await db.Lead.destroy({ where: { id: otherLead.id }, force: true });
      await db.Contact.destroy({ where: { id: otherContact.id }, force: true });
    }
  });

  it('answers 404 for a cursor that does not exist', async () => {
    const res = await request(app)
      .get(`/api/leads/${lead.id}/messages`)
      .query({ before: '00000000-0000-4000-8000-000000000000' })
      .set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('shows the AI copilot the true tail of the conversation and the real totals', async () => {
    const suggestion = await generateSuggestion({
      leadId: lead.id,
      actor: manager,
      adapter: new MockAiAdapter(),
      log: silentLog,
    });

    // context_snapshot is exactly what the model was given (A17), so this checks the
    // prompt input itself rather than an intermediate.
    const { recent_messages: recent, message_counts: counts } = suggestion.context_snapshot;

    expect(recent).toHaveLength(12);
    expect(recent[recent.length - 1].text).toBe(label(TOTAL));
    expect(recent[0].text).toBe(label(TOTAL - 11));
    // Totals for the whole thread — not capped by the 12 shown, nor by the old 200.
    expect(counts).toEqual({ inbound: 125, outbound: 125 });
  });
});
