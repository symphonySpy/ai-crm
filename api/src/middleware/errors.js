'use strict';

const { ValidationError, UniqueConstraintError, ForeignKeyConstraintError } = require('sequelize');

/** An error the client caused and should see the message of. */
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const notFound = (what) => new HttpError(404, 'not_found', `${what} not found`);
const badRequest = (message, details) => new HttpError(400, 'bad_request', message, details);
const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'unauthorized', message);
const forbidden = (message = 'Not allowed') => new HttpError(403, 'forbidden', message);

function notFoundHandler(req, res, next) {
  next(notFound(`Route ${req.method} ${req.originalUrl}`));
}

/**
 * Turns anything thrown in a route into one response shape.
 *
 * Database-level rejections are translated rather than leaked. The CHECK constraints in
 * this schema enforce real business rules — an outbound message with no approver, an
 * unowned lead not flagged for triage — so when one fires, the client deserves to be
 * told which rule it broke, not a raw MySQL string mentioning table names.
 *
 * Unexpected errors return a generic message and are logged in full. A stack trace in a
 * response body is a gift to whoever is probing the service.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId: req.id },
    });
  }

  if (err instanceof UniqueConstraintError) {
    const fields = Object.keys(err.fields || {});
    return res.status(409).json({
      error: {
        code: 'conflict',
        message: `Already exists: ${fields.join(', ') || 'duplicate value'}`,
        requestId: req.id,
      },
    });
  }

  if (err instanceof ForeignKeyConstraintError) {
    return res.status(409).json({
      error: {
        code: 'reference_conflict',
        message:
          'That record is referenced by other data, or points at something that does not exist.',
        requestId: req.id,
      },
    });
  }

  if (err instanceof ValidationError) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: 'Invalid data',
        details: err.errors.map((e) => ({ field: e.path, message: e.message })),
        requestId: req.id,
      },
    });
  }

  // MySQL raises 3819 when a CHECK constraint rejects a write. Those constraints exist
  // to make impossible states unrepresentable, so surfacing which one fired tells the
  // caller something true and actionable.
  if (err.parent && err.parent.errno === 3819) {
    const match = /Check constraint '([^']+)'/.exec(err.parent.sqlMessage || '');
    return res.status(422).json({
      error: {
        code: 'business_rule_violation',
        message: 'The database rejected this write because it breaks a business rule.',
        details: match ? { constraint: match[1] } : undefined,
        requestId: req.id,
      },
    });
  }

  req.log.error({ err }, 'unhandled error');
  return res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong.', requestId: req.id },
  });
}

module.exports = {
  HttpError,
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  notFoundHandler,
  errorHandler,
};
