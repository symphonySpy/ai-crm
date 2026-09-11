'use strict';

// Answers "what was this value on date X?" without denormalising a copy of the master
// record into every table that references it.
//
// The alternative considered and rejected was carrying company_name (and a JSON blob
// of the company) on contacts. That produces two places holding the same fact, which
// drift the moment one write path forgets the other, and it makes the *current* value
// wrong — which is what a salesperson looks at 99% of the time.
//
// Reading a historical value is a replay: take the current value and undo every change
// recorded after the timestamp you care about.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('field_change_log', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      // Not a foreign key: this table outlives the rows it describes, and pointing at
      // three different tables from one column is not something an FK can express.
      entity_type: {
        type: Sequelize.ENUM('company', 'contact', 'lead'),
        allowNull: false,
      },
      entity_id: { type: Sequelize.UUID, allowNull: false },
      field: { type: Sequelize.STRING(64), allowNull: false },
      // Values are stored as text regardless of the source column's type. History is
      // read by humans and replayed rarely; preserving exact typing is not worth a
      // column per type.
      old_value: { type: Sequelize.TEXT, allowNull: true },
      new_value: { type: Sequelize.TEXT, allowNull: true },
      // Null means the system made the change rather than a person — the same
      // convention as activities.actor_id.
      changed_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'NO ACTION',
        onDelete: 'RESTRICT',
      },
      changed_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
    });

    // The question is always "history of this record", newest first.
    await queryInterface.addIndex('field_change_log', ['entity_type', 'entity_id', 'changed_at'], {
      name: 'idx_field_change_entity',
    });
    // And occasionally "every rename this quarter", for reconciliation.
    await queryInterface.addIndex('field_change_log', ['entity_type', 'field', 'changed_at'], {
      name: 'idx_field_change_field',
    });

    // A change entry where nothing changed is noise that would quietly inflate the
    // table and make history harder to read.
    await queryInterface.sequelize.query(`
      ALTER TABLE field_change_log
      ADD CONSTRAINT chk_field_change_actually_changed
      CHECK (NOT (old_value <=> new_value))
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('field_change_log');
  },
};
