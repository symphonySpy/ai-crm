const { Sequelize } = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const sequelize = new Sequelize(config[env]);

const db = {
  sequelize,
  Sequelize,
  User: require('./user')(sequelize),
  Company: require('./company')(sequelize),
  Contact: require('./contact')(sequelize),
  Lead: require('./lead')(sequelize),
  Activity: require('./activity')(sequelize),
  Message: require('./message')(sequelize),
  AiSuggestion: require('./aiSuggestion')(sequelize),
  LineWebhookEvent: require('./lineWebhookEvent')(sequelize),
  AuditHistory: require('./auditHistory')(sequelize),
  RestLog: require('./restLog')(sequelize),
};

for (const model of Object.values(db)) {
  if (model && typeof model.associate === 'function') model.associate(db);
}

// Stamps created_by / updated_by from the acting user on every table that has them.
require('../lib/authorship').attachAuthorship(db);

// Every update and soft delete on an audited table is recorded in tbl_audit_history,
// so "what did this look like before, and who changed it?" always has an answer.
require('../lib/audit-history').attachAuditHistory(db);

// Freezes the related records each row was attached to, at the moment it was written.
// Maintained solely by these hooks — application code never writes the *_json columns.
require('../lib/entity-snapshots').attachEntitySnapshots(db);

module.exports = db;
