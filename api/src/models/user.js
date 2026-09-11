const { DataTypes, Model } = require('sequelize');
const { USER_ROLES } = require('../constants/enums');

// A14: users are never hard deleted. Deactivating keeps every lead and activity
// that references them intact.
module.exports = (sequelize) => {
  class User extends Model {
    static associate(db) {
      User.hasMany(db.Lead, { as: 'ownedLeads', foreignKey: 'owner_id' });
      User.hasMany(db.Activity, { as: 'activities', foreignKey: 'actor_id' });
    }

    toJSON() {
      const { password_hash: _omit, ...rest } = super.toJSON();
      return rest;
    }
  }

  User.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true, notEmpty: true },
      },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false, validate: { notEmpty: true } },
      role: { type: DataTypes.ENUM(...USER_ROLES), allowNull: false, defaultValue: 'sales' },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // Filled by lib/authorship.js from the acting user. Null means the system acted.
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      defaultScope: { attributes: { exclude: ['password_hash'] } },
      scopes: { withSecret: { attributes: { include: ['password_hash'] } } },
    },
  );

  return User;
};
