'use strict';

const authorFk = (Sequelize) => ({
  type: Sequelize.UUID,
  allowNull: true,
  references: { model: 'users', key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: 'SET NULL',
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('contacts', {
      id: { type: Sequelize.UUID, primaryKey: true },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      name: { type: Sequelize.STRING(160), allowNull: false },
      phone: { type: Sequelize.STRING(32), allowNull: true },
      email: { type: Sequelize.STRING(255), allowNull: true },
      // A32: the join key from an inbound LINE message to a CRM contact. Unique, so a
      // returning sender can never produce a second contact row.
      line_user_id: { type: Sequelize.STRING(64), allowNull: true, unique: true },
      line_display_name: { type: Sequelize.STRING(160), allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: authorFk(Sequelize),
      updated_by: authorFk(Sequelize),
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('contacts', ['company_id'], { name: 'idx_contacts_company' });
    await queryInterface.addIndex('contacts', ['name'], { name: 'idx_contacts_name' });
    await queryInterface.addIndex('contacts', ['is_active'], { name: 'idx_contacts_is_active' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('contacts');
  },
};
