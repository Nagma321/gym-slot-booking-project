const { ActivityLog } = require('../models/ActivityLog');
const { isMongoReady } = require('../config/mongo');
const logger = require('../utils/logger');

/**
 * Write an audit event to MongoDB. This is intentionally fire-and-forget
 * from the caller's perspective for POST-COMMIT events: a logging failure
 * must never roll back or fail an already-successful PostgreSQL
 * transaction. Callers `await` this only to keep ordering predictable in
 * tests; the promise never rejects.
 */
async function logActivity({ userId, action, slotId, bookingId, metadata }) {
  if (!isMongoReady()) {
    logger.warn('Skipping activity log write - MongoDB not connected', { action });
    return { written: false };
  }
  try {
    await ActivityLog.create({
      userId,
      action,
      slotId,
      bookingId,
      metadata: metadata || {},
    });
    return { written: true };
  } catch (err) {
    // Deliberately swallow: audit logging must never break the booking
    // flow. The failure is logged locally so it isn't silently lost.
    logger.error('Failed to write activity log (booking/auth flow continues)', {
      action,
      error: err.message,
    });
    return { written: false, error: err.message };
  }
}

module.exports = { logActivity };
