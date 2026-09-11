'use strict';

require('dotenv').config();

const { createApp } = require('./app');
const db = require('./models');
const { logger } = require('./lib/logger');

const port = Number(process.env.PORT || 4000);

async function start() {
  // Fail at boot rather than on the first request. A process that starts happily and
  // then 500s on every call is harder to diagnose than one that never came up.
  await db.sequelize.authenticate();
  logger.info({ database: db.sequelize.config.database }, 'database connection established');

  // A33: migrations are NOT run here. Auto-migrating on boot is how one bad migration
  // takes down every instance at once, and it makes rollbacks a race.
  const app = createApp();
  const server = app.listen(port, () => logger.info({ port }, 'api listening'));

  const shutdown = (signal) => async () => {
    logger.info({ signal }, 'shutting down');
    // Stop accepting new work, let in-flight requests finish, then release the pool.
    // Dropping a half-written transaction on SIGTERM is how a deploy corrupts data.
    server.close(async () => {
      await db.sequelize.close();
      logger.info('shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('shutdown timed out, exiting');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT', shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
