const ApiError = require('../utils/ApiError');

/**
 * Builds Express middleware that validates `req[source]` against a Zod
 * schema, replacing it with the parsed (and coerced) value on success, or
 * forwarding a 400 ApiError with details on failure.
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }
    req[source] = result.data;
    next();
  };
}

module.exports = validate;
