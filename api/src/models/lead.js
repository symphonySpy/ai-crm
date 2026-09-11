const { DataTypes, Model } = require('sequelize');
const { LEAD_STAGES, LEAD_SOURCES } = require('../constants/enums');

// A6: a lead carries stage and value, so a qualified lead is the deal. There is no
// separate Deal table. A14: leads have no is_active — the 'Lost' stage is the
// terminal state, and a second flag on top of it would only create ambiguity.
module.exports = (sequelize) => {
  class Lead extends Model {
    static associate(db) {
      Lead.belongsTo(db.Contact, { as: 'contact', foreignKey: 'contact_id' });
      Lead.belongsTo(db.Company, { as: 'company', foreignKey: 'company_id' });
      Lead.belongsTo(db.User, { as: 'owner', foreignKey: 'owner_id' });
      Lead.hasMany(db.Activity, { as: 'activities', foreignKey: 'lead_id' });
      Lead.hasMany(db.Message, { as: 'messages', foreignKey: 'lead_id' });
      Lead.hasMany(db.AiSuggestion, { as: 'aiSuggestions', foreignKey: 'lead_id' });
      Lead.belongsTo(db.User, { as: 'createdBy', foreignKey: 'created_by' });
      Lead.belongsTo(db.User, { as: 'updatedBy', foreignKey: 'updated_by' });
    }
  }

  Lead.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      contact_id: { type: DataTypes.UUID, allowNull: false },
      company_id: { type: DataTypes.UUID, allowNull: true },
      // A32: a lead created from an unknown LINE sender has no owner yet and is
      // flagged for triage rather than silently assigned to someone.
      owner_id: { type: DataTypes.UUID, allowNull: true },
      title: { type: DataTypes.STRING(200), allowNull: false, validate: { notEmpty: true } },
      stage: { type: DataTypes.ENUM(...LEAD_STAGES), allowNull: false, defaultValue: 'New' },
      // A9: whole Thai Baht, unsigned so the database rejects negative deal values.
      value_thb: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
      source: { type: DataTypes.ENUM(...LEAD_SOURCES), allowNull: false, defaultValue: 'manual' },
      needs_triage: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      last_contact_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    { sequelize, modelName: 'Lead', tableName: 'leads' },
  );

  return Lead;
};
