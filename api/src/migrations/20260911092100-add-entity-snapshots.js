'use strict';

// Point-in-time copies of the related records each row was attached to.
//
// These columns are NOT the current values. Current values are always read by joining
// through the foreign key — a renamed company must show its new name everywhere
// immediately. These answer a different question: which record, carrying which labels,
// was this row attached to at the time it was written?
//
// Every one of them is maintained by a hook in lib/entity-snapshots.js and by nothing
// else. That is what makes duplicated state safe here: a copy a developer has to
// remember to refresh is a copy that eventually disagrees with its source, so no code
// path is allowed to write these directly.
//
// Snapshots carry identity and labels — ids, names, stage, value, role — and
// deliberately not phone numbers, email addresses or LINE user ids. Those are personal
// data with no question attached to their history, they stay readable on the live row,
// and copying them into every related record would multiply what has to be erased when
// a customer exercises that right.

const json = (Sequelize, comment) => ({ type: Sequelize.JSON, allowNull: true, comment });

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('contacts', 'company_master_json',
      json(Sequelize, 'Company as of linking. Not the current company — join company_id for that.'));

    await queryInterface.addColumn('leads', 'contact_data_json',
      json(Sequelize, 'Primary contact as of assignment.'));
    await queryInterface.addColumn('leads', 'company_data_json',
      json(Sequelize, 'Company as of assignment.'));
    await queryInterface.addColumn('leads', 'owner_data_json',
      json(Sequelize, 'Owning salesperson as of assignment.'));

    await queryInterface.addColumn('activities', 'lead_data_json',
      json(Sequelize, 'Lead as it stood when this event was recorded.'));
    await queryInterface.addColumn('activities', 'actor_data_json',
      json(Sequelize, 'Acting user as they stood when this event was recorded.'));

    await queryInterface.addColumn('messages', 'lead_data_json',
      json(Sequelize, 'Lead as it stood when this message was recorded.'));
    await queryInterface.addColumn('messages', 'contact_data_json',
      json(Sequelize, 'Contact as they stood when this message was recorded.'));

    await queryInterface.addColumn('ai_suggestions', 'lead_data_json',
      json(Sequelize, 'Lead as it stood when this suggestion was generated.'));

    // Backfill from current values. For existing rows this is the best available
    // approximation: no link history exists yet, so "as of writing" and "as of now"
    // are the same answer.
    await queryInterface.sequelize.query(`
      UPDATE contacts c JOIN companies co ON co.id = c.company_id
      SET c.company_master_json = JSON_OBJECT(
        'id', co.id, 'name', co.name, 'industry', co.industry, 'is_active', co.is_active)
    `);
    await queryInterface.sequelize.query(`
      UPDATE leads l JOIN contacts c ON c.id = l.contact_id
      SET l.contact_data_json = JSON_OBJECT(
        'id', c.id, 'name', c.name, 'company_id', c.company_id, 'is_active', c.is_active)
    `);
    await queryInterface.sequelize.query(`
      UPDATE leads l JOIN companies co ON co.id = l.company_id
      SET l.company_data_json = JSON_OBJECT(
        'id', co.id, 'name', co.name, 'industry', co.industry, 'is_active', co.is_active)
    `);
    await queryInterface.sequelize.query(`
      UPDATE leads l JOIN users u ON u.id = l.owner_id
      SET l.owner_data_json = JSON_OBJECT(
        'id', u.id, 'name', u.name, 'email', u.email, 'role', u.role, 'is_active', u.is_active)
    `);
    await queryInterface.sequelize.query(`
      UPDATE activities a JOIN leads l ON l.id = a.lead_id
      SET a.lead_data_json = JSON_OBJECT(
        'id', l.id, 'title', l.title, 'stage', l.stage, 'value_thb', l.value_thb,
        'source', l.source, 'owner_id', l.owner_id)
    `);
    await queryInterface.sequelize.query(`
      UPDATE activities a JOIN users u ON u.id = a.actor_id
      SET a.actor_data_json = JSON_OBJECT(
        'id', u.id, 'name', u.name, 'email', u.email, 'role', u.role, 'is_active', u.is_active)
    `);
    await queryInterface.sequelize.query(`
      UPDATE messages m JOIN leads l ON l.id = m.lead_id
      SET m.lead_data_json = JSON_OBJECT(
        'id', l.id, 'title', l.title, 'stage', l.stage, 'value_thb', l.value_thb,
        'source', l.source, 'owner_id', l.owner_id)
    `);
    await queryInterface.sequelize.query(`
      UPDATE messages m JOIN contacts c ON c.id = m.contact_id
      SET m.contact_data_json = JSON_OBJECT(
        'id', c.id, 'name', c.name, 'company_id', c.company_id, 'is_active', c.is_active)
    `);
    await queryInterface.sequelize.query(`
      UPDATE ai_suggestions s JOIN leads l ON l.id = s.lead_id
      SET s.lead_data_json = JSON_OBJECT(
        'id', l.id, 'title', l.title, 'stage', l.stage, 'value_thb', l.value_thb,
        'source', l.source, 'owner_id', l.owner_id)
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('ai_suggestions', 'lead_data_json');
    await queryInterface.removeColumn('messages', 'contact_data_json');
    await queryInterface.removeColumn('messages', 'lead_data_json');
    await queryInterface.removeColumn('activities', 'actor_data_json');
    await queryInterface.removeColumn('activities', 'lead_data_json');
    await queryInterface.removeColumn('leads', 'owner_data_json');
    await queryInterface.removeColumn('leads', 'company_data_json');
    await queryInterface.removeColumn('leads', 'contact_data_json');
    await queryInterface.removeColumn('contacts', 'company_master_json');
  },
};
