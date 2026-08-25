const { query } = require('../config/postgres');

function toBookingDto(row) {
  return {
    id: row.id,
    userId: row.user_id,
    slotId: row.slot_id,
    status: row.status,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    slot: row.slot_date
      ? {
          date: row.slot_date,
          startTime: row.start_time,
          endTime: row.end_time,
        }
      : undefined,
  };
}

/**
 * Find an existing ACTIVE booking for (userId, slotId). Must be called
 * inside the same transaction as the slot lock so the check is consistent
 * with the locked slot state (belt-and-braces on top of the partial
 * unique index, which is the real guarantee).
 */
async function findActiveBooking(client, userId, slotId) {
  const { rows } = await client.query(
    `SELECT id, user_id, slot_id, status, created_at
     FROM bookings
     WHERE user_id = $1 AND slot_id = $2 AND status = 'ACTIVE'`,
    [userId, slotId]
  );
  return rows[0] || null;
}

async function createBooking(client, { userId, slotId }) {
  const { rows } = await client.query(
    `INSERT INTO bookings (user_id, slot_id, status)
     VALUES ($1, $2, 'ACTIVE')
     RETURNING id, user_id, slot_id, status, created_at`,
    [userId, slotId]
  );
  return rows[0];
}

async function findBookingForUpdate(client, bookingId) {
  const { rows } = await client.query(
    `SELECT id, user_id, slot_id, status, created_at, cancelled_at
     FROM bookings WHERE id = $1 FOR UPDATE`,
    [bookingId]
  );
  return rows[0] || null;
}

async function cancelBooking(client, bookingId) {
  const { rows } = await client.query(
    `UPDATE bookings
     SET status = 'CANCELLED', cancelled_at = now()
     WHERE id = $1
     RETURNING id, user_id, slot_id, status, created_at, cancelled_at`,
    [bookingId]
  );
  return rows[0];
}

async function listBookingsForUser(userId, { page, pageSize }) {
  const offset = (page - 1) * pageSize;
  const [{ rows }, { rows: countRows }] = await Promise.all([
    query(
      `SELECT b.id, b.user_id, b.slot_id, b.status, b.created_at, b.cancelled_at,
              s.slot_date, s.start_time, s.end_time
       FROM bookings b
       JOIN gym_slots s ON s.id = b.slot_id
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset]
    ),
    query('SELECT COUNT(*)::int AS total FROM bookings WHERE user_id = $1', [userId]),
  ]);

  return {
    bookings: rows.map(toBookingDto),
    pagination: {
      page,
      pageSize,
      total: countRows[0].total,
      totalPages: Math.max(1, Math.ceil(countRows[0].total / pageSize)),
    },
  };
}

module.exports = {
  toBookingDto,
  findActiveBooking,
  createBooking,
  findBookingForUpdate,
  cancelBooking,
  listBookingsForUser,
};
