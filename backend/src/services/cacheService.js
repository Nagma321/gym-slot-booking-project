const { client, isRedisReady } = require('../config/redis');
const env = require('../config/env');
const logger = require('../utils/logger');

const SLOTS_LIST_KEY_PREFIX = 'cache:slots:list';
const SLOT_ITEM_KEY_PREFIX = 'cache:slots:item';

function listKey(page, pageSize) {
  return `${SLOTS_LIST_KEY_PREFIX}:${page}:${pageSize}`;
}

function itemKey(slotId) {
  return `${SLOT_ITEM_KEY_PREFIX}:${slotId}`;
}

/**
 * Generic "get JSON from cache" helper. Returns null on any failure
 * (including Redis being down) so callers always fall back to PostgreSQL.
 */
async function getJson(key) {
  if (!isRedisReady()) return null;
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn('Redis GET failed - falling back to database', { key, error: err.message });
    return null;
  }
}

async function setJson(key, value, ttlSeconds) {
  if (!isRedisReady()) return;
  try {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    logger.warn('Redis SET failed (non-fatal)', { key, error: err.message });
  }
}

async function getCachedSlotsList(page, pageSize) {
  return getJson(listKey(page, pageSize));
}

async function setCachedSlotsList(page, pageSize, data) {
  await setJson(listKey(page, pageSize), data, env.redis.slotsCacheTtlSeconds);
}

async function getCachedSlot(slotId) {
  return getJson(itemKey(slotId));
}

async function setCachedSlot(slotId, data) {
  await setJson(itemKey(slotId), data, env.redis.slotsCacheTtlSeconds);
}

/**
 * Invalidate all slot-related cache entries. Called only AFTER a
 * PostgreSQL transaction has successfully committed (booking or
 * cancellation), so the cache never serves stale-but-committed data for
 * longer than necessary. Uses SCAN (not KEYS) to avoid blocking Redis.
 */
async function invalidateSlotsCache(slotId) {
  if (!isRedisReady()) return;
  try {
    if (slotId) {
      await client.del(itemKey(slotId));
    }
    // Invalidate all paginated list entries since remaining capacity for
    // this slot may appear on any page. `scanIterator` handles cursor
    // bookkeeping internally (and safely) and never blocks Redis the way
    // KEYS would on a large keyspace.
    const keysToDelete = [];
    for await (const key of client.scanIterator({
      MATCH: `${SLOTS_LIST_KEY_PREFIX}:*`,
      COUNT: 100,
    })) {
      keysToDelete.push(key);
    }
    if (keysToDelete.length > 0) {
      await client.del(keysToDelete);
    }
  } catch (err) {
    logger.warn('Redis cache invalidation failed (non-fatal)', { error: err.message });
  }
}

module.exports = {
  getCachedSlotsList,
  setCachedSlotsList,
  getCachedSlot,
  setCachedSlot,
  invalidateSlotsCache,
};
