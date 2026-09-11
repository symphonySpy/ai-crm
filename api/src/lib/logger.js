'use strict';

const pino = require('pino');

// A41: structured JSON logs with a request id carried through the request lifecycle.
//
// The redaction list is the point. A CRM log is one careless line away from becoming an
// unmanaged second copy of customer conversations — searchable, backed up, and outside
// every deletion request the business answers. So message bodies, phone numbers, email
// addresses and LINE user ids never reach the log; identifiers and lengths do, which is
// all that debugging actually needs.
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-line-signature"]',
      'req.body.password',
      'req.body.body',
      'req.body.phone',
      'req.body.email',
      '*.password',
      '*.password_hash',
      '*.line_user_id',
      '*.body',
    ],
    censor: '[redacted]',
  },
  base: { service: 'ai-crm-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = { logger };
