const { DataTypes, Model } = require('sequelize');
const { ACTIVITY_TYPES, LEAD_STAGES } = require('../constants/enums');

// A16: this table is the business audit trail. It is append-only — nothing here is
// ever updated or deleted, which is why it carries no is_active and no updated_by.
//
// from_stage and to_stage store the stage VALUE, not a foreign key. That is a
// deliberate point-in-time stamp: if the pipeline is ever renamed, old history still
// reads correctly. The same reasoning drives context_snapshot on ai_suggestions.
module.exports = (sequelize) => {
  class Activity extends Model {
    static associate(db) {
      Activity.belongsTo(db.Lead, { as: 'lead', foreignKey: 'lead_id' });
      // actor_id is null when the system acted (inbound LINE message, lead auto-created).
      Activity.belongsTo(db.User, { as: 'actor', foreignKey: 'actor_id' });
    }
  }

  Activity.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      lead_id: { type: DataTypes.UUID, allowNull: false },
      actor_id: { type: DataTypes.UUID, allowNull: true },
      type: { type: DataTypes.ENUM(...ACTIVITY_TYPES), allowNull: false },
      from_stage: { type: DataTypes.ENUM(...LEAD_STAGES), allowNull: true },
      to_stage: { type: DataTypes.ENUM(...LEAD_STAGES), allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      // The lead and the actor as they stood when this event happened. Captured once at
      // creation, because this row describes a moment that never changes.
      lead_data_json: { type: DataTypes.JSON, allowNull: true },
      actor_data_json: { type: DataTypes.JSON, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Activity',
      tableName: 'activities',
      updatedAt: false,
    },
  );

  return Activity;
};
