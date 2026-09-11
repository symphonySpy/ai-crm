'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { type: Sequelize.UUID, primaryKey: true },
      email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      role: {
        type: Sequelize.ENUM('sales', 'manager'),
        allowNull: false,
        defaultValue: 'sales',
      },
      // A14: deactivate instead of delete, so leads and activities keep their author.
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('users', ['is_active'], { name: 'idx_users_is_active' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};
