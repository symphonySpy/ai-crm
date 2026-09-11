'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { unauthorized } = require('../middleware/errors');
const { issueSession, clearSession, requireAuth } = require('../middleware/auth');
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
  message: { error: { code: 'too_many_requests', message: 'Too many login attempts.' } },
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const route = (handler) => (req, res, next) => handler(req, res, next).catch(next);

router.post(
  '/login',
  loginLimiter,
  validate({ body: loginBody }),
  route(async (req, res, next) => {
    const { user, reason } = await auth.verifyCredentials(req.body);

    if (!user) {
      // A15: the only place an IP is recorded, and only in the log where it expires.
      // It has a specific purpose here — recognising a distributed attempt — which is
      // exactly the justification a business table would lack.
      req.log.warn({ email: req.body.email, ip: req.ip, reason }, 'login failed');
      // The client is told nothing about which half was wrong. "No such user" and
      // "wrong password" together answer "does this account exist?".
      return next(unauthorized('Invalid email or password'));
    }

    issueSession(res, user);
    req.log.info({ userId: user.id, ip: req.ip }, 'login succeeded');
    return res.json({ user: user.toJSON() });
  }),
);

router.post('/logout', (req, res) => {
  clearSession(res);
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toJSON() }));

module.exports = router;
