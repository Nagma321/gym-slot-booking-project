process.env.NODE_ENV = 'test';
require('dotenv').config();

const { pool } = require('../src/config/postgres');
const { runMigrations } = require('../src/db/migrate');

async function resetDatabase() {
  await pool.query('TRUNCATE TABLE bookings RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE gym_slots RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
}

async function setupTestDatabase() {
  await runMigrations();
  await resetDatabase();
}

async function createSlot({ date = '2099-06-01', start = '06:00', end = '07:00', capacity = 10, bookedCount = 0 } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO gym_slots (slot_date, start_time, end_time, capacity, booked_count)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [date, start, end, capacity, bookedCount]
  );
  return rows[0].id;
}

async function closePool() {
  await pool.end();
}

module.exports = { setupTestDatabase, resetDatabase, createSlot, closePool, pool };
