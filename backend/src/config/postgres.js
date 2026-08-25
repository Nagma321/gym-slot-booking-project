const { Pool } = require('pg');
const env = require('./env');
const logger = require('../utils/logger');

const poolConfig = env.pg.connectionString
  ? { connectionString: env.pg.connectionString, max: env.pg.poolMax }
  : {
      host: env.pg.host,
      port: env.pg.port,
      database: env.pg.database,
      user: env.pg.user,
      password: env.pg.password,
      max: env.pg.poolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  // Errors on idle clients (e.g. connection dropped) must not crash the process.
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

/**
 * Run a single query using a pooled connection.
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run `work(client)` inside a single PostgreSQL transaction.
 * Guarantees COMMIT on success and ROLLBACK on any thrown error,
 * and always releases the client back to the pool.
 */
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('Failed to rollback transaction', { error: rollbackErr.message });
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
