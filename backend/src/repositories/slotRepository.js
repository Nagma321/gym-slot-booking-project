const { query } = require('../config/postgres');

function toSlotDto(row) {
  const remaining = row.capacity - row.booked_count;
  return {
    id: row.id,
    date: row.slot_date,
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
    bookedCount: row.booked_count,
    remainingCapacity: remaining,
    isFull: remaining <= 0,
  };
}

async function listSlots({ page, pageSize }) {
  const offset = (page - 1) * pageSize;
  const [{ rows }, { rows: countRows }] = await Promise.all([
    query(
      `SELECT id, slot_date, start_time, end_time, capacity, booked_count
       FROM gym_slots
       ORDER BY slot_date ASC, start_time ASC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    ),
    query('SELECT COUNT(*)::int AS total FROM gym_slots'),
  ]);

  return {
    slots: rows.map(toSlotDto),
    pagination: {
      page,
      pageSize,
      total: countRows[0].total,
      totalPages: Math.max(1, Math.ceil(countRows[0].total / pageSize)),
    },
  };
}

async function findById(slotId) {
  const { rows } = await query(
    `SELECT id, slot_date, start_time, end_time, capacity, booked_count
     FROM gym_slots WHERE id = $1`,
    [slotId]
  );
  return rows[0] ? toSlotDto(rows[0]) : null;
}

/**
 * Lock the slot row for update within an existing transaction client.
 * Must be called inside `withTransaction`. This is the crux of the
 * concurrency-safety guarantee: any other transaction attempting to
 * SELECT ... FOR UPDATE the same row will block until this transaction
 * commits or rolls back, so read-check-write is effectively atomic.
 */
async function lockSlotForUpdate(client, slotId) {
  const { rows } = await client.query(
    `SELECT id, slot_date, start_time, end_time, capacity, booked_count
     FROM gym_slots
     WHERE id = $1
     FOR UPDATE`,
    [slotId]
  );
  return rows[0] || null;
}

async function incrementBookedCount(client, slotId) {
  const { rows } = await client.query(
    `UPDATE gym_slots
     SET booked_count = booked_count + 1
     WHERE id = $1
     RETURNING id, capacity, booked_count`,
    [slotId]
  );
  return rows[0];
}

async function decrementBookedCount(client, slotId) {
  const { rows } = await client.query(
    `UPDATE gym_slots
     SET booked_count = GREATEST(booked_count - 1, 0)
     WHERE id = $1
     RETURNING id, capacity, booked_count`,
    [slotId]
  );
  return rows[0];
}

module.exports = {
  toSlotDto,
  listSlots,
  findById,
  lockSlotForUpdate,
  incrementBookedCount,
  decrementBookedCount,
};
