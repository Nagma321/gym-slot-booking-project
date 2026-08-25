require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    // Fail fast on boot rather than failing obscurely later.
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest: process.env.NODE_ENV === 'test',
  port: parseInt(process.env.PORT || '4000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  pg: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database:
      process.env.NODE_ENV === 'test'
        ? process.env.TEST_PG_DATABASE || 'gym_slot_booking_test'
        : process.env.PG_DATABASE || 'gym_slot_booking',
    user: process.env.PG_USER || 'gymapp',
    password: process.env.PG_PASSWORD || '',
    poolMax: parseInt(process.env.PG_POOL_MAX || '10', 10),
    connectionString: process.env.PG_CONNECTION_STRING || undefined,
  },

  mongo: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/gym_slot_booking_logs',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    slotsCacheTtlSeconds: parseInt(process.env.SLOTS_CACHE_TTL_SECONDS || '15', 10),
  },

  jwt: {
    secret: required('JWT_SECRET', 'dev_only_insecure_secret_change_me'),
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },

  bookingRateLimit: {
    windowMs: parseInt(process.env.BOOKING_RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.BOOKING_RATE_LIMIT_MAX || '10', 10),
  },
};

module.exports = env;
