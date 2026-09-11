'use strict';

const crypto = require('crypto');
const { logger } = require('../lib/logger');

// A41: one id follows a request from the first line of the log to the last, and comes
// back to the caller in a header. When someone reports "it failed at 14:32", that id is
// the difference between finding the failure and guessing at it.
function requestContext(req, res, next) {
  req.id = req.get('x-request-id') || crypto.randomUUID();
  res.set('x-request-id', req.id);
  req.log = logger.child({ requestId: req.id });

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    // One line per request, at a level that reflects the outcome: server faults are
    // errors, rejected input is a warning, everything else is routine.
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    req.log[level](
      {
        method: req.method,
        path: req.route ? req.baseUrl + req.route.path : req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        userId: req.user ? req.user.id : null,
      },
      'request',
    );
  });

  next();
}

module.exports = { requestContext };
