'use strict';

// Field names whose values never get written anywhere durable — not to the log stream,
// not to rest_log.
//
// The list is matched on the KEY, case-insensitively, at any depth. Matching on keys
// rather than on value patterns is the safer direction: a rule that tries to recognise
// "this looks like a token" fails open the moment a token format changes, while a rule
// that says "never write anything called password" only fails if someone invents a new
// name for a password.
const SENSITIVE_KEYS = [
  'password',
  'password_hash',
  'passwordconfirm',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'set-cookie',
  'x-line-signature',
  'apikey',
  'api_key',
];

// Personal data that is legitimate in the business tables but has no reason to sit in an
// operational log, where it would quietly become a second copy outside every deletion
// request the business answers (A15).
const PERSONAL_KEYS = ['line_user_id', 'phone', 'email'];

const REDACTED = '[redacted]';

const isSensitive = (key) => {
  const k = String(key).toLowerCase();
  return SENSITIVE_KEYS.includes(k) || PERSONAL_KEYS.includes(k);
};

/**
 * Deep copy with sensitive values replaced.
 *
 * Long strings are shortened rather than dropped: knowing a message was 1,400 characters
 * is often the clue that explains a failure, while the 1,400 characters themselves are
 * the part that should not be duplicated into a log table.
 */
function redact(value, { maxStringLength = 500, depth = 0 } = {}) {
  if (depth > 8) return '[too deep]';
  if (value === null || value === undefined) return value ?? null;

  if (Array.isArray(value)) {
    // A long array tells you nothing extra after the first few entries.
    const head = value.slice(0, 20).map((v) => redact(v, { maxStringLength, depth: depth + 1 }));
    return value.length > 20 ? [...head, `[+${value.length - 20} more]`] : head;
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = isSensitive(key) ? REDACTED : redact(v, { maxStringLength, depth: depth + 1 });
    }
    return out;
  }

  if (typeof value === 'string' && value.length > maxStringLength) {
    return `${value.slice(0, maxStringLength)}… [${value.length} chars]`;
  }

  return value;
}

/**
 * Redact, then guarantee the result fits in a column.
 *
 * Returns a marker object rather than a truncated string when the payload is oversized,
 * so what lands in a JSON column is always valid JSON. Half a JSON document is worse
 * than an honest note saying it was too big.
 */
function redactForStorage(value, maxBytes = 16000) {
  if (value === null || value === undefined) return null;
  const redacted = redact(value);
  const serialised = JSON.stringify(redacted);
  if (serialised && Buffer.byteLength(serialised, 'utf8') > maxBytes) {
    return { _truncated: true, _bytes: Buffer.byteLength(serialised, 'utf8') };
  }
  return redacted;
}

module.exports = { redact, redactForStorage, SENSITIVE_KEYS, PERSONAL_KEYS, REDACTED };
