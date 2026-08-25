const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const env = require('../config/env');

// Maps known PostgreSQL error codes to safe ApiErrors so callers don't
// need to duplicate this translation in every service.
function mapPgError(err) {
  if (err.code === '23505') {
    // unique_violation - most commonly our partial unique index on
    // (user_id, slot_id) for active bookings, or the users email unique
    // constraint.
    if (err.constraint === 'uniq_active_booking_per_user_slot') {
      return ApiError.conflict('You already have an active booking for this slot');
    }
    if (err.constraint === 'users_email_unique') {
      return ApiError.conflict('An account with this email already exists');
    }
    return ApiError.conflict('Duplicate record');
  }
  if (err.code === '23514') {
    // check_violation, e.g. gym_slots_booked_count_within_capacity
    return ApiError.conflict('This slot is full');
  }
  if (err.code === '23503') {
    // foreign_key_violation
    return ApiError.badRequest('Referenced record does not exist');
  }
  return null;
}

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let apiError = err;

  if (!(err instanceof ApiError)) {
    const mapped = err.code ? mapPgError(err) : null;
    apiError = mapped || ApiError.internal('An unexpected error occurred');
    // Log the real underlying error server-side; never leak stack traces
    // or internal details to the client.
    logger.error('Unhandled error', {
      message: err.message,
      code: err.code,
      stack: env.nodeEnv === 'development' ? err.stack : undefined,
    });
  }

  const body = {
    success: false,
    error: {
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
    },
  };

  res.status(apiError.statusCode || 500).json(body);
}

module.exports = { errorHandler, notFoundHandler };
