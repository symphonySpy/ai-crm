'use strict';

// Delete rest_log rows past the retention window.
//
//   npm run logs:prune            # 90 days, the documented default (A15)
//   npm run logs:prune -- --days 30
//
// Deliberately a command rather than something the application does on a timer. A
// process that deletes rows on its own schedule is a process that deletes rows during an
// incident, while someone is reading them. Running it from a scheduled job means the
// deletion is visible in the job history and can be paused without a deploy.

require('dotenv').config();
const db = require('../src/models');
const { logger } = require('../src/lib/logger');

const arg = process.argv.indexOf('--days');
const days = arg > -1 ? Number(process.argv[arg + 1]) : 90;

if (!Number.isInteger(days) || days < 1) {
  logger.error({ days: process.argv[arg + 1] }, '--days must be a positive whole number');
  process.exit(1);
}

db.RestLog.prune({ olderThanDays: days })
  .then((removed) => {
    logger.info({ removed, olderThanDays: days }, 'rest_log pruned');
  })
  .catch((err) => {
    logger.error({ err }, 'rest_log prune failed');
    process.exitCode = 1;
  })
  .finally(() => db.sequelize.close());
