/**
 * Minimal, dependency-free migration runner.
 *
 * Applies every .sql file in ./migrations, in filename order, that has not
 * already been recorded in the `schema_migrations` table. Designed to be
 * simple and auditable for a small assessment project rather than a full
 * migration framework.
 *
 * Usage:
 *   node src/db/migrate.js        # apply pending migrations
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const env = require('../config/env');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(pool) {
  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

async function runMigrations() {
  const pool = new Pool(
    env.pg.connectionString
      ? { connectionString: env.pg.connectionString }
      : {
          host: env.pg.host,
          port: env.pg.port,
          database: env.pg.database,
          user: env.pg.user,
          password: env.pg.password,
        }
  );

  try {
    logger.info(`Running migrations against database "${env.pg.database}"`);
    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info(`Applied migration: ${file}`);
        appliedCount += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`Migration failed: ${file}`, { error: err.message });
        throw err;
      } finally {
        client.release();
      }
    }

    if (appliedCount === 0) {
      logger.info('No pending migrations. Database is up to date.');
    } else {
      logger.info(`Applied ${appliedCount} migration(s) successfully.`);
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Migration run failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = { runMigrations };
