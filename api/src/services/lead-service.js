'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const { LEAD_STAGES } = require('../constants/enums');
const { notFound, badRequest } = require('../middleware/errors');

// Everything a lead screen needs about the records it points at. Kept here so the list,
// the detail view and every mutation return the same shape — a client that gets
// `owner` on one endpoint and a bare `owner_id` on another has to special-case both.
const LEAD_INCLUDE = [
  { model: db.Contact, as: 'contact', attributes: ['id', 'name', 'phone', 'line_user_id'] },
  { model: db.Company, as: 'company', attributes: ['id', 'name', 'industry'] },
  { model: db.User, as: 'owner', attributes: ['id', 'name', 'email', 'role'] },
];

const withRelations = (id) => db.Lead.findByPk(id, { include: LEAD_INCLUDE });

/**
 * Paginated, filtered, searchable lead list.
 *
 * Search spans the lead title, the contact's name and the company name, because a
 * salesperson hunting for "คุณสมชาย" is thinking about the person, not the deal record.
 */
async function listLeads({ q, stage, source, ownerId, needsTriage, page, limit, sort, order }) {
  const where = {};
  if (stage) where.stage = stage;
  if (source) where.source = source;
  if (ownerId) where.owner_id = ownerId;
  if (needsTriage !== undefined) where.needs_triage = needsTriage;
  if (q) {
    const like = { [Op.like]: `%${q}%` };
    where[Op.or] = [{ title: like }, { '$contact.name$': like }, { '$company.name$': like }];
  }

  const { rows, count } = await db.Lead.findAndCountAll({
    where,
    include: LEAD_INCLUDE,
    order: [[sort, order.toUpperCase()]],
    limit,
    offset: (page - 1) * limit,
    // Both are required once a where clause reaches into an included table: without
    // them Sequelize counts joined rows rather than leads, and paginates the join.
    distinct: true,
    subQuery: false,
  });

  return {
    data: rows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
  };
}

/** Stage counts and pipeline value for the board header. */
async function pipelineSummary() {
  const rows = await db.Lead.findAll({
    attributes: [
      'stage',
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
      [db.sequelize.fn('SUM', db.sequelize.col('value_thb')), 'value_thb'],
    ],
    group: ['stage'],
    raw: true,
  });

  // Every stage is returned, including empty ones. A board that drops a column when it
  // happens to have no leads looks broken rather than empty.
  const byStage = Object.fromEntries(rows.map((r) => [r.stage, r]));
  return {
    stages: LEAD_STAGES.map((stage) => ({
      stage,
      count: Number(byStage[stage] ? byStage[stage].count : 0),
      value_thb: Number(byStage[stage] ? byStage[stage].value_thb : 0),
    })),
    needsTriage: await db.Lead.count({ where: { needs_triage: true } }),
  };
}

/** Lead detail with its timeline, conversation and AI suggestions. */
async function getLeadDetail(id) {
  const lead = await withRelations(id);
  if (!lead) throw notFound('Lead');

  const [activities, messages, aiSuggestions] = await Promise.all([
    db.Activity.findAll({
      where: { lead_id: lead.id },
      include: [{ model: db.User, as: 'actor', attributes: ['id', 'name', 'role'] }],
      order: [['occurred_at', 'DESC'], ['id', 'DESC']],
      limit: 100,
    }),
    db.Message.findAll({ where: { lead_id: lead.id }, order: [['created_at', 'ASC']], limit: 200 }),
    db.AiSuggestion.findAll({
      where: { lead_id: lead.id },
      order: [['created_at', 'DESC']],
      limit: 10,
    }),
  ]);

  return { lead, activities, messages, aiSuggestions };
}

/**
 * Create a lead and open its timeline.
 *
 * The owner defaults to whoever is creating it: a manually entered lead belongs to the
 * person entering it, and leaving it unowned would drop it into a triage queue nobody
 * asked for.
 */
async function createLead({ input, actor }) {
  const contact = await db.Contact.findByPk(input.contact_id);
  if (!contact) throw notFound('Contact');

  const ownerId = input.owner_id === undefined ? actor.id : input.owner_id;

  const id = await db.sequelize.transaction(async (transaction) => {
    const created = await db.Lead.create(
      {
        contact_id: contact.id,
        company_id: input.company_id !== undefined ? input.company_id : contact.company_id,
        owner_id: ownerId,
        title: input.title,
        value_thb: input.value_thb,
        source: input.source,
        // The schema insists these two agree (chk_leads_triage_requires_no_owner).
        needs_triage: !ownerId,
        last_contact_at: new Date(),
      },
      { transaction, actorId: actor.id },
    );

    await db.Activity.create(
      {
        lead_id: created.id,
        actor_id: actor.id,
        type: 'lead_created',
        to_stage: 'New',
        occurred_at: new Date(),
      },
      { transaction, actorId: actor.id },
    );

    return created.id;
  });

  return withRelations(id);
}

/**
 * Change a lead's stage and record it on the timeline.
 *
 * A19: any transition is allowed, including backwards, because sales deals genuinely
 * move backwards and refusing that would just push people to work around the tool. What
 * is NOT optional is the trail — every move records who did it, from where, to where.
 *
 * The update and its activity row go in one transaction. A stage that changed without a
 * matching timeline entry is worse than no timeline at all, because it looks complete.
 */
async function changeStage({ leadId, toStage, actor, note }) {
  if (!LEAD_STAGES.includes(toStage)) {
    throw badRequest(`Unknown stage "${toStage}"`, { allowed: LEAD_STAGES });
  }

  // The transaction returns only the id. Re-reading with its associations happens after
  // the commit: a query issued inside the callback without the transaction handle would
  // read pre-commit state or deadlock against the row it just wrote.
  const id = await db.sequelize.transaction(async (transaction) => {
    const lead = await db.Lead.findByPk(leadId, { transaction });
    if (!lead) throw notFound('Lead');

    const fromStage = lead.stage;
    if (fromStage === toStage) {
      throw badRequest(`Lead is already at stage "${toStage}"`);
    }

    await lead.update({ stage: toStage }, { transaction, actorId: actor.id });

    await db.Activity.create(
      {
        lead_id: lead.id,
        actor_id: actor.id,
        type: 'stage_changed',
        from_stage: fromStage,
        to_stage: toStage,
        note: note || null,
        occurred_at: new Date(),
      },
      { transaction, actorId: actor.id },
    );

    return lead.id;
  });

  return withRelations(id);
}

/**
 * Assign or reassign the owner.
 *
 * The triage flag moves with ownership because the database insists on it: an unowned
 * lead must be flagged, an owned one must not (chk_leads_triage_requires_no_owner).
 * Keeping that pairing here means the rule is expressed once in code and once in the
 * schema, and the schema is the one that cannot be bypassed.
 */
async function assignOwner({ leadId, ownerId, actor }) {
  const id = await db.sequelize.transaction(async (transaction) => {
    const lead = await db.Lead.findByPk(leadId, { transaction });
    if (!lead) throw notFound('Lead');

    if (ownerId) {
      const owner = await db.User.findByPk(ownerId, { transaction });
      if (!owner) throw notFound('Owner');
      if (!owner.is_active) throw badRequest('Cannot assign a lead to a deactivated user');
    }

    const previousOwner = lead.owner_id;
    await lead.update(
      { owner_id: ownerId || null, needs_triage: !ownerId },
      { transaction, actorId: actor.id },
    );

    await db.Activity.create(
      {
        lead_id: lead.id,
        actor_id: actor.id,
        type: 'owner_changed',
        note: ownerId
          ? `Owner set to ${ownerId}${previousOwner ? ` (was ${previousOwner})` : ''}`
          : 'Owner cleared; returned to triage',
        occurred_at: new Date(),
      },
      { transaction, actorId: actor.id },
    );

    return lead.id;
  });

  return withRelations(id);
}

/** Add a free-text note to the timeline. */
async function addNote({ leadId, note, actor }) {
  const lead = await db.Lead.findByPk(leadId);
  if (!lead) throw notFound('Lead');

  return db.Activity.create(
    {
      lead_id: lead.id,
      actor_id: actor.id,
      type: 'note_added',
      note,
      occurred_at: new Date(),
    },
    { actorId: actor.id },
  );
}

module.exports = {
  LEAD_INCLUDE,
  listLeads,
  pipelineSummary,
  getLeadDetail,
  createLead,
  changeStage,
  assignOwner,
  addNote,
};
