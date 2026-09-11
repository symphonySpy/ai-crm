'use strict';

const { badRequest } = require('./errors');

/**
 * Validate and REPLACE part of the request with the parsed result.
 *
 * A43: zod does the checking rather than TypeScript, because every dangerous input in
 * this system arrives at runtime — request bodies, LINE webhook payloads, model output.
 * Static types say nothing about any of them.
 *
 * Replacing req.body with the parsed value matters as much as the check itself: routes
 * downstream then work with coerced, stripped data instead of whatever arrived. An
 * unknown key cannot ride along into a model update, which is how mass-assignment bugs
 * get in.
 */
const validate = (schemas) => (req, res, next) => {
  for (const key of ['body', 'query', 'params']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key]);
    if (!result.success) {
      return next(
        badRequest(
          `Invalid request ${key}`,
          result.error.issues.map((i) => ({ field: i.path.join('.') || key, message: i.message })),
        ),
      );
    }
    // req.query is a getter on newer Express versions, so assign its contents rather
    // than the object.
    if (key === 'query') {
      for (const k of Object.keys(req.query)) delete req.query[k];
      Object.assign(req.query, result.data);
    } else {
      req[key] = result.data;
    }
  }
  return next();
};

module.exports = { validate };
