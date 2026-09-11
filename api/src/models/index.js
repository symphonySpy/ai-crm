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
};

for (const model of Object.values(db)) {
  if (model && typeof model.associate === 'function') model.associate(db);
}

module.exports = db;
