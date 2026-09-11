'use strict';

const authorFk = (Sequelize) => ({
  type: Sequelize.UUID,
  allowNull: true,
  references: { model: 'users', key: 'id' },
  onUpdate: 'CASCADE',
  // A14: a user row is never deleted, but if one ever were, authorship becomes
  // unknown rather than taking the company row down with it.
  onDelete: 'SET NULL',
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('companies', {
      id: { type: Sequelize.UUID, primaryKey: true },
      name: { type: Sequelize.STRING(200), allowNull: false },
      industry: { type: Sequelize.STRING(100), allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: authorFk(Sequelize),
      updated_by: authorFk(Sequelize),
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('companies', ['name'], { name: 'idx_companies_name' });
    await queryInterface.addIndex('companies', ['is_active'], { name: 'idx_companies_is_active' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('companies');
  },
};
