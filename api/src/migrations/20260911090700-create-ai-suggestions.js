'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_suggestions', {
      id: { type: Sequelize.UUID, primaryKey: true },
      lead_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'leads', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      kind: {
        type: Sequelize.ENUM('copilot_bundle'),
        allowNull: false,
        defaultValue: 'copilot_bundle',
      },
      // A23: summary, score with per-criterion reasons, next_best_action, draft_line_reply.
      payload: { type: Sequelize.JSON, allowNull: false },
      // Point-in-time stamp of the lead data the model was shown. Without it, "why did
      // it score 82?" is unanswerable once the lead is edited.
      context_snapshot: { type: Sequelize.JSON, allowNull: false },
      model: { type: Sequelize.STRING(80), allowNull: true },
      prompt_version: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'v1' },
      // A25: true when the rule-based fallback produced this instead of the model.
      degraded: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      status: {
        type: Sequelize.ENUM('proposed', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'proposed',
      },
      // A27: a human always asks. Nothing here is generated automatically on inbound.
      requested_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      decided_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        // MySQL forbids a CHECK constraint on any column that carries a foreign key
        // referential action, including ON UPDATE CASCADE. This column is named in
        // chk_ai_suggestions_decision_is_attributed, so both actions stay at NO ACTION. Nothing is lost:
        // ids are UUIDs that never change, and A14 says a user with work attached is
        // deactivated rather than deleted — which is exactly what RESTRICT enforces.
        onUpdate: 'NO ACTION',
        onDelete: 'RESTRICT',
      },
      decided_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('ai_suggestions', ['lead_id', 'created_at'], {
      name: 'idx_ai_suggestions_lead_created',
    });
    await queryInterface.addIndex('ai_suggestions', ['status'], {
      name: 'idx_ai_suggestions_status',
    });

    // A22: the approval boundary, enforced by the database. A row that claims to be
    // approved or rejected must name who decided and when; a proposal must not.
    // This is what stops a bug from marking AI output as human-confirmed.
    await queryInterface.sequelize.query(`
      ALTER TABLE ai_suggestions
      ADD CONSTRAINT chk_ai_suggestions_decision_is_attributed
      CHECK (
        (status =  'proposed' AND decided_by IS NULL     AND decided_at IS NULL)
        OR
        (status <> 'proposed' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
      )
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_suggestions');
  },
};
