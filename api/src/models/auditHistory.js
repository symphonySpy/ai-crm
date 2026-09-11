const { DataTypes, Model, Op } = require('sequelize');
const { AUDITED_TABLES, AUDIT_ACTIONS } = require('../constants/audit');

// Append-only record of every update and soft delete on an audited table.
// Written only by lib/audit-history.js — nothing else inserts here.
module.exports = (sequelize) => {
  class AuditHistory extends Model {
    static associate(db) {
      AuditHistory.belongsTo(db.User, { as: 'changedBy', foreignKey: 'changed_by' });
    }

    /**
     * What a field held at a point in time.
     *
     * Works backwards from the live value: the oldest entry recorded after `at` carries,
     * in its old_json, the value that was in force at `at`. If nothing has changed since,
     * the current value is the answer. The live row stays the source of truth for the
     * present; this table only explains how it got there.
     */
    static async valueAt({ tableName, entityId, field, at, currentValue }) {
      const later = await AuditHistory.findAll({
        where: {
          table_name: tableName,
          entity_id: String(entityId),
          changed_at: { [Op.gt]: at },
        },
        order: [['changed_at', 'ASC'], ['id', 'ASC']],
      });
      for (const entry of later) {
        if (Object.prototype.hasOwnProperty.call(entry.old_json || {}, field)) {
          return entry.old_json[field];
        }
      }
      return currentValue;
    }

    /** Full history of one row, newest first, for an audit screen or a support answer. */
    static historyFor({ tableName, entityId, limit = 50 }) {
      return AuditHistory.findAll({
        where: { table_name: tableName, entity_id: String(entityId) },
        order: [['changed_at', 'DESC'], ['id', 'DESC']],
        limit,
      });
    }
  }

  AuditHistory.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      table_name: { type: DataTypes.ENUM(...AUDITED_TABLES), allowNull: false },
      entity_id: { type: DataTypes.STRING(64), allowNull: false },
      action: {
        type: DataTypes.ENUM(...AUDIT_ACTIONS),
        allowNull: false,
        defaultValue: 'update',
      },
      old_json: { type: DataTypes.JSON, allowNull: false },
      new_json: { type: DataTypes.JSON, allowNull: false },
      changed_by: { type: DataTypes.UUID, allowNull: true },
      changed_at: { type: DataTypes.DATE(3), allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: 'AuditHistory',
      tableName: 'tbl_audit_history',
      updatedAt: false,
    },
  );

  return AuditHistory;
};
