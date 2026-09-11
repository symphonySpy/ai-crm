const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize) => {
  class Company extends Model {
    static associate(db) {
      Company.hasMany(db.Contact, { as: 'contacts', foreignKey: 'company_id' });
      Company.hasMany(db.Lead, { as: 'leads', foreignKey: 'company_id' });
      Company.belongsTo(db.User, { as: 'createdBy', foreignKey: 'created_by' });
      Company.belongsTo(db.User, { as: 'updatedBy', foreignKey: 'updated_by' });
    }
  }

  Company.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(200), allowNull: false, validate: { notEmpty: true } },
      industry: { type: DataTypes.STRING(100), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // A12: human-authored rows carry authorship. System-authored tables do not.
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    { sequelize, modelName: 'Company', tableName: 'companies' },
  );

  return Company;
};
