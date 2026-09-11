'use strict';

// Every API call, with what came in and what went back.
//
// This is an OPERATIONAL table, not a business one. It exists to answer "which endpoint
// did that screen call, what did it send, and what did it get back?" without attaching a
// debugger to production — the question that otherwise costs an afternoon of guessing.
//
// Two consequences follow from it being operational, and both are enforced elsewhere:
//
//   1. Sensitive values never reach it. Passwords, tokens, cookies and the LINE
//      signature are replaced before the row is built (lib/redact.js), as are the
//      personal fields that belong in the business tables and nowhere else.
//   2. It has a retention policy. A per-request table grows without bound, and an
//      unbounded copy of request traffic becomes both a cost and a liability. Rows older
//      than 90 days are pruned by `npm run logs:prune` (A15).

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('rest_log', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      // The same id that appears in the structured logs and in the x-request-id header,
      // so one identifier ties a row here to every log line the request produced.
      request_id: { type: Sequelize.STRING(64), allowNull: false },
      method: { type: Sequelize.STRING(10), allowNull: false },
      // The concrete URL that was called.
      path: { type: Sequelize.STRING(512), allowNull: false },
      // The matched route pattern (/api/leads/:id). Storing both means you can group by
      // endpoint without parsing ids back out of thousands of distinct paths.
      route: { type: Sequelize.STRING(255), allowNull: true },
      status_code: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false },
      duration_ms: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      query_json: { type: Sequelize.JSON, allowNull: true },
      request_body: { type: Sequelize.JSON, allowNull: true },
      response_body: { type: Sequelize.JSON, allowNull: true },
      // Null for anonymous calls — a failed login, a health check.
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'NO ACTION',
        onDelete: 'RESTRICT',
      },
      // A15: an IP belongs in an operational log with a retention policy, not in a
      // business table. This table has one.
      ip: { type: Sequelize.STRING(45), allowNull: true },
      user_agent: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE(3), allowNull: false },
    });

    // "What happened around 14:32?" is the most common question this table answers.
    await queryInterface.addIndex('rest_log', ['created_at'], { name: 'idx_rest_log_created' });
    // "Show me the failures" and "how slow is this endpoint" both read off these.
    await queryInterface.addIndex('rest_log', ['status_code', 'created_at'], {
      name: 'idx_rest_log_status',
    });
    await queryInterface.addIndex('rest_log', ['route', 'created_at'], {
      name: 'idx_rest_log_route',
    });
    // Following one user's session, or one request across the structured logs.
    await queryInterface.addIndex('rest_log', ['user_id', 'created_at'], {
      name: 'idx_rest_log_user',
    });
    await queryInterface.addIndex('rest_log', ['request_id'], { name: 'idx_rest_log_request' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('rest_log');
  },
};
