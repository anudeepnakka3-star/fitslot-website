const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

let activePool = null;
let isInMemory = false;

// Create primary PG pool
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
});

async function query(text, params) {
    if (!activePool) {
        throw new Error('Database pool not initialized. Call initDb() first.');
    }
    try {
        return await activePool.query(text, params);
    } catch (err) {
        console.error('❌ Database Query Error:', {
            message: err.message,
            code: err.code,
            detail: err.detail,
        });
        throw err;
    }
}

async function getClient() {
    if (!activePool) {
        throw new Error('Database pool not initialized. Call initDb() first.');
    }
    return activePool.connect();
}

async function seedInitialData(targetQuery) {
    const slots = [
        { name: 'Early Morning 1', start_time: '06:00', end_time: '07:00' },
        { name: 'Early Morning 2', start_time: '07:00', end_time: '08:00' },
        { name: 'Evening 1', start_time: '16:00', end_time: '17:00' },
        { name: 'Evening 2', start_time: '17:00', end_time: '18:00' },
        { name: 'Night 1', start_time: '18:00', end_time: '19:00' },
        { name: 'Night 2', start_time: '19:00', end_time: '20:00' },
    ];

    const categories = [
        { name: 'Chest', icon: '💪' },
        { name: 'Triceps', icon: '💪' },
        { name: 'Biceps', icon: '💪' },
        { name: 'Back', icon: '🏋️' },
        { name: 'Shoulders', icon: '🏋️' },
        { name: 'Abs', icon: '🔥' },
        { name: 'Forearms', icon: '💪' },
        { name: 'Legs', icon: '🦵' },
        { name: 'Cardio', icon: '🏃' },
    ];

    for (const s of slots) {
        await targetQuery(
            'INSERT INTO slots (name, start_time, end_time, capacity) VALUES ($1, $2, $3, 15)',
            [s.name, s.start_time, s.end_time]
        );
    }

    for (const c of categories) {
        await targetQuery(
            'INSERT INTO workout_categories (name, icon) VALUES ($1, $2)',
            [c.name, c.icon]
        );
    }

    const adminEmail = 'admin@bvrit.ac.in';
    const adminPassword = 'admin123';
    const adminHash = bcrypt.hashSync(adminPassword, 10);
    await targetQuery(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        ['Gym Admin', adminEmail, adminHash, 'admin']
    );

    const studentEmail = 'student@bvrit.ac.in';
    const studentPassword = 'student123';
    const studentHash = bcrypt.hashSync(studentPassword, 10);
    await targetQuery(
        'INSERT INTO users (name, email, password_hash, role, roll_number) VALUES ($1, $2, $3, $4, $5)',
        ['Demo Student', studentEmail, studentHash, 'student', '22B21A0001']
    );

    console.log('🌱 Default seed data populated into in-memory database');
}

async function createSchema(targetQuery) {
    await targetQuery(`
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

    const demoExists = await targetQuery('SELECT id FROM slots WHERE is_demo = 1');
    if (demoExists.rows.length === 0) {
        await targetQuery(
            `INSERT INTO slots (name, start_time, end_time, capacity, is_active, is_demo)
             VALUES ('Demo Slot', '15:00', '16:00', 15, 1, 1)`
        );
    }
}

async function initDb() {
    let pgWorking = false;

    if (process.env.DATABASE_URL) {
        try {
            const client = await pgPool.connect();
            await client.query('SELECT 1');
            client.release();
            activePool = pgPool;
            pgWorking = true;
            console.log('✅ Database connected (Remote PostgreSQL)');
        } catch (err) {
            console.warn(`⚠️ Remote PostgreSQL connection failed (${err.message}). Falling back to local in-memory PostgreSQL...`);
        }
    }

    if (!pgWorking) {
        const { newDb, DataType } = require('pg-mem');
        const memDb = newDb();
        memDb.public.registerFunction({
            name: 'now',
            returns: DataType.timestamp,
            implementation: () => new Date(),
        });

        activePool = new (memDb.adapters.createPg().Pool)();
        isInMemory = true;
        console.log('💡 Active Database: Local In-Memory PostgreSQL (pg-mem)');
    }

    await createSchema((t, p) => activePool.query(t, p));

    if (isInMemory) {
        const userCount = await activePool.query('SELECT COUNT(*)::int as cnt FROM users');
        if (userCount.rows[0].cnt === 0) {
            await seedInitialData((t, p) => activePool.query(t, p));
        }
    }

    console.log('✅ Database schema ready');
}

const proxyPool = new Proxy({}, {
    get(target, prop) {
        if (!activePool) {
            if (prop === 'query') return query;
            if (prop === 'connect') return getClient;
            return undefined;
        }
        const val = activePool[prop];
        return typeof val === 'function' ? val.bind(activePool) : val;
    }
});

module.exports = { query, getClient, initDb, pool: proxyPool };

