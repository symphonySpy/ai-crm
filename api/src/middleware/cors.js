'use strict';

const cors = require('cors');
const { logger } = require('../lib/logger');

/**
 * Cross-origin access, allowlisted.
 *
 * In the normal deployment the browser never makes a cross-origin call at all — the
 * Next.js server proxies /api, so requests arrive without an Origin header and this
 * middleware waves them through. That is what makes this defence in depth rather than
 * the mechanism something depends on: it exists for the day someone points a second
 * front-end, a mobile app, or an internal tool at this API directly.
 *
 * Deny by default. An empty CORS_ORIGINS means no cross-origin browser access, which is
 * the correct posture for an API whose only intended client is its own proxy. The
 * failure mode of getting this backwards — reflecting whatever Origin arrives, which is
 * what `cors()` with no options does — is that any website a signed-in salesperson
 * visits can call this API as them, cookies attached.
 */
const parseOrigins = () =>
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

function buildCors() {
  const allowed = parseOrigins();

  if (allowed.length) {
    logger.info({ allowed }, 'CORS: cross-origin browser access allowed for these origins');
  } else {
    logger.info('CORS: no origins allowed; same-origin and proxied requests only');
  }

  return cors({
    origin(origin, callback) {
      // No Origin header: curl, a server-to-server call, the Next.js proxy, LINE's
      // webhook. The same-origin policy does not apply to these, so refusing them here
      // would block legitimate traffic without protecting anything.
      if (!origin) return callback(null, true);

      const normalised = origin.replace(/\/$/, '');
      if (allowed.includes(normalised)) return callback(null, true);

      // Deliberately not an error. Returning `false` omits the CORS headers, which is
      // exactly what makes the browser block the response — and it does so without
      // turning a probe into a 500 that would pollute the error rate.
      logger.warn({ origin }, 'CORS: rejected cross-origin request');
      return callback(null, false);
    },
    // Required for the session cookie to travel on an allowed cross-origin request.
    // It is safe only because the origin list above is explicit — `credentials: true`
    // combined with a reflected origin is the classic way to hand an API away.
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
}

module.exports = { buildCors, parseOrigins };
