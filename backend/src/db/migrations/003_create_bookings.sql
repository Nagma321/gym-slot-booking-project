-- Bookings. A user may have at most one ACTIVE booking per slot; this is
-- enforced with a partial unique index rather than relying solely on
-- application logic, so it holds even under concurrent inserts.
CREATE TABLE IF NOT EXISTS bookings (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_id         BIGINT              NOT NULL REFERENCES gym_slots(id) ON DELETE CASCADE,
    status          VARCHAR(20)         NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT now(),
    cancelled_at    TIMESTAMPTZ,

    CONSTRAINT bookings_status_valid CHECK (status IN ('ACTIVE', 'CANCELLED'))
);

-- Partial unique index: only one ACTIVE booking per (user, slot) pair is
-- allowed. A user may re-book after cancelling, which creates a new row,
-- so this does not block legitimate re-bookings.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_booking_per_user_slot
    ON bookings (user_id, slot_id)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_slot_id ON bookings (slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_slot_status ON bookings (slot_id, status);
