# Gym Slot Booking

A full-stack gym slot booking system where authenticated users book fixed-capacity
gym slots (10 people each). The core engineering challenge this project solves is
**correctness under concurrency**: when a slot has exactly one spot left and
multiple users try to book it at the same instant, exactly one must succeed and
the rest must fail cleanly, with the database never exceeding capacity.

## 1. Project Overview

- Users register, log in, and see a list of gym slots with live remaining capacity.
- Booking a slot is safe under concurrent load: PostgreSQL row-level locking
  (`SELECT ... FOR UPDATE`) inside a real transaction guarantees no overbooking,
  regardless of frontend behavior or Redis availability.
- Users can cancel their own bookings, which atomically frees up capacity.
- Every booking-relevant event is audited to MongoDB.
- Slot listings are cached in Redis with short TTLs and are invalidated
  immediately after any successful booking/cancellation.

## 2. Main Features

- JWT authentication (register/login), bcrypt password hashing
- View gym slots with capacity, booked count, and remaining spots
- Concurrency-safe booking (PostgreSQL transaction + row lock)
- Duplicate active booking prevention (partial unique index)
- Booking cancellation with capacity restoration
- Redis caching for the slots listing endpoint
- Redis-backed rate limiting on `POST /api/bookings` (fails open if Redis is down)
- MongoDB audit/activity log (registrations, logins, bookings, rejections, cancellations)
- Centralized error handling, consistent JSON responses, no leaked stack traces
- Automated concurrency test (Jest) + a standalone concurrency demonstration script

## 3. Architecture Overview

```
┌────────────┐      HTTPS/JSON      ┌──────────────────┐
│   React    │ ───────────────────▶ │  Express API      │
│  (Vite)    │ ◀─────────────────── │  (Node.js)         │
└────────────┘                      └────────┬──────────┘
                                              │
                     ┌────────────────────────┼─────────────────────────┐
                     ▼                        ▼                         ▼
             ┌───────────────┐        ┌──────────────┐          ┌──────────────┐
             │  PostgreSQL   │        │    Redis     │          │   MongoDB    │
             │ (source of    │        │ (cache +     │          │ (audit/      │
             │  truth;       │        │  rate limit) │          │  activity    │
             │  transactions │        └──────────────┘          │  log)        │
             │  + row locks) │                                  └──────────────┘
             └───────────────┘
```

PostgreSQL is the **only** system whose availability affects booking correctness.
Redis and MongoDB are supporting technologies: if either is down, the API keeps
working (cache misses fall through to Postgres; rate limiting fails open; audit
writes are best-effort and logged locally on failure).

## 4. Technology Stack

| Layer          | Technology                                   |
|----------------|-----------------------------------------------|
| Frontend       | React 18, Vite, React Router                  |
| Backend        | Node.js, Express                              |
| Primary DB     | PostgreSQL (via `pg`, raw SQL, no ORM)        |
| Audit log      | MongoDB (via Mongoose)                        |
| Cache/limiter  | Redis (via `redis` v4 client)                 |
| Auth           | JWT (`jsonwebtoken`), bcrypt (`bcryptjs`)     |
| Validation     | Zod                                           |
| Testing        | Jest, Supertest                               |

## 5. Project Structure

```
gym-slot-booking-project/
├── docker-compose.yml        # PostgreSQL + MongoDB + Redis infra
├── backend/
│   ├── src/
│   │   ├── config/           # env, postgres pool, redis client, mongo connection
│   │   ├── controllers/      # thin HTTP layer
│   │   ├── services/         # business logic (booking, auth, cache, audit)
│   │   ├── repositories/     # SQL queries (parameterized, no raw string concat)
│   │   ├── routes/           # Express routers
│   │   ├── middleware/       # auth, validation, rate limiting, error handling
│   │   ├── validators/       # Zod schemas
│   │   ├── models/           # Mongoose ActivityLog model
│   │   ├── db/                # migrations, migration runner, seed script
│   │   ├── utils/            # ApiError, logger, asyncHandler, jwt helpers
│   │   ├── app.js
│   │   └── server.js
│   ├── tests/
│   │   ├── integration/booking.test.js       # auth/slots/bookings integration tests
│   │   ├── concurrency/concurrency.test.js   # automated Jest concurrency test
│   │   └── concurrency/concurrency-script.js # standalone HTTP-level demo script
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api/client.js       # fetch wrapper for the backend API
    │   ├── context/AuthContext.jsx
    │   ├── components/         # Navbar, SlotCard, ProtectedRoute
    │   ├── pages/               # SlotsPage, LoginPage, RegisterPage, MyBookingsPage
    │   └── styles/global.css
    ├── .env.example
    └── package.json
```

## 6. Prerequisites

- Node.js 18+ and npm
- Docker + Docker Compose (recommended), **or** local PostgreSQL 14+, MongoDB 6+,
  and Redis 6+ installed and running

## 7. Environment Setup

Backend:
```bash
cd backend
cp .env.example .env
# Edit .env if your local ports/credentials differ from the defaults.
```

Frontend:
```bash
cd frontend
cp .env.example .env
# VITE_API_BASE_URL defaults to http://localhost:4000/api
```

Environment variable names are consistent across `backend/.env.example`,
`docker-compose.yml`, and `backend/src/config/*.js`.

## 8. Docker Instructions (infrastructure only)

```bash
docker compose up -d
```

This starts PostgreSQL (5432), MongoDB (27017), and Redis (6379) with healthchecks
and persistent volumes. The backend and frontend are run directly with Node/npm
(see below) against these containers — this keeps app-code iteration fast without
rebuilding images on every change.

## 9. Database Initialization / Migrations

Hand-rolled, dependency-light SQL migration runner (`backend/src/db/migrate.js`).
It tracks applied migrations in a `schema_migrations` table and applies any new
`.sql` files under `backend/src/db/migrations/` in filename order.

```bash
cd backend
npm run migrate
```

## 10. Seed Data

```bash
npm run seed          # inserts slots for the next 3 days if not already present
npm run seed:reset    # wipes bookings + slots (not users) and reseeds
```

Seeds 6 slots/day (06:00–07:00 ... 19:00–20:00) for 3 days, plus a demo user:
`demo@example.com` / `DemoPassword123!`.

## 11. Running the Backend

```bash
cd backend
npm install
npm run migrate
npm run seed
npm run dev      # nodemon, or `npm start` for a plain node run
```

The API listens on `http://localhost:4000` by default. Check `GET /api/health`
for live Postgres/Redis/Mongo connectivity status.

## 12. Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:5173` (Vite default) and talks to the backend via
`VITE_API_BASE_URL`.

## 13. API Overview

All responses are JSON: `{ success: true, data: ... }` or `{ success: false, error: { message, details? } }`.

| Method | Path                     | Auth | Description                          |
|--------|---------------------------|------|---------------------------------------|
| POST   | `/api/auth/register`      | No   | Register a new user                   |
| POST   | `/api/auth/login`         | No   | Log in, returns JWT + user             |
| GET    | `/api/slots`              | No   | Paginated slot list (Redis-cached)     |
| GET    | `/api/slots/:id`          | No   | Single slot                            |
| POST   | `/api/bookings`           | Yes  | Book a slot (rate-limited)             |
| DELETE | `/api/bookings/:bookingId`| Yes  | Cancel own booking                     |
| GET    | `/api/bookings/me`        | Yes  | List authenticated user's bookings     |
| GET    | `/api/health`             | No   | Postgres/Redis/Mongo connectivity      |

## 14. Authentication Usage

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"DemoPassword123!"}'
```

Use the returned `token` as `Authorization: Bearer <token>` on protected routes.

## 15. Redis Caching Strategy

- `GET /api/slots` (and `GET /api/slots/:id`) check Redis first (`cache:slots:*` keys).
- On a cache miss, PostgreSQL is queried and the result is cached with a short TTL
  (`SLOTS_CACHE_TTL_SECONDS`, default 15s).
- After any successful booking or cancellation **commit**, all slot-related cache
  keys are invalidated via `SCAN` + `DEL` (never `KEYS`, to avoid blocking Redis).
- If Redis is unreachable, cache reads/writes fail silently and the app falls back
  to PostgreSQL directly — Redis is never a correctness dependency.

## 16. Concurrency Strategy Summary

The booking flow (`backend/src/services/bookingService.js`) runs entirely inside
one PostgreSQL transaction:

1. `BEGIN`
2. `SELECT * FROM gym_slots WHERE id = $1 FOR UPDATE` — takes an exclusive
   row-level lock. Any other transaction trying to lock the *same* slot row
   blocks here until this transaction commits or rolls back.
3. Check `booked_count < capacity` and check for an existing active booking
   for this user.
4. If full → throw, which triggers `ROLLBACK` and a `409` response.
5. Otherwise, `INSERT` the booking and `UPDATE gym_slots SET booked_count = booked_count + 1`.
6. `COMMIT` — releases the lock, so the next queued transaction can proceed
   and will see the *updated* `booked_count`.
7. Only after the commit succeeds: invalidate the Redis cache and write a
   MongoDB audit event (best-effort, never rolls back the booking).

Because step 2's lock forces every concurrent request for the same slot to be
serialized around the read-check-write sequence, it is impossible for two
transactions to both read "1 spot left" and both insert a booking. A
`CHECK (booked_count <= capacity)` constraint on `gym_slots` and a partial
unique index on `(user_id, slot_id) WHERE status = 'ACTIVE'` on `bookings`
provide defense-in-depth at the schema level even if application code had a bug.

Cancellation follows the same pattern: lock the booking row, lock the slot row,
decrement `booked_count`, commit.

## 17. Running the Concurrency Demonstration

**Automated Jest test** (in-process, exercises the full Express → service →
PostgreSQL path):
```bash
cd backend
npm run test:concurrency
```

**Standalone script** (real HTTP requests against a running server — proves the
deployed API is safe, not just the code path):
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd backend && npm run concurrency:script
```

The script creates an isolated slot with 9 filler bookings (1 spot left),
registers 3 fresh users, fires all 3 booking requests via `Promise.all`, and
asserts: exactly 1× `201`, exactly 2× `409`, final `booked_count === 10`, and
active booking rows === 10. It cleans up all data it creates. **This was run in
this environment and passed** — see the Verification Report below.

## 18. Running Tests

```bash
cd backend
npm run migrate           # ensure the test DB schema exists (NODE_ENV=test uses TEST_PG_DATABASE)
npm test                  # all Jest suites (integration + concurrency)
npm run test:integration  # auth/slots/bookings only
npm run test:concurrency  # concurrency test only
```

Tests run against a **separate** database (`TEST_PG_DATABASE`, default
`gym_slot_booking_test`) so they never touch your development data.

## 19. Important Technical Decisions

- **`booked_count` on `gym_slots` instead of `COUNT(*)` on every read**: chosen
  because it makes the locking story simple — one row to lock, one column to
  check — and it's kept authoritative by only ever being mutated inside the
  same transaction that holds the slot's row lock.
- **Raw SQL via `pg`, no ORM**: for a project whose entire point is precise
  transaction/locking control, hand-written SQL is more auditable than an ORM's
  abstraction over transactions.
- **Rate limiting implemented directly with `INCR`/`PEXPIRE`** rather than a
  third-party Redis-store adapter: fewer moving parts, easy to reason about,
  and fails open (allows the request) on any Redis error so a Redis hiccup
  never blocks legitimate bookings.
- **Audit logging is fire-and-forget after commit**: a MongoDB outage must
  never roll back a successful, already-committed PostgreSQL booking.

## 20. Known Limitations

- No admin UI for creating/editing gym slots (seed script only) — out of scope
  per the assessment brief.
- No email verification or password reset flow.
- Rate limiting is a simple fixed-window counter (not sliding window), and its
  in-memory fallback is per-process (not shared across multiple backend
  instances) when Redis is unavailable — acceptable since it's an abuse
  safeguard, not a correctness mechanism.
- Pagination on slots/bookings is offset-based, fine at this scale but would
  need cursor-based pagination at much larger volumes.
- MongoDB was not installable in the sandbox this project was built and
  verified in (see Verification Report in the final delivery message) — the
  integration code was written and manually reasoned through, but live writes
  to Mongo were not exercised in this environment. The app is designed to
  degrade gracefully in exactly this situation, which was itself verified.
