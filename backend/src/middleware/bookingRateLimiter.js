const { client, isRedisReady } = require('../config/redis');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Rate limits POST /api/bookings per authenticated user (IP fallback).
 *
 * IMPORTANT: this protects against abuse/spam only. It is NOT the
 * mechanism that prevents overbooking - that is PostgreSQL row locking in
 * bookingService, and it works identically whether this limiter is active
 * or not. If Redis is unavailable, requests are allowed through rather
 * than blocked, so a Redis outage degrades rate limiting (not booking
 * correctness or availability).
 *
 * Implemented as a small fixed-window counter using plain Redis
 * INCR/PEXPIRE (no Lua/eval, no third-party store adapter) to keep the
 * failure modes easy to reason about.
 */
const memoryCounters = new Map(); // fallback used only if Redis is down

function keyFor(req) {
  return req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
}

function memoryFallbackCheck(key, windowMs, max) {
  const now = Date.now();
  const entry = memoryCounters.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    memoryCounters.set(key, { windowStart: now, count: 1 });
    return { allowed: true, count: 1 };
  }
  entry.count += 1;
  return { allowed: entry.count <= max, count: entry.count };
}

async function bookingRateLimiter(req, res, next) {
  const { windowMs, max } = env.bookingRateLimit;
  const identity = keyFor(req);

  if (!isRedisReady()) {
    const { allowed } = memoryFallbackCheck(identity, windowMs, max);
    if (!allowed) {
      return next(ApiError.tooManyRequests('Too many booking requests. Please try again shortly.'));
    }
    return next();
  }

  const redisKey = `rl:bookings:${identity}`;
  try {
    const count = await client.incr(redisKey);
    if (count === 1) {
      await client.pExpire(redisKey, windowMs);
    }
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - count)));
    if (count > max) {
      return next(ApiError.tooManyRequests('Too many booking requests. Please try again shortly.'));
    }
    return next();
  } catch (err) {
    logger.warn('Rate limiter Redis error - allowing request through', { error: err.message });
    return next();
  }
}

module.exports = bookingRateLimiter;
