-- Gym slots. `booked_count` is maintained transactionally alongside
-- bookings (see booking repository) so that reads never require counting
-- rows in the bookings table. It is only ever mutated inside a
-- transaction that holds a row lock on the slot (SELECT ... FOR UPDATE),
-- which is what makes the booking flow race-condition safe.
CREATE TABLE IF NOT EXISTS gym_slots (
    id              BIGSERIAL PRIMARY KEY,
    slot_date       DATE                NOT NULL,
    start_time      TIME                NOT NULL,
    end_time        TIME                NOT NULL,
    capacity        INTEGER             NOT NULL DEFAULT 10,
    booked_count    INTEGER             NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT now(),

    CONSTRAINT gym_slots_capacity_positive CHECK (capacity > 0),
    CONSTRAINT gym_slots_booked_count_nonnegative CHECK (booked_count >= 0),
    -- Database-level guarantee: booked_count can never exceed capacity.
    -- This is a defense-in-depth check; the application-level row lock is
    -- the primary mechanism, but this constraint makes an invalid state
    -- physically impossible even if application code has a bug.
    CONSTRAINT gym_slots_booked_count_within_capacity CHECK (booked_count <= capacity),
    CONSTRAINT gym_slots_time_order CHECK (end_time > start_time),
    CONSTRAINT gym_slots_unique_date_time UNIQUE (slot_date, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_gym_slots_date ON gym_slots (slot_date);
