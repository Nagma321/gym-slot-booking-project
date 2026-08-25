const request = require('supertest');
const createApp = require('../../src/app');
const { setupTestDatabase, resetDatabase, createSlot, closePool } = require('../testUtils');

const app = createApp();

async function registerAndLogin(email) {
  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password: 'TestPassword123!' });
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

describe('Auth', () => {
  test('registers a new user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@example.com', password: 'SecurePass123!' });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('alice@example.com');
  });

  test('rejects duplicate email registration', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'dup@example.com', password: 'SecurePass123!' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice2', email: 'dup@example.com', password: 'SecurePass123!' });
    expect(res.status).toBe(409);
  });

  test('rejects login with wrong password', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bob', email: 'bob@example.com', password: 'SecurePass123!' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'WrongPassword!' });
    expect(res.status).toBe(401);
  });

  test('rejects registration with invalid input', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: '123' });
    expect(res.status).toBe(400);
  });
});

describe('Slots', () => {
  test('lists slots with remaining capacity', async () => {
    await createSlot({ capacity: 10, bookedCount: 3 });
    const res = await request(app).get('/api/slots');
    expect(res.status).toBe(200);
    expect(res.body.data.slots[0].remainingCapacity).toBe(7);
  });
});

describe('Bookings', () => {
  test('a successful booking returns 201 and increments booked count', async () => {
    const slotId = await createSlot({ capacity: 10, bookedCount: 0 });
    const token = await registerAndLogin('booker1@example.com');

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ slotId });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ACTIVE');

    const slotRes = await request(app).get(`/api/slots/${slotId}`);
    expect(slotRes.body.data.bookedCount).toBe(1);
  });

  test('booking a full slot returns 409', async () => {
    const slotId = await createSlot({ capacity: 10, bookedCount: 10 });
    const token = await registerAndLogin('booker2@example.com');

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ slotId });

    expect(res.status).toBe(409);
  });

  test('duplicate active booking for same user/slot is rejected', async () => {
    const slotId = await createSlot({ capacity: 10, bookedCount: 0 });
    const token = await registerAndLogin('booker3@example.com');

    const first = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ slotId });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ slotId });
    expect(second.status).toBe(409);
  });

  test('booking without auth returns 401', async () => {
    const slotId = await createSlot();
    const res = await request(app).post('/api/bookings').send({ slotId });
    expect(res.status).toBe(401);
  });

  test('cancelling own booking restores capacity', async () => {
    const slotId = await createSlot({ capacity: 10, bookedCount: 0 });
    const token = await registerAndLogin('canceler@example.com');

    const bookRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ slotId });
    const bookingId = bookRes.body.data.id;

    const cancelRes = await request(app)
      .delete(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');

    const slotRes = await request(app).get(`/api/slots/${slotId}`);
    expect(slotRes.body.data.bookedCount).toBe(0);
  });

  test('a user cannot cancel another user\'s booking', async () => {
    const slotId = await createSlot({ capacity: 10, bookedCount: 0 });
    const ownerToken = await registerAndLogin('owner@example.com');
    const otherToken = await registerAndLogin('other@example.com');

    const bookRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ slotId });
    const bookingId = bookRes.body.data.id;

    const cancelRes = await request(app)
      .delete(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(cancelRes.status).toBe(403);
  });

  test('cancelling an already-cancelled booking returns 409', async () => {
    const slotId = await createSlot({ capacity: 10, bookedCount: 0 });
    const token = await registerAndLogin('doublecancel@example.com');

    const bookRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ slotId });
    const bookingId = bookRes.body.data.id;

    await request(app)
      .delete(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${token}`);

    const secondCancel = await request(app)
      .delete(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(secondCancel.status).toBe(409);
  });

  test('lists the authenticated user\'s bookings', async () => {
    const slotId = await createSlot({ capacity: 10, bookedCount: 0 });
    const token = await registerAndLogin('mybookings@example.com');

    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ slotId });

    const res = await request(app)
      .get('/api/bookings/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.bookings).toHaveLength(1);
  });
});
