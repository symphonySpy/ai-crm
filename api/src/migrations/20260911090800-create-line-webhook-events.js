'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('line_webhook_events', {
      // A30: THIS is the idempotency mechanism. LINE's own event id is the primary
      // key, so a redelivery fails on insert with a unique-constraint violation that
      // the handler treats as "already seen". No read-then-write, no race window.
      webhook_event_id: { type: Sequelize.STRING(64), primaryKey: true },
      destination: { type: Sequelize.STRING(64), allowNull: true },
      event_type: { type: Sequelize.STRING(40), allowNull: true },
      // A31: stored before processing, so a bug downstream delays a message instead
      // of losing it. Replay is re-running the processor over this column.
      raw_payload: { type: Sequelize.JSON, allowNull: false },
      signature_valid: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      process_status: {
        type: Sequelize.ENUM('received', 'processed', 'ignored', 'failed'),
        allowNull: false,
        defaultValue: 'received',
      },
      error_detail: { type: Sequelize.TEXT, allowNull: true },
      message_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'messages', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      received_at: { type: Sequelize.DATE, allowNull: false },
      processed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    // A42: "webhook processing lag" and "events stuck in received" are both alerting
    // signals, and both are read off this index.
    await queryInterface.addIndex('line_webhook_events', ['process_status', 'received_at'], {
      name: 'idx_line_events_status_received',
    });
    await queryInterface.addIndex('line_webhook_events', ['message_id'], {
      name: 'idx_line_events_message',
    });

    // A processed event must record when it finished; anything else is an unfinished
    // event that would otherwise look complete.
    await queryInterface.sequelize.query(`
      ALTER TABLE line_webhook_events
      ADD CONSTRAINT chk_line_events_processed_has_timestamp
      CHECK (process_status <> 'processed' OR processed_at IS NOT NULL)
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('line_webhook_events');
  },
};
