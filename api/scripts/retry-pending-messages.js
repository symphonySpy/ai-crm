'use strict';

// Send outbound messages left in 'pending'.
//
//   npm run messages:retry
//   npm run messages:retry -- --limit 50
//
// The per-request path already retries three times before giving up (A35). This covers
// the gap that path cannot: a process killed between creating the message row and
// finishing the send. Those rows are visible in the UI as pending rather than silently
// lost, and this is what clears them.
//
// A command rather than a timer inside the application, for the same reason as the log
// prune: work that runs on its own schedule is work that runs during an incident.

require('dotenv').config();
const db = require('../src/models');
const { logger } = require('../src/lib/logger');
const { retryPending } = require('../src/services/line-outbound-service');

const arg = process.argv.indexOf('--limit');
const limit = arg > -1 ? Number(process.argv[arg + 1]) : 20;

if (!Number.isInteger(limit) || limit < 1) {
  logger.error({ limit: process.argv[arg + 1] }, '--limit must be a positive whole number');
  process.exit(1);
}

retryPending({ limit })
  .then(({ examined, sent }) => {
    logger.info({ examined, sent, failed: examined - sent }, 'pending messages processed');
  })
  .catch((err) => {
    logger.error({ err }, 'retry run failed');
    process.exitCode = 1;
  })
  .finally(() => db.sequelize.close());
