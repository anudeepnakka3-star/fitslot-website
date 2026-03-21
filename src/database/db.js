const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

let DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../fitslot.db');

// Vercel read-only filesystem workaround
if (process.env.VERCEL) {
  const tmpPath = '/tmp/fitslot.db';
  if (!fs.existsSync(tmpPath)) {
    try {
      const sourcePath = path.resolve(__dirname, '../../fitslot.db');
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, tmpPath);
      }
    } catch (e) {
      console.error('Failed to copy SQLite database to writable /tmp directory:', e);
    }
  }
  DB_PATH = tmpPath;
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

// Migrate: add google_id column to users if missing
try { db.exec('ALTER TABLE users ADD COLUMN google_id TEXT'); } catch { }
// Migrate: add new profile columns to users
try { db.exec('ALTER TABLE users ADD COLUMN department TEXT'); } catch { }
try { db.exec('ALTER TABLE users ADD COLUMN class_section TEXT'); } catch { }
try { db.exec('ALTER TABLE users ADD COLUMN photo_url TEXT'); } catch { }

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    password_hash TEXT,          -- NULL for Google-only accounts
    role        TEXT NOT NULL DEFAULT 'student',  -- 'student' | 'admin'
    roll_number TEXT,
    google_id   TEXT,
    no_show_count INTEGER NOT NULL DEFAULT 0,
    blocked_until TEXT,  -- ISO date string or NULL
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS slots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    start_time  TEXT NOT NULL,  -- "HH:MM" 24h
    end_time    TEXT NOT NULL,  -- "HH:MM" 24h
    capacity    INTEGER NOT NULL DEFAULT 15,
    is_active   INTEGER NOT NULL DEFAULT 1,
    is_demo     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    slot_id         INTEGER NOT NULL REFERENCES slots(id),
    date            TEXT NOT NULL,  -- "YYYY-MM-DD"
    status          TEXT NOT NULL DEFAULT 'confirmed',  -- 'confirmed'|'waitlist'|'cancelled'
    waitlist_position INTEGER,
    workout_notes   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, slot_id, date)
  );

  CREATE TABLE IF NOT EXISTS workout_categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE,
    icon  TEXT
  );

  CREATE TABLE IF NOT EXISTS booking_categories (
    booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES workout_categories(id),
    PRIMARY KEY (booking_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',  -- 'present'|'absent'|'pending'
    marked_at   TEXT,
    marked_by   INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message     TEXT NOT NULL,
    type        TEXT DEFAULT 'info',  -- 'info'|'warning'|'success'|'error'
    is_read     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_user_date ON bookings(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_bookings_slot_date ON bookings(slot_id, date);
  CREATE INDEX IF NOT EXISTS idx_attendance_booking ON attendance(booking_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

`);

// Migrate: add is_demo to slots table
try { db.exec('ALTER TABLE slots ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0'); } catch { }

// Seed: Insert the demo slot if it doesn't already exist
try {
    const demoExists = db.prepare('SELECT id FROM slots WHERE is_demo = 1').get();
    if (!demoExists) {
        db.prepare(`
            INSERT INTO slots (name, start_time, end_time, capacity, is_active, is_demo)
            VALUES ('Demo Slot', '15:00', '16:00', 15, 1, 1)
        `).run();
    }
} catch (e) {
    console.error('Error inserting Demo Slot:', e);
}

module.exports = db;
