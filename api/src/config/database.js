require('dotenv').config();

// A40: no secret is ever committed. Every value below comes from the environment.
// A39: migrations are run as an explicit deploy step, never on application boot.
const base = {
  dialect: 'mysql',
  dialectOptions: {
    // A10: the connection speaks UTC. Presentation converts to Asia/Bangkok.
    timezone: 'Z',
    supportBigNumbers: true,
  },
  timezone: '+00:00',
  define: {
    underscored: true,
    freezeTableName: true,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },
  pool: { max: 10, min: 0, idle: 10000, acquire: 30000 },
  logging: false,
};

const fromEnv = () => ({
  ...base,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
});

module.exports = {
  development: fromEnv(),
  test: {
    ...fromEnv(),
    database: process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test`,
  },
  production: {
    ...fromEnv(),
    dialectOptions: {
      ...base.dialectOptions,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    },
  },
};
