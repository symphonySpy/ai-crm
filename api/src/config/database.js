require('dotenv').config();

// A40: no secret is ever committed. Every value below comes from the environment.
// A39: migrations are run as an explicit deploy step, never on application boot.
const base = {
  dialect: 'mysql',
  dialectOptions: {
    // A10: the connection speaks UTC. Presentation converts to Asia/Bangkok.
    timezone: 'Z',
    supportBigNumbers: true,
    // Stated explicitly rather than left to the driver's default. Thai content is the
    // normal case here, and a connection that negotiates a narrower charset silently
    // replaces every unrepresentable character with '?' — corruption that survives into
    // the database and cannot be recovered afterwards.
    charset: 'utf8mb4',
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
