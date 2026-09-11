'use strict';

/**
 * Shared setup for the integration tests.
 *
 * The tests run against a real MySQL database (ai_crm_test, created and migrated by
 * `npm run test:db`), not an in-memory substitute. The behaviour being tested here —
 * CHECK constraints, a unique primary key used for webhook idempotency, hook-written
 * audit rows — lives in the database itself, so a fake would pass while production
 * failed. Vitest sets NODE_ENV=test, which is what selects that database in
 * src/config/database.js.
 *
 * Every test creates the rows it needs with a unique suffix and deletes them again, so
 * the suite is re-runnable and does not depend on the seeders having been run.
 */

require('dotenv').config();

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Fixed values so a developer's own .env cannot change what the tests exercise. The
// channel secret is a test fixture, not a credential: it signs payloads this suite
// generates and never leaves the process.
process.env.LINE_ADAPTER = 'mock';
process.env.AI_ADAPTER = 'mock';
process.env.LINE_CHANNEL_SECRET = 'test-channel-secret';
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-access-token';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-not-used-in-any-deployment';
process.env.REST_LOG_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';

const db = require('../src/models');
const { createApp } = require('../src/app');

const app = createApp();

/** Distinguishes rows from this run, so a re-run never collides on a unique column. */
const tag = () => crypto.randomBytes(6).toString('hex');

async function createUser({ role = 'manager', password = 'test-password' } = {}) {
  const suffix = tag();
  const user = await db.User.create({
    email: `test-${suffix}@example.test`,
    password_hash: await bcrypt.hash(password, 4),
    name: `Test ${role} ${suffix}`,
    role,
  });
  return { user, password };
}

/** Signs in through the real endpoint and returns the Cookie header for later calls. */
async function signIn(request, { email, password }) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${res.text}`);
  const cookies = res.headers['set-cookie'];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

/** processEvent runs after the webhook has already answered; give it time to land. */
async function waitFor(fn, { timeoutMs = 5000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

module.exports = { app, db, tag, createUser, signIn, waitFor };
