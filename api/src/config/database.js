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

/**
 * Managed platforms hand out one connection URL rather than five separate variables —
 * Railway calls it MYSQL_URL, most others DATABASE_URL. Reading the URL when it is
 * present means the deployment is configured by referencing the database service, with
 * no credentials copied by hand into a second place to drift out of date.
 *
 * The discrete variables stay supported because that is what a local .env uses.
 */
const connectionUrl = () => process.env.MYSQL_URL || process.env.DATABASE_URL || null;

const fromUrl = (url) => {
  const parsed = new URL(url);
  return {
    ...base,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
  };
};

const fromParts = () => ({
  ...base,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
});

const resolve = () => {
  const url = connectionUrl();
  return url ? fromUrl(url) : fromParts();
};

module.exports = {
  development: resolve(),
  test: {
    ...resolve(),
    database: process.env.DB_NAME_TEST || `${process.env.DB_NAME || 'ai_crm'}_test`,
  },
  production: (() => {
    const config = resolve();
    return {
      ...config,
      dialectOptions: {
        ...config.dialectOptions,
        // Managed MySQL is usually reached over the platform's private network, where
        // TLS is not in play; DB_SSL is here for the deployments where it is.
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
      },
    };
  })(),
};
