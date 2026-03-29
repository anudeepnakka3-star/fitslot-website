const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Helper: run a query with parameterized values
async function query(text, params) {
    try {
        return await pool.query(text, params);
    } catch (err) {
        console.error('❌ Database Query Error:', {
            message: err.message,
            code: err.code,
            detail: err.detail,
            hint: err.hint,
            stack: err.stack
        });
        throw err;
    }
}

// Helper: get a client from the pool (for transactions)
async function getClient() {
    return pool.connect();
}

// ─── Schema ───────────────────────────────────────────────────────────────────
async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id              SERIAL PRIMARY KEY,
            name            TEXT NOT NULL,
            email           TEXT NOT NULL UNIQUE,
            password_hash   TEXT,
            role            TEXT NOT NULL DEFAULT 'student',
            roll_number     TEXT,
            google_id       TEXT,
            department      TEXT,
            class_section   TEXT,
            photo_url       TEXT,
            no_show_count   INTEGER NOT NULL DEFAULT 0,
            blocked_until   TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS slots (
            id          SERIAL PRIMARY KEY,
            name        TEXT NOT NULL,
            start_time  TEXT NOT NULL,
            end_time    TEXT NOT NULL,
            capacity    INTEGER NOT NULL DEFAULT 15,
            is_active   INTEGER NOT NULL DEFAULT 1,
            is_demo     INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS bookings (
            id                  SERIAL PRIMARY KEY,
            user_id             INTEGER NOT NULL REFERENCES users(id),
            slot_id             INTEGER NOT NULL REFERENCES slots(id),
            date                TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'confirmed',
            waitlist_position   INTEGER,
            workout_notes       TEXT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, slot_id, date)
        );

        CREATE TABLE IF NOT EXISTS workout_categories (
            id      SERIAL PRIMARY KEY,
            name    TEXT NOT NULL UNIQUE,
            icon    TEXT
        );

        CREATE TABLE IF NOT EXISTS booking_categories (
            booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
            category_id INTEGER NOT NULL REFERENCES workout_categories(id),
            PRIMARY KEY (booking_id, category_id)
        );

        CREATE TABLE IF NOT EXISTS attendance (
            id          SERIAL PRIMARY KEY,
            booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
            date        TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'pending',
            marked_at   TEXT,
            marked_by   INTEGER REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            message     TEXT NOT NULL,
            type        TEXT DEFAULT 'info',
            is_read     INTEGER NOT NULL DEFAULT 0,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash  TEXT NOT NULL,
            expires_at  TEXT NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_bookings_user_date ON bookings(user_id, date);
        CREATE INDEX IF NOT EXISTS idx_bookings_slot_date ON bookings(slot_id, date);
        CREATE INDEX IF NOT EXISTS idx_attendance_booking ON attendance(booking_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON password_reset_tokens(token_hash);
    `);

    // Seed: Insert the demo slot if it doesn't already exist
    const demoExists = await pool.query('SELECT id FROM slots WHERE is_demo = 1');
    if (demoExists.rows.length === 0) {
        await pool.query(
            `INSERT INTO slots (name, start_time, end_time, capacity, is_active, is_demo)
             VALUES ('Demo Slot', '15:00', '16:00', 15, 1, 1)`
        );
    }

    console.log('✅ Database schema initialized (PostgreSQL)');
}

module.exports = { query, getClient, initDb, pool };
