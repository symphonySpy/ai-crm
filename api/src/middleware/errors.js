'use strict';

const { ValidationError, UniqueConstraintError, ForeignKeyConstraintError } = require('sequelize');
const { fail } = require('../lib/api-response');

/** An error the client caused and should see the message of. */
class HttpError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const notFound = (what) => new HttpError(404, `${what} not found`);
const badRequest = (message, errors) => new HttpError(400, message, errors);
const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
const forbidden = (message = 'Not allowed') => new HttpError(403, message);
const conflict = (message, errors) => new HttpError(409, message, errors);

function notFoundHandler(req, res, next) {
  next(notFound(`Route ${req.method} ${req.originalUrl}`));
}

/**
 * Turns anything thrown in a route into one response shape.
 *
 * Database-level rejections are translated rather than leaked. The CHECK constraints in
 * this schema enforce real business rules — an outbound message with no approver, an
 * unowned lead not flagged for triage — so when one fires, the client is told which rule
 * it broke instead of receiving a raw MySQL string that names tables and columns.
 *
 * Anything unrecognised returns a generic message and is logged in full. A stack trace
 * in a response body is a gift to whoever is probing the service.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
function errorHandler(err, req, res, next) {
  const requestId = req.id;

  if (err instanceof HttpError) {
    return fail(res, { code: err.status, message: err.message, errors: err.errors, requestId });
  }

  if (err instanceof UniqueConstraintError) {
    const fields = Object.keys(err.fields || {});
    return fail(res, {
      code: 409,
      message: `Already exists: ${fields.join(', ') || 'duplicate value'}`,
      errors: fields.map((field) => ({ field, message: 'must be unique' })),
      requestId,
    });
  }

  if (err instanceof ForeignKeyConstraintError) {
    return fail(res, {
      code: 409,
      message:
        'That record is referenced by other data, or points at something that does not exist.',
      requestId,
    });
  }

  if (err instanceof ValidationError) {
    return fail(res, {
      code: 400,
      message: 'Invalid data',
      errors: err.errors.map((e) => ({ field: e.path, message: e.message })),
      requestId,
    });
  }

  // MySQL raises 3819 when a CHECK constraint rejects a write. Those constraints exist
  // to make impossible states unrepresentable, so naming the one that fired tells the
  // caller something true and actionable.
  if (err.parent && err.parent.errno === 3819) {
    const match = /Check constraint '([^']+)'/.exec(err.parent.sqlMessage || '');
    return fail(res, {
      code: 422,
      message: 'The database rejected this write because it breaks a business rule.',
      errors: match ? [{ constraint: match[1] }] : null,
      requestId,
    });
  }

  req.log.error({ err }, 'unhandled error');
  return fail(res, { code: 500, message: 'Something went wrong.', requestId });
}

module.exports = {
  HttpError,
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  conflict,
  notFoundHandler,
  errorHandler,
};
