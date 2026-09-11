const { DataTypes, Model } = require('sequelize');

// A32: line_user_id is unique and is the join key between an inbound LINE message
// and a CRM contact. A33: the LINE display name is captured but never overwrites a
// name a human has edited.
module.exports = (sequelize) => {
  class Contact extends Model {
    static associate(db) {
      Contact.belongsTo(db.Company, { as: 'company', foreignKey: 'company_id' });
      Contact.hasMany(db.Lead, { as: 'leads', foreignKey: 'contact_id' });
      Contact.hasMany(db.Message, { as: 'messages', foreignKey: 'contact_id' });
      Contact.belongsTo(db.User, { as: 'createdBy', foreignKey: 'created_by' });
      Contact.belongsTo(db.User, { as: 'updatedBy', foreignKey: 'updated_by' });
    }

    get displayName() {
      return this.name || this.line_display_name || 'Unknown contact';
    }
  }

  Contact.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(160), allowNull: false, validate: { notEmpty: true } },
      phone: { type: DataTypes.STRING(32), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true, validate: { isEmail: true } },
      line_user_id: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      line_display_name: { type: DataTypes.STRING(160), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    { sequelize, modelName: 'Contact', tableName: 'contacts' },
  );

  return Contact;
};
