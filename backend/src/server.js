const createApp = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectRedis } = require('./config/redis');
const { connectMongo } = require('./config/mongo');

async function start() {
  // Connect best-effort to Redis and MongoDB. Neither is required for the
  // process to boot - booking correctness depends only on PostgreSQL,
  // which uses a lazy connection pool and will surface errors per-request
  // if it is unreachable.
  await connectRedis();
  await connectMongo();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`Gym Slot Booking API listening on port ${env.port} [${env.nodeEnv}]`);
  });

  const shutdown = (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('Fatal error during startup', { error: err.message });
  process.exit(1);
});
