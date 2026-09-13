'use strict';

/**
 * Who may change a lead's owner.
 *
 * The rule exists because sending a LINE message is limited to the lead's owner (A3),
 * and that limit meant nothing while a salesperson could make themselves the owner of
 * a colleague's lead first. These cases are the ways that used to work.
 */

const request = require('supertest');
const { app, db, tag, createUser, signIn } = require('./helpers');

describe('lead ownership', () => {
  const users = {};
  const cookies = {};
  let contact;
  const leadIds = [];

  const newLead = async (ownerId) => {
    const lead = await db.Lead.create({
      contact_id: contact.id,
      title: `ownership ${tag()}`,
      owner_id: ownerId,
      // chk_leads_triage_requires_no_owner
      needs_triage: ownerId === null,
    });
    leadIds.push(lead.id);
    return lead;
  };

  const setOwner = (who, leadId, ownerId) =>
    request(app)
      .patch(`/api/leads/${leadId}/owner`)
      .set('Cookie', cookies[who])
      .send({ owner_id: ownerId });

  beforeAll(async () => {
    for (const [key, role] of [['manager', 'manager'], ['alice', 'sales'], ['bob', 'sales']]) {
      const { user, password } = await createUser({ role });
      users[key] = user;
      cookies[key] = await signIn(request, { email: user.email, password });
    }
    contact = await db.Contact.create({ name: `ownership contact ${tag()}` });
  });

  afterAll(async () => {
    await db.Activity.destroy({ where: { lead_id: leadIds }, force: true });
    await db.AuditHistory.destroy({ where: { entity_id: [...leadIds, contact.id] }, force: true });
    await db.Lead.destroy({ where: { id: leadIds }, force: true });
    await db.Contact.destroy({ where: { id: contact.id }, force: true });
    await db.User.destroy({ where: { id: Object.values(users).map((u) => u.id) }, force: true });
    await db.sequelize.close();
  });

  describe('sales', () => {
    it('can claim a lead nobody owns', async () => {
      const lead = await newLead(null);
      const res = await setOwner('alice', lead.id, users.alice.id);
      expect(res.status).toBe(200);
      expect(res.body.data.lead.owner_id).toBe(users.alice.id);
      expect(res.body.data.lead.needs_triage).toBe(false);
    });

    it('can release their own lead back to triage', async () => {
      const lead = await newLead(users.alice.id);
      const res = await setOwner('alice', lead.id, null);
      expect(res.status).toBe(200);
      expect(res.body.data.lead.owner_id).toBeNull();
      expect(res.body.data.lead.needs_triage).toBe(true);
    });

    it("cannot take a colleague's lead — the hole this closes", async () => {
      const lead = await newLead(users.bob.id);
      const res = await setOwner('alice', lead.id, users.alice.id);
      expect(res.status).toBe(409);

      // Refused means nothing written: not the owner, not a timeline entry, not an
      // audit row. A refusal that still logged "owner changed" would be worse than none.
      const after = await db.Lead.findByPk(lead.id);
      expect(after.owner_id).toBe(users.bob.id);
      expect(await db.Activity.count({ where: { lead_id: lead.id, type: 'owner_changed' } })).toBe(0);
      expect(await db.AuditHistory.count({ where: { table_name: 'leads', entity_id: lead.id } })).toBe(0);
    });

    it('then cannot send on it either', async () => {
      // The end-to-end reason for the rule: the send check is only as strong as the
      // ownership rule underneath it.
      const lineContact = await db.Contact.create({
        name: `line contact ${tag()}`,
        line_user_id: `Uown${tag()}`,
      });
      const lead = await db.Lead.create({
        contact_id: lineContact.id,
        title: `bob's LINE lead ${tag()}`,
        owner_id: users.bob.id,
        needs_triage: false,
      });
      leadIds.push(lead.id);

      try {
        expect((await setOwner('alice', lead.id, users.alice.id)).status).toBe(409);
        const send = await request(app)
          .post(`/api/leads/${lead.id}/messages`)
          .set('Cookie', cookies.alice)
          .send({ text: 'สวัสดีครับ' });
        expect(send.status).toBe(403);
        expect(await db.Message.count({ where: { lead_id: lead.id } })).toBe(0);
      } finally {
        await db.Lead.destroy({ where: { id: lead.id }, force: true });
        await db.Contact.destroy({ where: { id: lineContact.id }, force: true });
      }
    });

    it('cannot hand an unowned lead to someone else', async () => {
      const lead = await newLead(null);
      const res = await setOwner('alice', lead.id, users.bob.id);
      expect(res.status).toBe(403);
    });

    it("cannot release a colleague's lead", async () => {
      const lead = await newLead(users.bob.id);
      const res = await setOwner('alice', lead.id, null);
      expect(res.status).toBe(403);
      expect((await db.Lead.findByPk(lead.id)).owner_id).toBe(users.bob.id);
    });
  });

  describe('manager', () => {
    it('can reassign, assign to anyone and clear', async () => {
      const lead = await newLead(users.bob.id);
      expect((await setOwner('manager', lead.id, users.alice.id)).status).toBe(200);
      expect((await setOwner('manager', lead.id, null)).status).toBe(200);
      expect((await setOwner('manager', lead.id, users.bob.id)).status).toBe(200);
      expect((await db.Lead.findByPk(lead.id)).owner_id).toBe(users.bob.id);
    });
  });

  it('lets exactly one of two simultaneous claims win', async () => {
    // Without the row lock both requests read owner_id = NULL, both pass the check, and
    // the second write silently takes the lead from whoever got there first.
    const lead = await newLead(null);

    const [a, b] = await Promise.all([
      setOwner('alice', lead.id, users.alice.id),
      setOwner('bob', lead.id, users.bob.id),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = a.status === 200 ? users.alice.id : users.bob.id;
    expect((await db.Lead.findByPk(lead.id)).owner_id).toBe(winner);
    expect(await db.Activity.count({ where: { lead_id: lead.id, type: 'owner_changed' } })).toBe(1);
  });
});
