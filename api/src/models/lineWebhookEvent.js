const { DataTypes, Model } = require('sequelize');
const { WEBHOOK_PROCESS_STATUSES } = require('../constants/enums');

// A30: webhook_event_id is the primary key, so idempotency is enforced by the database
// on insert. The handler does NOT read first and then write — that check has a race
// window under concurrent LINE retries, and a unique key does not.
//
// A31: the raw payload is stored before any processing so a delivery is never lost to a
// bug downstream. Replaying a failed event is then just re-running the processor.
module.exports = (sequelize) => {
  class LineWebhookEvent extends Model {
    static associate(db) {
      LineWebhookEvent.belongsTo(db.Message, { as: 'message', foreignKey: 'message_id' });
    }
  }

  LineWebhookEvent.init(
    {
      webhook_event_id: { type: DataTypes.STRING(64), primaryKey: true },
      destination: { type: DataTypes.STRING(64), allowNull: true },
      event_type: { type: DataTypes.STRING(40), allowNull: true },
      raw_payload: { type: DataTypes.JSON, allowNull: false },
      // A29: recorded for observability. A request that fails verification is rejected
      // with 401 and never reaches this table, so in practice this is always true —
      // the column exists so that a future replay path cannot lose the distinction.
      signature_valid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      process_status: {
        type: DataTypes.ENUM(...WEBHOOK_PROCESS_STATUSES),
        allowNull: false,
        defaultValue: 'received',
      },
      error_detail: { type: DataTypes.TEXT, allowNull: true },
      message_id: { type: DataTypes.UUID, allowNull: true },
      received_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      processed_at: { type: DataTypes.DATE, allowNull: true },
      // Filled by lib/authorship.js from the acting user. Null means the system acted.
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    { sequelize, modelName: 'LineWebhookEvent', tableName: 'line_webhook_events' },
  );

  return LineWebhookEvent;
};
