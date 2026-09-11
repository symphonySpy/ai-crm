'use strict';

// created_by / updated_by on every business table.
//
// companies, contacts and leads already carried them. This adds the same pair to the
// remaining tables so authorship is uniform: any row in the system can answer "who put
// this here, and who touched it last?" without the reader having to remember which
// tables happen to record it.
//
// Both are nullable, and null means the system acted rather than a person — the same
// convention as activities.actor_id. That is not a gap to be filled: an inbound LINE
// message and an auto-created lead genuinely have no user behind them, and writing a
// placeholder user would be a lie that a support conversation later has to untangle.
//
// Values are filled by the hook in lib/authorship.js from the actorId passed on the
// query, never by hand at each call site.
//
// tbl_audit_history is deliberately left out. It is written once by the system and
// already records changed_by, which IS its author; a second column holding the same
// fact under a different name is how two sources of truth start.

const TABLES = ['users', 'activities', 'messages', 'ai_suggestions', 'line_webhook_events'];

const authorFk = (Sequelize) => ({
  type: Sequelize.UUID,
  allowNull: true,
  references: { model: 'users', key: 'id' },
  // Consistent with every other user reference in the schema: ids are UUIDs that never
  // change, and A14 says a user with work attached is deactivated rather than deleted,
  // which is exactly what RESTRICT enforces.
  onUpdate: 'NO ACTION',
  onDelete: 'RESTRICT',
});

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of TABLES) {
      await queryInterface.addColumn(table, 'created_by', authorFk(Sequelize));
      await queryInterface.addColumn(table, 'updated_by', authorFk(Sequelize));
    }

    // Backfill where authorship is already recorded under a more specific name, so the
    // new columns are not uniformly empty on existing rows. Where no such column exists
    // (line_webhook_events) the rows stay null, which is correct: the system wrote them.
    await queryInterface.sequelize.query(
      'UPDATE activities SET created_by = actor_id, updated_by = actor_id WHERE actor_id IS NOT NULL',
    );
    await queryInterface.sequelize.query(
      "UPDATE messages SET created_by = approved_by, updated_by = approved_by " +
      "WHERE direction = 'outbound' AND approved_by IS NOT NULL",
    );
    await queryInterface.sequelize.query(
      'UPDATE ai_suggestions SET created_by = requested_by, updated_by = COALESCE(decided_by, requested_by)',
    );
  },

  async down(queryInterface) {
    for (const table of TABLES) {
      await queryInterface.removeColumn(table, 'updated_by');
      await queryInterface.removeColumn(table, 'created_by');
    }
  },
};
