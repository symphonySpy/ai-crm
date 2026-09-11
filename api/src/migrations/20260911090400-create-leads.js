'use strict';

const STAGES = ['New', 'Qualified', 'Proposal', 'Won', 'Lost'];

const authorFk = (Sequelize) => ({
  type: Sequelize.UUID,
  allowNull: true,
  references: { model: 'users', key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: 'SET NULL',
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('leads', {
      id: { type: Sequelize.UUID, primaryKey: true },
      contact_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'contacts', key: 'id' },
        onUpdate: 'CASCADE',
        // A14: contacts are deactivated, never deleted. RESTRICT makes the database
        // refuse a delete that would orphan a lead rather than silently cascading.
        onDelete: 'RESTRICT',
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        // MySQL forbids a CHECK constraint on any column that carries a foreign key
        // referential action, including ON UPDATE CASCADE. This column is named in
        // chk_leads_triage_requires_no_owner, so both actions stay at NO ACTION. Nothing is lost:
        // ids are UUIDs that never change, and A14 says a user with work attached is
        // deactivated rather than deleted — which is exactly what RESTRICT enforces.
        onUpdate: 'NO ACTION',
        onDelete: 'RESTRICT',
      },
      title: { type: Sequelize.STRING(200), allowNull: false },
      stage: { type: Sequelize.ENUM(...STAGES), allowNull: false, defaultValue: 'New' },
      // A9: whole baht. UNSIGNED means the database itself rejects a negative value.
      value_thb: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      source: {
        type: Sequelize.ENUM('website', 'manual', 'line'),
        allowNull: false,
        defaultValue: 'manual',
      },
      // A32: set when a lead was auto-created from an unknown LINE sender.
      needs_triage: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      last_contact_at: { type: Sequelize.DATE, allowNull: true },
      created_by: authorFk(Sequelize),
      updated_by: authorFk(Sequelize),
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('leads', ['stage'], { name: 'idx_leads_stage' });
    await queryInterface.addIndex('leads', ['owner_id'], { name: 'idx_leads_owner' });
    await queryInterface.addIndex('leads', ['contact_id'], { name: 'idx_leads_contact' });
    // The pipeline board reads "my leads, by stage, newest first" on every load.
    await queryInterface.addIndex('leads', ['owner_id', 'stage', 'created_at'], {
      name: 'idx_leads_owner_stage_created',
    });
    await queryInterface.addIndex('leads', ['needs_triage'], { name: 'idx_leads_needs_triage' });

    // An unassigned lead must be flagged for triage — otherwise it is invisible work.
    // A lead with an owner must not still be sitting in the triage queue.
    await queryInterface.sequelize.query(`
      ALTER TABLE leads
      ADD CONSTRAINT chk_leads_triage_requires_no_owner
      CHECK ((owner_id IS NULL AND needs_triage = 1) OR (owner_id IS NOT NULL AND needs_triage = 0))
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('leads');
  },
};
