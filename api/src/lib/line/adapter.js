'use strict';

const { logger } = require('../logger');

/**
 * The LINE Messaging API, behind an interface with two implementations.
 *
 * A36: the mock is not a testing convenience bolted on afterwards — it is what local
 * development and the whole test suite run against. Tests that reach the real LINE API
 * are slow, need credentials that must not be in the repository, and fail for reasons
 * that have nothing to do with the code under test. Worse, a test that can send a real
 * message is a test that will one day message a real customer.
 *
 * Both implementations satisfy the same contract:
 *   sendText({ to, text })  -> { messageId }
 *   getProfile(userId)      -> { displayName } | null
 *
 * A failure carries `retryable`, because the caller's decision depends on it: a 5xx or a
 * dropped connection is worth another attempt, a 400 is the same rejection every time.
 */
class LineApiError extends Error {
  constructor(message, { status, retryable }) {
    super(message);
    this.name = 'LineApiError';
    this.status = status;
    this.retryable = retryable;
  }
}

class LiveLineAdapter {
  constructor({ accessToken, timeoutMs = 10000 }) {
    if (!accessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
    this.accessToken = accessToken;
    this.timeoutMs = timeoutMs;
  }

  async request(path, { method = 'POST', body } = {}) {
    // Without a timeout a hung connection holds the request until the platform kills the
    // process; the outbound worker would sit on it rather than moving to the next message.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`https://api.line.me/v2/bot${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new LineApiError(`LINE API ${res.status}: ${detail.slice(0, 300)}`, {
          status: res.status,
          // 429 is included: rate limiting is a "later, not never" answer.
          retryable: res.status >= 500 || res.status === 429,
        });
      }

      return res.status === 204 ? null : await res.json().catch(() => null);
    } catch (err) {
      if (err instanceof LineApiError) throw err;
      // Aborts and network failures say nothing about the request's validity, so they
      // are worth retrying.
      throw new LineApiError(`LINE API unreachable: ${err.message}`, {
        status: null,
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async sendText({ to, text }) {
    await this.request('/message/push', { body: { to, messages: [{ type: 'text', text }] } });
    // The push endpoint returns no message id, so one is synthesised for the audit trail.
    // It is marked so nobody mistakes it for an id LINE would recognise.
    return { messageId: `push-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
  }

  async getProfile(userId) {
    try {
      const profile = await this.request(`/profile/${encodeURIComponent(userId)}`, {
        method: 'GET',
      });
      return profile ? { displayName: profile.displayName } : null;
    } catch (err) {
      // A missing profile — the user blocked the account, or never followed it — must not
      // stop an inbound message from being recorded. The lead matters more than the name.
      logger.warn({ err: err.message }, 'could not fetch LINE profile');
      return null;
    }
  }
}

/**
 * In-memory stand-in. Records what would have been sent so tests can assert on it, and
 * can be told to fail on demand so the retry path is exercised without a real outage.
 */
class MockLineAdapter {
  constructor() {
    this.sent = [];
    this.failuresRemaining = 0;
    this.failureRetryable = true;
  }

  /** Make the next `count` sends fail, so retry and give-up behaviour can be tested. */
  failNext(count, { retryable = true } = {}) {
    this.failuresRemaining = count;
    this.failureRetryable = retryable;
  }

  reset() {
    this.sent = [];
    this.failuresRemaining = 0;
    this.failureRetryable = true;
  }

  async sendText({ to, text }) {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new LineApiError('Simulated LINE failure', {
        status: this.failureRetryable ? 500 : 400,
        retryable: this.failureRetryable,
      });
    }
    // Unique per send, not per adapter instance. A counter looks tidier but collides
    // with rows left by an earlier run, and messages.line_message_id is unique — the
    // test then fails the second time it is run, for a reason that has nothing to do
    // with the code under test. A suite that only passes on a fresh database is a suite
    // people learn to ignore.
    const messageId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this.sent.push({ to, text, messageId, at: new Date() });
    return { messageId };
  }

  async getProfile(userId) {
    return { displayName: `LINE user ${String(userId).slice(-4)}` };
  }
}

let instance = null;

/**
 * The adapter this process uses, chosen by LINE_ADAPTER.
 *
 * Anything other than an explicit 'live' gets the mock. Defaulting the other way would
 * mean a missing environment variable in a test run reaches the real API — the failure
 * mode where you find out by looking at a customer's phone.
 */
function getLineAdapter() {
  if (instance) return instance;

  if (process.env.LINE_ADAPTER === 'live') {
    instance = new LiveLineAdapter({
      accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
      timeoutMs: Number(process.env.LINE_TIMEOUT_MS || 10000),
    });
    logger.info('LINE adapter: live');
  } else {
    instance = new MockLineAdapter();
    logger.info('LINE adapter: mock (no messages leave this process)');
  }

  return instance;
}

/** Test helper: drop the cached adapter so the next call re-reads the environment. */
function resetLineAdapter() {
  instance = null;
}

module.exports = {
  getLineAdapter,
  resetLineAdapter,
  LiveLineAdapter,
  MockLineAdapter,
  LineApiError,
};
