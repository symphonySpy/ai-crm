'use strict';

const db = require('../models');
const { unauthorized, forbidden } = require('./errors');

const SESSION_COOKIE = 'ai_crm_session';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // one working day

// A1: the session is a signed, httpOnly cookie. Signing is done by cookie-parser with
// SESSION_SECRET, so a tampered cookie is rejected before it is read.
//
// TRADE-OFF, stated plainly: this is stateless. There is no server-side session store,
// which means a session cannot be revoked before it expires — logging out clears the
// cookie on that browser and nothing more. For an internal tool with a 12-hour window
// and synthetic data that is an acceptable exchange for not adding a session table and
// a store dependency. A production deployment handling real customer data should keep
// sessions server-side so that "log this person out everywhere" is possible; it is in
// the production next steps.
const cookieOptions = () => ({
  httpOnly: true,
  signed: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_MAX_AGE_MS,
  path: '/',
});

const issueSession = (res, user) => {
  res.cookie(
    SESSION_COOKIE,
    JSON.stringify({ userId: user.id, issuedAt: Date.now() }),
    cookieOptions(),
  );
};

const clearSession = (res) => {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
};

/**
 * Loads the signed-in user onto req.user when a valid cookie is present.
 *
 * Never rejects — routes decide whether authentication is required. The user is read
 * from the database on every request rather than trusted from the cookie, so a
 * deactivated account stops working immediately instead of at cookie expiry.
 */
async function attachUser(req, res, next) {
  try {
    const raw = req.signedCookies && req.signedCookies[SESSION_COOKIE];
    if (!raw) return next();

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      clearSession(res);
      return next();
    }

    if (!payload.userId || Date.now() - payload.issuedAt > SESSION_MAX_AGE_MS) {
      clearSession(res);
      return next();
    }

    const user = await db.User.findByPk(payload.userId);
    if (!user || !user.is_active) {
      clearSession(res);
      return next();
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

const requireAuth = (req, res, next) =>
  (req.user ? next() : next(unauthorized()));

// A3: coarse by design. `manager` may do anything; `sales` is restricted only where
// getting it wrong reaches a customer — sending a LINE message on someone else's lead.
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden(`Requires role: ${roles.join(' or ')}`));
  return next();
};

module.exports = {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  issueSession,
  clearSession,
  attachUser,
  requireAuth,
  requireRole,
};
