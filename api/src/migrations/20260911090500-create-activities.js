'use strict';

const STAGES = ['New', 'Qualified', 'Proposal', 'Won', 'Lost'];

const ACTIVITY_TYPES = [
  'lead_created',
  'stage_changed',
  'owner_changed',
  'note_added',
  'message_received',
  'message_sent',
  'ai_suggestion_requested',
  'ai_suggestion_approved',
  'ai_suggestion_rejected',
  'contact_updated',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('activities', {
      id: { type: Sequelize.UUID, primaryKey: true },
      lead_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'leads', key: 'id' },
        onUpdate: 'CASCADE',
        // Deleting a lead takes its history with it. Leads are not deleted in normal
        // operation; this only defines behaviour for an explicit manager-led purge.
        onDelete: 'CASCADE',
      },
      // Null means the system acted: an inbound message, or a lead created from LINE.
      actor_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      type: { type: Sequelize.ENUM(...ACTIVITY_TYPES), allowNull: false },
      // Stage VALUES, not foreign keys — a point-in-time stamp so old history stays
      // readable even if the pipeline is renamed later.
      from_stage: { type: Sequelize.ENUM(...STAGES), allowNull: true },
      to_stage: { type: Sequelize.ENUM(...STAGES), allowNull: true },
      note: { type: Sequelize.TEXT, allowNull: true },
      occurred_at: { type: Sequelize.DATE, allowNull: false },
      // A16: append-only. There is no updated_at because nothing here is ever updated.
      created_at: { type: Sequelize.DATE, allowNull: false },
    });

    // The lead timeline is the hot read path: one lead, newest first.
    await queryInterface.addIndex('activities', ['lead_id', 'occurred_at'], {
      name: 'idx_activities_lead_occurred',
    });
    await queryInterface.addIndex('activities', ['actor_id'], { name: 'idx_activities_actor' });

    // A stage change without both endpoints is not an audit record, it is noise.
    await queryInterface.sequelize.query(`
      ALTER TABLE activities
      ADD CONSTRAINT chk_activities_stage_change_has_stages
      CHECK (type <> 'stage_changed' OR (from_stage IS NOT NULL AND to_stage IS NOT NULL))
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('activities');
  },
};
