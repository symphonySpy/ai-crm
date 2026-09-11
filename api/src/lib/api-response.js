'use strict';

// One response envelope for every endpoint, success or failure:
//
//   { success, code, message, data }
//
// The value of a fixed shape is that a client writes its "did this work?" check once.
// When half the endpoints return a bare array and the other half an object, every call
// site grows its own special case, and the ones written last are the ones that get it
// wrong.
//
// `code` repeats the HTTP status inside the body on purpose. Clients that go through a
// proxy, a queue, or a log file often see the body without the status line, and a
// response that cannot tell you what it was is hard to debug after the fact.
//
// `data` is always present, null rather than absent when there is nothing to send, so
// reading `body.data` never throws.

const respond = (res, { code = 200, message = 'Success', data = null }) =>
  res.status(code).json({ success: true, code, message, data });

const ok = (res, data, message = 'Success') => respond(res, { code: 200, message, data });

const created = (res, data, message = 'Created') => respond(res, { code: 201, message, data });

// 204 carries no body by definition, so the envelope does not apply. Kept here so the
// exception is visible next to the rule rather than discovered in a route.
const noContent = (res) => res.status(204).end();

/**
 * Failure envelope. Mirrors the success shape so a client can branch on `success`
 * alone: same keys, same places, only `data` becomes `errors`.
 */
const fail = (res, { code = 500, message = 'Something went wrong.', errors = null, requestId }) =>
  res.status(code).json({ success: false, code, message, errors, requestId, data: null });

module.exports = { ok, created, noContent, fail, respond };
