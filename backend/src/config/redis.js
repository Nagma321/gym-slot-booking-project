const { createClient } = require('redis');
const env = require('./env');
const logger = require('../utils/logger');

const client = createClient({ url: env.redis.url });

let isReady = false;

client.on('error', (err) => {
  // Redis is a supporting technology (cache + rate limiting), never a
  // correctness dependency. Log and continue; callers must handle
  // Redis being unavailable gracefully.
  isReady = false;
  logger.warn('Redis client error (degraded mode - PostgreSQL remains source of truth)', {
    error: err.message,
  });
});

client.on('ready', () => {
  isReady = true;
  logger.info('Redis client connected');
});

async function connectRedis() {
  if (!client.isOpen) {
    try {
      await client.connect();
    } catch (err) {
      logger.warn('Initial Redis connection failed - continuing without cache', {
        error: err.message,
      });
    }
  }
}

function isRedisReady() {
  return isReady && client.isOpen;
}

module.exports = { client, connectRedis, isRedisReady };
