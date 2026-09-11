'use strict';

/**
 * Required test 2 of 3: the LINE webhook — signature verification and idempotency.
 *
 * These are the two properties that decide whether the webhook is safe to expose. The
 * endpoint is public by necessity, so an unsigned request must write nothing at all;
 * and LINE redelivers on any slow or failed response, so the same event arriving twice
 * must not produce two contacts, two leads or two messages.
 */

const crypto = require('crypto');
const request = require('supertest');
const { app, db, tag, waitFor } = require('./helpers');
const { signPayload } = require('../src/lib/line/signature');

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;

const buildEvent = ({ eventId, lineUserId, text }) => ({
  destination: 'Utestdestination0000000000000000',
  events: [
    {
      type: 'message',
      mode: 'active',
      timestamp: Date.now(),
      webhookEventId: eventId,
      source: { type: 'user', userId: lineUserId },
      replyToken: crypto.randomBytes(16).toString('hex'),
      message: { id: `m-${eventId}`, type: 'text', text },
    },
  ],
});

/**
 * Posts the body as a string with a signature computed over those exact bytes, as LINE
 * does. The string matters: handing supertest a Buffer makes it serialise the Buffer
 * itself, and the bytes on the wire stop being the bytes that were signed.
 */
const post = (body, { signature } = {}) => {
  const text = JSON.stringify(body);
  const raw = Buffer.from(text, 'utf8');
  const req = request(app).post('/webhooks/line').set('Content-Type', 'application/json');
  const header = signature === undefined
    ? signPayload({ rawBody: raw, channelSecret: CHANNEL_SECRET })
    : signature;
  if (header !== null) req.set('X-Line-Signature', header);
  return req.send(text);
};

describe('LINE webhook', () => {
  const lineUserId = `Utest${tag()}`;
  const eventId = `evt-${tag()}`;

  beforeAll(async () => {
    await db.LineWebhookEvent.destroy({ where: { webhook_event_id: eventId }, force: true });
  });

  afterAll(async () => {
    const contact = await db.Contact.findOne({ where: { line_user_id: lineUserId } });
    if (contact) {
      const leads = await db.Lead.findAll({ where: { contact_id: contact.id }, paranoid: false });
      const leadIds = leads.map((l) => l.id);
      await db.Message.destroy({ where: { lead_id: leadIds }, force: true });
      await db.Activity.destroy({ where: { lead_id: leadIds }, force: true });
      await db.AuditHistory.destroy({ where: { entity_id: [...leadIds, contact.id] }, force: true });
      await db.Lead.destroy({ where: { id: leadIds }, force: true });
      await db.Contact.destroy({ where: { id: contact.id }, force: true });
    }
    await db.LineWebhookEvent.destroy({ where: { webhook_event_id: eventId }, force: true });
    await db.sequelize.close();
  });

  describe('signature verification', () => {
    it('rejects a request with no signature header', async () => {
      const res = await post(buildEvent({ eventId: `no-sig-${tag()}`, lineUserId, text: 'hi' }), {
        signature: null,
      });
      expect(res.status).toBe(401);
    });

    it('rejects a wrong signature', async () => {
      const res = await post(buildEvent({ eventId: `bad-sig-${tag()}`, lineUserId, text: 'hi' }), {
        signature: crypto.randomBytes(32).toString('base64'),
      });
      expect(res.status).toBe(401);
    });

    it('rejects a signature computed over a different body', async () => {
      // The classic replay: a valid signature lifted from one payload and attached to
      // another. It must fail, because the HMAC covers the bytes, not the header.
      const other = Buffer.from(JSON.stringify(buildEvent({ eventId: 'x', lineUserId, text: 'a' })), 'utf8');
      const stolen = signPayload({ rawBody: other, channelSecret: CHANNEL_SECRET });
      const res = await post(buildEvent({ eventId: `replay-${tag()}`, lineUserId, text: 'b' }), {
        signature: stolen,
      });
      expect(res.status).toBe(401);
    });

    it('writes nothing for a request that failed verification', async () => {
      const rejectedId = `rejected-${tag()}`;
      await post(buildEvent({ eventId: rejectedId, lineUserId, text: 'hi' }), { signature: null });
      const row = await db.LineWebhookEvent.findByPk(rejectedId);
      // An unauthenticated caller must not be able to put a row in this database —
      // not even a log row, which is otherwise an unbounded write primitive.
      expect(row).toBeNull();
    });

    it('accepts a correctly signed request', async () => {
      const res = await post(buildEvent({ eventId, lineUserId, text: 'สนใจสินค้า ขอราคาหน่อยครับ' }));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.received).toBe(1);
    });
  });

  describe('idempotency', () => {
    it('creates exactly one contact, lead and message for a first delivery', async () => {
      const contact = await waitFor(() => db.Contact.findOne({ where: { line_user_id: lineUserId } }));
      expect(contact).toBeTruthy();

      const lead = await waitFor(() => db.Lead.findOne({ where: { contact_id: contact.id } }));
      expect(lead.source).toBe('line');
      expect(lead.stage).toBe('New');
      // No owner yet, so it lands in the triage queue rather than silently sitting
      // unassigned in the pipeline.
      expect(lead.needs_triage).toBe(true);

      const messages = await db.Message.findAll({ where: { lead_id: lead.id } });
      expect(messages).toHaveLength(1);
      expect(messages[0].direction).toBe('inbound');
    });

    it('ignores a redelivery of the same webhookEventId', async () => {
      const before = await db.Contact.findOne({ where: { line_user_id: lineUserId } });
      const leadsBefore = await db.Lead.count({ where: { contact_id: before.id } });
      const messagesBefore = await db.Message.count({
        where: { lead_id: (await db.Lead.findOne({ where: { contact_id: before.id } })).id },
      });

      // Same webhookEventId, freshly signed. Only the id decides identity here, which is
      // the point: LINE redelivers when it judges the first response too slow, and the
      // retry must not be able to create a second lead by carrying a new timestamp.
      const res = await post(buildEvent({ eventId, lineUserId, text: 'ignored' }));
      expect(res.status).toBe(200);

      // Give the (no-op) processing the same grace period a real one would get.
      await new Promise((r) => setTimeout(r, 600));

      const contacts = await db.Contact.count({ where: { line_user_id: lineUserId } });
      expect(contacts).toBe(1);

      const lead = await db.Lead.findOne({ where: { contact_id: before.id } });
      expect(await db.Lead.count({ where: { contact_id: before.id } })).toBe(leadsBefore);
      expect(await db.Message.count({ where: { lead_id: lead.id } })).toBe(messagesBefore);
    });
  });

  it('answers 400 for a signed body that is not JSON', async () => {
    const body = 'not json at all';
    const raw = Buffer.from(body, 'utf8');
    const res = await request(app)
      .post('/webhooks/line')
      // text/plain so supertest sends the string untouched; express.raw accepts any
      // type here precisely because the signature is over bytes, not over a parse.
      .set('Content-Type', 'text/plain')
      .set('X-Line-Signature', signPayload({ rawBody: raw, channelSecret: CHANNEL_SECRET }))
      .send(body);
    expect(res.status).toBe(400);
  });
});
