const { DataTypes, Model } = require('sequelize');

// Append-only history of tracked field changes. See constants/tracked-fields.js for
// which fields are recorded and why, and lib/change-tracking.js for how.
module.exports = (sequelize) => {
  class FieldChangeLog extends Model {
    static associate(db) {
      FieldChangeLog.belongsTo(db.User, { as: 'changedBy', foreignKey: 'changed_by' });
    }

    /**
     * Reconstruct what a field held at a point in time.
     *
     * Works backwards from the current value: every change recorded *after* the
     * timestamp is undone in reverse order. That way the live row stays the single
     * source of truth for the present, and this table only explains how it got there.
     */
    static async valueAt(sequelizeModels, { entityType, entityId, field, at, currentValue }) {
      const later = await FieldChangeLog.findAll({
        where: {
          entity_type: entityType,
          entity_id: entityId,
          field,
          changed_at: { [sequelize.Sequelize.Op.gt]: at },
        },
        order: [['changed_at', 'ASC']],
      });
      // The oldest change after `at` carries the value as it was before that change,
      // which is precisely the value in force at `at`.
      return later.length ? later[0].old_value : currentValue;
    }
  }

  FieldChangeLog.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      entity_type: { type: DataTypes.ENUM('company', 'contact', 'lead'), allowNull: false },
      entity_id: { type: DataTypes.UUID, allowNull: false },
      field: { type: DataTypes.STRING(64), allowNull: false },
      old_value: { type: DataTypes.TEXT, allowNull: true },
      new_value: { type: DataTypes.TEXT, allowNull: true },
      changed_by: { type: DataTypes.UUID, allowNull: true },
      changed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'FieldChangeLog',
      tableName: 'field_change_log',
      updatedAt: false,
    },
  );

  return FieldChangeLog;
};
