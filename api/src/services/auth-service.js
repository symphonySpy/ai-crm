'use strict';

const bcrypt = require('bcryptjs');
const db = require('../models');

// A hash of a value nobody can supply. Comparing against it when the email is unknown
// keeps the work — and therefore the response time — the same as a real failed login.
// Answering faster for an address that does not exist tells an attacker which addresses do.
const DUMMY_HASH = '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv';

/**
 * Verify credentials.
 *
 * Returns { user } on success, or { user: null, reason } on failure. The reason is for
 * the log only — the caller must not hand it to the client, because "wrong password"
 * and "no such user" are different answers to the question "does this account exist?".
 */
async function verifyCredentials({ email, password }) {
  const user = await db.User.scope('withSecret').findOne({ where: { email } });
  const passwordMatches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

  if (!user) return { user: null, reason: 'unknown_email' };
  if (!passwordMatches) return { user: null, reason: 'bad_password' };
  // A14: deactivating is how a departed employee is removed, so it has to actually stop
  // them signing in.
  if (!user.is_active) return { user: null, reason: 'inactive' };

  return { user };
}

module.exports = { verifyCredentials };
