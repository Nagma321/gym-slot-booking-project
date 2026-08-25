/**
 * Standalone concurrency demonstration.
 *
 * Sets up a gym slot with capacity=10 and 9 existing ACTIVE bookings (1
 * spot remaining), registers 3 fresh users, then fires 3 concurrent
 * POST /api/bookings requests at the running API using Promise.all.
 *
 * Expected result:
 *   - Exactly 1 request returns 201 Created
 *   - Exactly 2 requests return 409 Conflict
 *   - Final booked_count in PostgreSQL is exactly 10 (never 11)
 *
 * This exercises the REAL HTTP -> Express -> PostgreSQL path (not a unit
 * test against an in-process function), so it proves the deployed API is
 * safe under real concurrent load.
 *
 * Usage:
 *   1. Start the backend server (npm start / npm run dev) against a
 *      database you don't mind writing test data into.
 *   2. node tests/concurrency/concurrency-script.js
 *
 * The script cleans up the rows it creates when finished.
 */
require('dotenv').config();
const http = require('http');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const env = require('../../src/config/env');

const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = parseInt(process.env.API_PORT || String(env.port), 10);

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

/**
 * Minimal JSON HTTP client built on Node's core `http` module with a
 * fresh (non-keep-alive) connection per request. Using Node's global
 * `fetch` (undici) here proved unreliable for firing several genuinely
 * simultaneous requests at localhost in some sandboxed environments;
 * plain `http.request` with `Connection: close` is simple and robust for
 * this demonstration.
 */
function httpJson(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(body) : null;
    const req = http.request(
      {
        host: API_HOST,
        port: API_PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          Connection: 'close',
          ...(payload ? { 'Content-Length': payload.length } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = null;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Request timed out')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function registerAndLogin(email) {
  const password = 'ConcurrencyTest123!';
  await httpJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Concurrency Tester', email, password }),
  });
  const login = await httpJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) {
    throw new Error(`Failed to log in test user ${email}: ${JSON.stringify(login.body)}`);
  }
  return login.body.data.token;
}

async function main() {
  const runId = Date.now();
  const slotDate = '2099-01-01'; // far-future date, safe/unique for a dedicated test slot
  const client = await pool.connect();
  let slotId;
  const fillerUserIds = [];

  try {
    console.log('=== Setting up isolated concurrency test data ===');

    // Create a dedicated slot: capacity 10.
    const slotResult = await client.query(
      `INSERT INTO gym_slots (slot_date, start_time, end_time, capacity, booked_count)
       VALUES ($1, '05:00', '06:00', 10, 0)
       RETURNING id`,
      [slotDate]
    );
    slotId = slotResult.rows[0].id;
    console.log(`Created test slot id=${slotId} (capacity=10)`);

    // Create 9 filler users with 9 ACTIVE bookings, bringing remaining
    // capacity to exactly 1.
    const passwordHash = await bcrypt.hash('FillerPassword123!', 4);
    for (let i = 0; i < 9; i++) {
      const email = `filler-${runId}-${i}@example.com`;
      const userResult = await client.query(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
        [`Filler User ${i}`, email, passwordHash]
      );
      const userId = userResult.rows[0].id;
      fillerUserIds.push(userId);
      await client.query(
        `INSERT INTO bookings (user_id, slot_id, status) VALUES ($1, $2, 'ACTIVE')`,
        [userId, slotId]
      );
    }
    await client.query(`UPDATE gym_slots SET booked_count = 9 WHERE id = $1`, [slotId]);
    console.log('Created 9 filler bookings. Exactly 1 spot should remain.');

    // Register + log in 3 fresh users who will race for the last spot.
    console.log('=== Registering 3 racing users ===');
    const tokens = await Promise.all(
      [0, 1, 2].map((i) => registerAndLogin(`racer-${runId}-${i}@example.com`))
    );

    console.log('=== Firing 3 concurrent booking requests via Promise.all ===');
    const responses = await Promise.all(
      tokens.map((token) =>
        httpJson('/api/bookings', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ slotId }),
        })
      )
    );

    const successes = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);
    const others = responses.filter((r) => r.status !== 201 && r.status !== 409);

    console.log('\n=== Results ===');
    responses.forEach((r, i) => {
      console.log(`Request ${i + 1}: HTTP ${r.status} - ${r.body?.error?.message || 'OK'}`);
    });

    const { rows: finalSlotRows } = await client.query(
      'SELECT capacity, booked_count FROM gym_slots WHERE id = $1',
      [slotId]
    );
    const finalSlot = finalSlotRows[0];
    const { rows: activeBookingRows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM bookings WHERE slot_id = $1 AND status = 'ACTIVE'`,
      [slotId]
    );
    const activeBookingCount = activeBookingRows[0].count;

    console.log('\n=== Final database state ===');
    console.log(`gym_slots.booked_count = ${finalSlot.booked_count} (capacity = ${finalSlot.capacity})`);
    console.log(`Actual ACTIVE bookings for slot = ${activeBookingCount}`);

    console.log('\n=== Assertions ===');
    const checks = [
      [successes.length === 1, `Exactly 1 request succeeded (got ${successes.length})`],
      [conflicts.length === 2, `Exactly 2 requests got 409 (got ${conflicts.length})`],
      [others.length === 0, `No unexpected status codes (got ${others.length})`],
      [finalSlot.booked_count === 10, `booked_count is exactly 10 (got ${finalSlot.booked_count})`],
      [finalSlot.booked_count <= finalSlot.capacity, 'booked_count never exceeds capacity'],
      [activeBookingCount === 10, `Active booking rows = 10 (got ${activeBookingCount})`],
      [activeBookingCount === finalSlot.booked_count, 'booked_count matches actual active booking rows'],
    ];

    let allPassed = true;
    for (const [passed, label] of checks) {
      console.log(`${passed ? 'PASS' : 'FAIL'} - ${label}`);
      if (!passed) allPassed = false;
    }

    console.log(`\n=== CONCURRENCY TEST ${allPassed ? 'PASSED' : 'FAILED'} ===`);

    // Cleanup
    console.log('\nCleaning up test data...');
    await client.query('DELETE FROM bookings WHERE slot_id = $1', [slotId]);
    await client.query('DELETE FROM gym_slots WHERE id = $1', [slotId]);
    const allTestUserIds = [...fillerUserIds];
    await client.query(
      `DELETE FROM users WHERE email LIKE $1 OR email LIKE $2`,
      [`filler-${runId}-%`, `racer-${runId}-%`]
    );
    console.log('Cleanup complete.');

    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Concurrency script failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
