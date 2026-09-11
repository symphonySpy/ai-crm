'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { unauthorized } = require('../middleware/errors');
const { issueSession, clearSession, requireAuth } = require('../middleware/auth');
const { ok, noContent } = require('../lib/api-response');
const auth = require('../services/auth-service');

const router = express.Router();

// Credential stuffing is the one attack this service will certainly see if it is ever
// reachable. Ten attempts per quarter hour per address is generous for a person and
// useless for a script.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Matches the envelope every other endpoint uses. A limiter that answers in its own
  // shape is the one response a client forgets to handle.
  message: {
    success: false,
    code: 429,
    message: 'Too many login attempts. Try again later.',
    errors: null,
    data: null,
  },
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/login',
  loginLimiter,
  validate({ body: loginBody }),
  async (req, res, next) => {
    try {
      const { user, reason } = await auth.verifyCredentials(req.body);

      if (!user) {
        // A15: the only place an IP is recorded, and only in the log where it expires.
        // It has a specific purpose here — recognising a distributed attempt — which
        // is exactly the justification a business table would lack.
        req.log.warn({ email: req.body.email, ip: req.ip, reason }, 'login failed');
        // The client is told nothing about which half was wrong. "No such user" and
        // "wrong password" together answer "does this account exist?".
        return next(unauthorized('Invalid email or password'));
      }

      issueSession(res, user);
      req.log.info({ userId: user.id, ip: req.ip }, 'login succeeded');
      return ok(res, { user: user.toJSON() }, 'Signed in');
    } catch (err) {
      return next(err);
    }
  },
);

router.post('/logout', (req, res) => {
  clearSession(res);
  // 204 carries no body by definition, so the envelope does not apply here.
  return noContent(res);
});

router.get('/me', requireAuth, (req, res) => ok(res, { user: req.user.toJSON() }, 'Current user'));

module.exports = router;
