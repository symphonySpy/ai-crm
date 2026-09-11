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
  FieldChangeLog: require('./fieldChangeLog')(sequelize),
};

for (const model of Object.values(db)) {
  if (model && typeof model.associate === 'function') model.associate(db);
}

// Records changes to the fields listed in constants/tracked-fields.js, so a question
// like "what was this company called when we closed that deal?" has an answer without
// copying the company name into every table that references it.
require('../lib/change-tracking').attachChangeTracking(db);

module.exports = db;
