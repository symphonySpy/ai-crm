const { DataTypes, Model } = require('sequelize');
const {
  MESSAGE_DIRECTIONS,
  MESSAGE_CONTENT_TYPES,
  MESSAGE_SEND_STATUSES,
} = require('../constants/enums');

// A30: line_message_id is unique, so a redelivered LINE message cannot create a
// duplicate row even under concurrent retries.
// A34: an outbound row only exists after a human approved the draft — approved_by is
// therefore mandatory for outbound and meaningless for inbound. The database enforces
// that pairing with a CHECK constraint (see the migration).
module.exports = (sequelize) => {
  class Message extends Model {
    static associate(db) {
      Message.belongsTo(db.Lead, { as: 'lead', foreignKey: 'lead_id' });
      Message.belongsTo(db.Contact, { as: 'contact', foreignKey: 'contact_id' });
      Message.belongsTo(db.User, { as: 'approvedBy', foreignKey: 'approved_by' });
      Message.hasOne(db.LineWebhookEvent, { as: 'sourceEvent', foreignKey: 'message_id' });
    }
  }

  Message.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      lead_id: { type: DataTypes.UUID, allowNull: false },
      contact_id: { type: DataTypes.UUID, allowNull: false },
      direction: { type: DataTypes.ENUM(...MESSAGE_DIRECTIONS), allowNull: false },
      channel: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'line' },
      // A37: non-text content records its type and renders as a placeholder.
      content_type: {
        type: DataTypes.ENUM(...MESSAGE_CONTENT_TYPES),
        allowNull: false,
        defaultValue: 'text',
      },
      body: { type: DataTypes.TEXT, allowNull: true },
      line_message_id: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      send_status: { type: DataTypes.ENUM(...MESSAGE_SEND_STATUSES), allowNull: false },
      // A35: up to three attempts, and a stuck message stays visible rather than vanishing.
      attempt_count: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      error_detail: { type: DataTypes.TEXT, allowNull: true },
      approved_by: { type: DataTypes.UUID, allowNull: true },
      sent_at: { type: DataTypes.DATE, allowNull: true },
    },
    { sequelize, modelName: 'Message', tableName: 'messages' },
  );

  return Message;
};
