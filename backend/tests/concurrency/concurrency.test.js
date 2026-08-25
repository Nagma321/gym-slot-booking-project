const request = require('supertest');
const createApp = require('../../src/app');
const { setupTestDatabase, resetDatabase, createSlot, closePool } = require('../testUtils');

const app = createApp();

async function registerAndLogin(email) {
  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Racer', email, password: 'TestPassword123!' });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'TestPassword123!' });
  return res.body.data.token;
}

beforeAll(async () => {
  await setupTestDatabase();
});

afterEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closePool();
});

describe('Concurrency: last remaining spot', () => {
  test('exactly one of three simultaneous bookings for the last spot succeeds', async () => {
    // Slot with capacity 10 and 9 already booked -> exactly 1 remaining.
    const slotId = await createSlot({ capacity: 10, bookedCount: 9 });

    const tokens = await Promise.all(
      [0, 1, 2].map((i) => registerAndLogin(`race-${Date.now()}-${i}@example.com`))
    );

    // Fire all three requests truly concurrently via Promise.all directly
    // against the Express app (in-process, exercising the real
    // controller -> service -> PostgreSQL transaction path).
    const responses = await Promise.all(
      tokens.map((token) =>
        request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`).send({ slotId })
      )
    );

    const successCount = responses.filter((r) => r.status === 201).length;
    const conflictCount = responses.filter((r) => r.status === 409).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(2);

    const slotRes = await request(app).get(`/api/slots/${slotId}`);
    expect(slotRes.body.data.bookedCount).toBe(10);
    expect(slotRes.body.data.remainingCapacity).toBe(0);
    expect(slotRes.body.data.bookedCount).toBeLessThanOrEqual(10);
  });
});
