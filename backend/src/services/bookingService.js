const { withTransaction } = require('../config/postgres');
const slotRepository = require('../repositories/slotRepository');
const bookingRepository = require('../repositories/bookingRepository');
const cacheService = require('./cacheService');
const { logActivity } = require('./activityLogService');
const ApiError = require('../utils/ApiError');

/**
 * Create a booking for `userId` on `slotId`.
 *
 * CONCURRENCY-SAFETY (the core requirement of this project):
 *
 * Everything between BEGIN and COMMIT happens against a single
 * PostgreSQL connection acquired for this transaction. The critical line
 * is `slotRepository.lockSlotForUpdate`, which issues:
 *
 *     SELECT ... FROM gym_slots WHERE id = $1 FOR UPDATE
 *
 * `FOR UPDATE` takes a row-level exclusive lock on that specific
 * gym_slots row. If three requests for the same slot arrive at
 * (approximately) the same instant:
 *
 *   1. The first transaction to reach this line acquires the lock and
 *      proceeds; the other two BLOCK inside PostgreSQL at this exact
 *      statement, they do not get "stale" data - they simply wait.
 *   2. The first transaction checks booked_count < capacity, inserts the
 *      booking, increments booked_count, and COMMITs. The lock is
 *      released on commit.
 *   3. The second transaction is unblocked, acquires the lock, and now
 *      reads the UPDATED booked_count (its SELECT happens after the
 *      first transaction's write because it was blocked until the lock
 *      was free) - it sees the slot is now full and rolls back with a
 *      409 without ever writing a row.
 *   4. Same for the third transaction.
 *
 * This is what makes "read capacity, check, write" atomic: no other
 * transaction can read the row in between this transaction's read and
 * write, because it is blocked from reading (via FOR UPDATE) until this
 * transaction finishes. The application code deliberately never does a
 * plain `SELECT` followed by a separate `UPDATE`/`INSERT` without first
 * taking this lock.
 *
 * A `CHECK (booked_count <= capacity)` constraint on gym_slots and a
 * partial unique index on (user_id, slot_id) for ACTIVE bookings provide
 * defense-in-depth at the database level even if this code ever had a
 * bug.
 */
async function createBooking({ userId, slotId }) {
  const result = await withTransaction(async (client) => {
    const slot = await slotRepository.lockSlotForUpdate(client, slotId);
    if (!slot) {
      throw ApiError.notFound('Gym slot not found');
    }

    const existingActive = await bookingRepository.findActiveBooking(client, userId, slotId);
    if (existingActive) {
      throw ApiError.conflict('You already have an active booking for this slot');
    }

    if (slot.booked_count >= slot.capacity) {
      // Full - roll back (thrown error triggers ROLLBACK in withTransaction)
      // and surface a clear 409. Also flag this outcome so the caller can
      // write a BOOKING_REJECTED_FULL audit event after the transaction
      // has definitively ended.
      const err = ApiError.conflict('This slot is full');
      err.rejectionReason = 'FULL';
      throw err;
    }

    const booking = await bookingRepository.createBooking(client, { userId, slotId });
    const updatedSlot = await slotRepository.incrementBookedCount(client, slotId);

    return { booking, updatedSlot };
  }).catch(async (err) => {
    // Audit rejected attempts too (full slot), without affecting the
    // already-rolled-back transaction. Duplicate-active-booking errors are
    // also logged for visibility.
    if (err.rejectionReason === 'FULL' || err.statusCode === 409) {
      await logActivity({
        userId,
        action: 'BOOKING_REJECTED_FULL',
        slotId,
        metadata: { reason: err.message },
      });
    }
    throw err;
  });

  // Cache is only touched AFTER a successful commit, per requirements.
  await cacheService.invalidateSlotsCache(slotId);

  await logActivity({
    userId,
    action: 'BOOKING_CREATED',
    slotId,
    bookingId: result.booking.id,
    metadata: {
      remainingCapacity: result.updatedSlot.capacity - result.updatedSlot.booked_count,
    },
  });

  return bookingRepository.toBookingDto(result.booking);
}

/**
 * Cancel a booking owned by `userId`. Locks the booking row (and, via the
 * FK relationship, coordinates with the slot update) inside a single
 * transaction so capacity restoration is atomic with the cancellation.
 */
async function cancelBooking({ userId, bookingId }) {
  const result = await withTransaction(async (client) => {
    const booking = await bookingRepository.findBookingForUpdate(client, bookingId);
    if (!booking) {
      throw ApiError.notFound('Booking not found');
    }
    if (booking.user_id !== userId) {
      throw ApiError.forbidden('You can only cancel your own bookings');
    }
    if (booking.status === 'CANCELLED') {
      throw ApiError.conflict('This booking has already been cancelled');
    }

    // Lock the slot row too before decrementing, for the same reason as
    // in createBooking: prevents interleaving with a concurrent booking
    // attempt on the same slot.
    const slot = await slotRepository.lockSlotForUpdate(client, booking.slot_id);
    const cancelled = await bookingRepository.cancelBooking(client, bookingId);
    const updatedSlot = await slotRepository.decrementBookedCount(client, slot.id);

    return { cancelled, updatedSlot };
  });

  await cacheService.invalidateSlotsCache(result.cancelled.slot_id);

  await logActivity({
    userId,
    action: 'BOOKING_CANCELLED',
    slotId: result.cancelled.slot_id,
    bookingId: result.cancelled.id,
  });

  return bookingRepository.toBookingDto(result.cancelled);
}

async function listMyBookings(userId, { page, pageSize }) {
  return bookingRepository.listBookingsForUser(userId, { page, pageSize });
}

module.exports = { createBooking, cancelBooking, listMyBookings };
