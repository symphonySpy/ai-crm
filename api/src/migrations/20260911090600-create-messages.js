'use strict';

const CONTENT_TYPES = ['text', 'sticker', 'image', 'video', 'audio', 'file', 'location', 'other'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('messages', {
      id: { type: Sequelize.UUID, primaryKey: true },
      lead_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'leads', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      contact_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'contacts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      direction: { type: Sequelize.ENUM('inbound', 'outbound'), allowNull: false },
      channel: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'line' },
      content_type: {
        type: Sequelize.ENUM(...CONTENT_TYPES),
        allowNull: false,
        defaultValue: 'text',
      },
      body: { type: Sequelize.TEXT, allowNull: true },
      // A30: unique, so a redelivered LINE message cannot become a duplicate row.
      line_message_id: { type: Sequelize.STRING(64), allowNull: true, unique: true },
      send_status: {
        type: Sequelize.ENUM('received', 'pending', 'sent', 'failed'),
        allowNull: false,
      },
      attempt_count: { type: Sequelize.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      error_detail: { type: Sequelize.TEXT, allowNull: true },
      // A34: an outbound message exists only because a human approved the draft.
      approved_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        // MySQL forbids a CHECK constraint on any column that carries a foreign key
        // referential action, including ON UPDATE CASCADE. This column is named in
        // chk_messages_outbound_requires_approver, so both actions stay at NO ACTION. Nothing is lost:
        // ids are UUIDs that never change, and A14 says a user with work attached is
        // deactivated rather than deleted — which is exactly what RESTRICT enforces.
        onUpdate: 'NO ACTION',
        onDelete: 'RESTRICT',
      },
      sent_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('messages', ['lead_id', 'created_at'], {
      name: 'idx_messages_lead_created',
    });
    await queryInterface.addIndex('messages', ['contact_id'], { name: 'idx_messages_contact' });
    // A35: the retry worker scans for messages stuck in 'pending'.
    await queryInterface.addIndex('messages', ['send_status', 'created_at'], {
      name: 'idx_messages_status_created',
    });

    // Direction and status are not independent. Inbound is always 'received';
    // outbound only ever walks pending -> sent | failed. Letting the database reject
    // the impossible combinations means no code path can quietly invent one.
    await queryInterface.sequelize.query(`
      ALTER TABLE messages
      ADD CONSTRAINT chk_messages_direction_status
      CHECK (
        (direction = 'inbound'  AND send_status = 'received')
        OR
        (direction = 'outbound' AND send_status IN ('pending', 'sent', 'failed'))
      )
    `);

    // A34: the approval gate, enforced by the database rather than by convention.
    // An outbound message with no approver should be impossible to insert.
    await queryInterface.sequelize.query(`
      ALTER TABLE messages
      ADD CONSTRAINT chk_messages_outbound_requires_approver
      CHECK (direction = 'inbound' OR approved_by IS NOT NULL)
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('messages');
  },
};
