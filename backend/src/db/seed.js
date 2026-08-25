/**
 * Seeds gym slots (and, optionally, a demo user) so an evaluator can start
 * the app and immediately see usable data.
 *
 * Usage:
 *   node src/db/seed.js            # insert slots if they don't already exist
 *   node src/db/seed.js --reset    # wipe bookings/slots (not users) and reseed
 */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const logger = require('../utils/logger');

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

const SLOTS = [
  { start: '06:00', end: '07:00' },
  { start: '07:00', end: '08:00' },
  { start: '08:00', end: '09:00' },
  { start: '17:00', end: '18:00' },
  { start: '18:00', end: '19:00' },
  { start: '19:00', end: '20:00' },
];

function nextNDays(n) {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function reset() {
  logger.info('Resetting bookings and gym_slots tables...');
  await pool.query('TRUNCATE TABLE bookings RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE gym_slots RESTART IDENTITY CASCADE');
}

async function seedSlots() {
  const dates = nextNDays(3);
  let inserted = 0;
  for (const date of dates) {
    for (const slot of SLOTS) {
      const result = await pool.query(
        `INSERT INTO gym_slots (slot_date, start_time, end_time, capacity, booked_count)
         VALUES ($1, $2, $3, 10, 0)
         ON CONFLICT (slot_date, start_time, end_time) DO NOTHING
         RETURNING id`,
        [date, slot.start, slot.end]
      );
      if (result.rowCount > 0) inserted += 1;
    }
  }
  logger.info(`Seeded ${inserted} new gym slot(s) across ${dates.length} day(s).`);
}

async function seedDemoUser() {
  const email = 'demo@example.com';
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length > 0) {
    logger.info('Demo user already exists (demo@example.com).');
    return;
  }
  const passwordHash = await bcrypt.hash('DemoPassword123!', 10);
  await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)',
    ['Demo User', email, passwordHash]
  );
  logger.info('Created demo user: demo@example.com / DemoPassword123!');
}

async function main() {
  const shouldReset = process.argv.includes('--reset');
  try {
    if (shouldReset) {
      await reset();
    }
    await seedSlots();
    await seedDemoUser();
    logger.info('Seeding complete.');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('Seeding failed', { error: err.message });
    process.exit(1);
  });
}

module.exports = { main };
