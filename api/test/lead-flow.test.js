'use strict';

/**
 * Required test 1 of 3: the core CRM flow.
 *
 * Sign in -> create a lead -> assign an owner -> move it through the pipeline -> add a
 * note, then assert that the side effects the rest of the product depends on actually
 * happened: the activity timeline, the authorship columns, and the audit history row
 * that records what the lead looked like before the change.
 */

const request = require('supertest');
const { app, db, tag, createUser, signIn } = require('./helpers');

describe('core CRM flow', () => {
  let cookie;
  let manager;
  let salesRep;
  let contact;
  const created = { leads: [], contacts: [], users: [] };

  beforeAll(async () => {
    const m = await createUser({ role: 'manager' });
    const s = await createUser({ role: 'sales' });
    manager = m.user;
    salesRep = s.user;
    created.users.push(manager.id, salesRep.id);

    cookie = await signIn(request, { email: manager.email, password: m.password });

    contact = await db.Contact.create({ name: `ผู้ติดต่อทดสอบ ${tag()}` });
    created.contacts.push(contact.id);
  });

  afterAll(async () => {
    // Children first: activities and audit rows reference the lead.
    await db.Activity.destroy({ where: { lead_id: created.leads }, force: true });
    await db.AuditHistory.destroy({ where: { entity_id: [...created.leads, ...created.contacts] }, force: true });
    await db.Lead.destroy({ where: { id: created.leads }, force: true });
    await db.Contact.destroy({ where: { id: created.contacts }, force: true });
    await db.User.destroy({ where: { id: created.users }, force: true });
    await db.sequelize.close();
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe(401);
  });

  it('creates a lead, then walks it through the pipeline', async () => {
    const title = `ทดสอบ flow ${tag()}`;

    const create = await request(app)
      .post('/api/leads')
      .set('Cookie', cookie)
      // owner_id omitted: a lead someone types in belongs to them until they say
      // otherwise. Explicit null is how a lead is put into the triage queue instead.
      .send({ contact_id: contact.id, title, value_thb: 120000, source: 'manual' });

    expect(create.status).toBe(201);
    expect(create.body.success).toBe(true);
    const lead = create.body.data.lead;
    created.leads.push(lead.id);

    expect(lead.stage).toBe('New');
    expect(lead.owner_id).toBe(manager.id);
    // chk_leads_triage_requires_no_owner: an owned lead is never awaiting triage.
    expect(lead.needs_triage).toBe(false);
    // Authorship is stamped by a hook, not by the route.
    expect(lead.created_by).toBe(manager.id);

    // Handing it to someone else is the normal reassignment path.
    const assign = await request(app)
      .patch(`/api/leads/${lead.id}/owner`)
      .set('Cookie', cookie)
      .send({ owner_id: salesRep.id });

    expect(assign.status).toBe(200);
    expect(assign.body.data.lead.owner_id).toBe(salesRep.id);
    expect(assign.body.data.lead.needs_triage).toBe(false);

    // Clearing the owner sends it back to triage — the two columns are kept in step by
    // the service and, independently, by the CHECK constraint.
    const unassign = await request(app)
      .patch(`/api/leads/${lead.id}/owner`)
      .set('Cookie', cookie)
      .send({ owner_id: null });
    expect(unassign.status).toBe(200);
    expect(unassign.body.data.lead.needs_triage).toBe(true);

    await request(app)
      .patch(`/api/leads/${lead.id}/owner`)
      .set('Cookie', cookie)
      .send({ owner_id: salesRep.id });

    const qualify = await request(app)
      .patch(`/api/leads/${lead.id}/stage`)
      .set('Cookie', cookie)
      .send({ stage: 'Qualified', note: 'คุยแล้วมีงบจริง' });

    expect(qualify.status).toBe(200);
    expect(qualify.body.data.lead.stage).toBe('Qualified');

    // The same stage twice is a client mistake, not a silent no-op.
    const again = await request(app)
      .patch(`/api/leads/${lead.id}/stage`)
      .set('Cookie', cookie)
      .send({ stage: 'Qualified' });
    expect(again.status).toBe(400);

    const note = await request(app)
      .post(`/api/leads/${lead.id}/notes`)
      .set('Cookie', cookie)
      .send({ note: 'ลูกค้าขอใบเสนอราคาภายในสัปดาห์นี้' });
    expect(note.status).toBe(201);

    const detail = await request(app).get(`/api/leads/${lead.id}`).set('Cookie', cookie);
    expect(detail.status).toBe(200);

    const types = detail.body.data.activities.map((a) => a.type);
    expect(types).toContain('lead_created');
    expect(types).toContain('stage_changed');
    expect(types).toContain('note_added');

    const stageChange = detail.body.data.activities.find((a) => a.type === 'stage_changed');
    // chk_activities_stage_change_has_stages: a stage change records where it came from.
    expect(stageChange.from_stage).toBe('New');
    expect(stageChange.to_stage).toBe('Qualified');

    // Every update is written to the audit history by a model hook, with the row as it
    // was before the change — that is what makes "who changed this, and from what?"
    // answerable after the fact.
    const audit = await db.AuditHistory.findAll({
      where: { table_name: 'leads', entity_id: lead.id },
      order: [['created_at', 'ASC']],
    });
    expect(audit.length).toBeGreaterThanOrEqual(2);
    const stageAudit = audit.find((a) => a.new_json && a.new_json.stage === 'Qualified');
    expect(stageAudit).toBeTruthy();
    expect(stageAudit.old_json.stage).toBe('New');
    expect(stageAudit.changed_by).toBe(manager.id);
  });

  it('rejects an unknown stage before it reaches the database', async () => {
    const res = await request(app)
      .patch(`/api/leads/${created.leads[0]}/stage`)
      .set('Cookie', cookie)
      .send({ stage: 'Negotiating' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('does not let an unknown field through the validator', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Cookie', cookie)
      .send({
        contact_id: contact.id,
        title: `ทดสอบ mass assignment ${tag()}`,
        // Neither field is in the schema. zod strips them, so they must not reach the
        // model — otherwise any client could set any column on any table.
        needs_triage: true,
        createdAt: '1999-01-01T00:00:00.000Z',
      });

    expect(res.status).toBe(201);
    created.leads.push(res.body.data.lead.id);
    // Derived from the owner, not from what the client sent.
    expect(res.body.data.lead.needs_triage).toBe(false);
    expect(new Date(res.body.data.lead.createdAt).getFullYear()).toBeGreaterThan(2020);
  });
});
