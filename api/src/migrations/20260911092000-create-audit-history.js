'use strict';

// Every update and soft delete on an audited table lands here: which table, which row,
// what changed from, what changed to, who did it, when.
//
// One row per update rather than one per field. Changing ten columns in a single save
// writes a single entry whose old_json and new_json carry ten keys each — the shape
// stays flat no matter how wide the edit is.

const AUDITED_TABLES = [
  'users',
  'companies',
  'contacts',
  'leads',
  'messages',
  'ai_suggestions',
  'line_webhook_events',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tbl_audit_history', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      // ENUM rather than free text, so a typo cannot file history under a table name
      // nobody will ever search for.
      table_name: { type: Sequelize.ENUM(...AUDITED_TABLES), allowNull: false },
      // Not a foreign key: one column points at seven tables, which an FK cannot
      // express, and the history outlives the rows it describes.
      entity_id: { type: Sequelize.STRING(64), allowNull: false },
      action: {
        type: Sequelize.ENUM('update', 'soft_delete', 'restore'),
        allowNull: false,
        defaultValue: 'update',
      },
      // Only the columns that actually changed, and only auditable ones — see
      // constants/audit.js for what is excluded and why.
      old_json: { type: Sequelize.JSON, allowNull: false },
      new_json: { type: Sequelize.JSON, allowNull: false },
      // Null means the system acted rather than a person — the same convention as
      // activities.actor_id. Inbound LINE processing genuinely has no user behind it.
      changed_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'NO ACTION',
        onDelete: 'RESTRICT',
      },
      // DATE(3), not DATE. MySQL DATETIME stores whole seconds, so two edits in the
      // same second become indistinguishable and a replay asking for the value "as of"
      // that second silently returns the newer one.
      changed_at: { type: Sequelize.DATE(3), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
    });

    // The usual question is "history of this row, newest first".
    await queryInterface.addIndex('tbl_audit_history', ['table_name', 'entity_id', 'changed_at'], {
      name: 'idx_audit_entity',
    });
    // Occasionally "everything deleted this month", for recovery or reconciliation.
    await queryInterface.addIndex('tbl_audit_history', ['action', 'changed_at'], {
      name: 'idx_audit_action',
    });
    await queryInterface.addIndex('tbl_audit_history', ['changed_by', 'changed_at'], {
      name: 'idx_audit_actor',
    });

    // An entry where nothing differs is noise. CAST is required because MySQL will not
    // compare JSON columns directly inside a CHECK.
    await queryInterface.sequelize.query(`
      ALTER TABLE tbl_audit_history
      ADD CONSTRAINT chk_audit_actually_changed
      CHECK (CAST(old_json AS CHAR) <> CAST(new_json AS CHAR))
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tbl_audit_history');
  },
};
