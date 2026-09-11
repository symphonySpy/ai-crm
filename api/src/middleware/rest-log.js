'use strict';

const db = require('../models');
const { redactForStorage } = require('../lib/redact');

// Paths with no diagnostic value and a very high call rate. A platform health check runs
// every few seconds; logging it would bury the traffic that matters under noise and pay
// for the privilege.
const SKIP_PATHS = new Set(['/health', '/ready', '/favicon.ico']);

/**
 * Remember where a router was mounted.
 *
 * Express resets req.baseUrl once a router finishes, so by the time `finish` fires it is
 * empty — which is why an error response would otherwise be filed under "/:id" instead
 * of "/api/leads/:id". Capturing the mount path on the way IN, while it is still
 * correct, makes the stored route pattern the same for a 200 and a 404 on the same
 * endpoint. Without that, grouping by endpoint silently splits every error out of its
 * own bucket.
 */
const captureMount = (req, res, next) => {
  req.mountPath = req.baseUrl;
  next();
};

/**
 * Record every API call — what came in, what went back, how long it took.
 *
 * Three rules shape this middleware, and each one comes from a way that request logging
 * usually goes wrong:
 *
 *   1. It writes AFTER the response is sent. Nothing here is allowed to slow down or
 *      delay an answer to a user; the row is built on `finish` and inserted without the
 *      request waiting for it.
 *
 *   2. A logging failure never becomes a request failure. If the insert throws — the
 *      table is missing, the pool is exhausted — it is reported to the structured log
 *      and the request is still a success. A diagnostic tool that can take down the
 *      service it observes is worse than no tool.
 *
 *   3. Values are redacted before the row is built, not after. Passwords, tokens,
 *      cookies and the personal fields that belong in the business tables never reach
 *      this table at all (lib/redact.js).
 */


function restLog(req, res, next) {
  if (process.env.REST_LOG_ENABLED === 'false') return next();
  if (SKIP_PATHS.has(req.path)) return next();

  const startedAt = process.hrtime.bigint();

  // The response body is only available by intercepting the send. Capturing the value
  // rather than re-serialising it later keeps this honest: what gets stored is exactly
  // what the client was given.
  let responsePayload = null;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    responsePayload = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    const durationMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);

    // Fire and forget, deliberately: the response has already been sent, so there is
    // nobody left to tell about a failure except the log.
    db.RestLog.create({
      request_id: req.id,
      method: req.method,
      path: req.originalUrl.slice(0, 512),
      // req.route is only populated once a route has matched, which is exactly when it
      // is useful. A 404 against no route legitimately has none.
      route: req.route
        ? `${req.mountPath || req.baseUrl}${req.route.path}`.replace(/\/$/, '').slice(0, 255) ||
          '/'
        : null,
      status_code: res.statusCode,
      duration_ms: durationMs,
      query_json: Object.keys(req.query || {}).length ? redactForStorage(req.query) : null,
      request_body:
        req.body && Object.keys(req.body).length ? redactForStorage(req.body) : null,
      response_body: redactForStorage(responsePayload),
      user_id: req.user ? req.user.id : null,
      ip: req.ip ? req.ip.slice(0, 45) : null,
      user_agent: (req.get('user-agent') || '').slice(0, 255) || null,
      created_at: new Date(),
    }).catch((err) => {
      req.log.warn({ err: err.message }, 'rest_log insert failed');
    });
  });

  return next();
}

module.exports = { restLog, captureMount, SKIP_PATHS };
