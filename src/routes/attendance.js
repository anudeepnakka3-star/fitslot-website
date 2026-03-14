const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const NO_SHOW_BLOCK_THRESHOLD = 3;
const BLOCK_DAYS = 7;

function todayIST() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// GET /api/attendance — list attendance for a slot on a date (admin)
router.get('/', requireAdmin, (req, res) => {
    const { slot_id, date } = req.query;
    const queryDate = date || todayIST();

    let query = `
    SELECT b.id as booking_id, b.status as booking_status,
           u.id as user_id, u.name, u.email, u.roll_number, u.no_show_count,
           a.id as attendance_id, a.status as attendance_status, a.marked_at
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN attendance a ON a.booking_id = b.id AND a.date = ?
    WHERE b.date = ? AND b.status = 'confirmed'
  `;
    const params = [queryDate, queryDate];

    if (slot_id) {
        query += ' AND b.slot_id = ?';
        params.push(slot_id);
    }

    query += ' ORDER BY u.name ASC';
    const records = db.prepare(query).all(...params);
    res.json({ records, date: queryDate });
});

// POST /api/attendance/mark — bulk mark attendance
router.post('/mark', requireAdmin, (req, res) => {
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: 'entries array is required' });
    }

    const now = new Date().toISOString();
    const noShowUpdated = [];

    // Prepared statements — no ON CONFLICT, use explicit check + insert/update
    const findAttendance = db.prepare('SELECT id FROM attendance WHERE booking_id = ?');
    const insertAttendance = db.prepare(
        'INSERT INTO attendance (booking_id, date, status, marked_at, marked_by) VALUES (?, ?, ?, ?, ?)'
    );
    const updateAttendance = db.prepare(
        'UPDATE attendance SET status = ?, marked_at = ?, marked_by = ? WHERE booking_id = ?'
    );

    db.transaction(() => {
        for (const entry of entries) {
            const { booking_id, status } = entry;
            if (!booking_id || !['present', 'absent'].includes(status)) continue;

            const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking_id);
            if (!booking) continue;

            // Upsert attendance record
            const existing = findAttendance.get(booking_id);
            if (existing) {
                updateAttendance.run(status, now, req.user.id, booking_id);
            } else {
                insertAttendance.run(booking_id, booking.date, status, now, req.user.id);
            }

            // If absent, increment no-show counter
            if (status === 'absent') {
                const user = db.prepare('SELECT * FROM users WHERE id = ?').get(booking.user_id);
                const newCount = user.no_show_count + 1;
                db.prepare('UPDATE users SET no_show_count = ? WHERE id = ?').run(newCount, user.id);

                db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(
                    user.id,
                    `⚠️ You were marked absent for your gym slot on ${booking.date}. No-show count: ${newCount}/${NO_SHOW_BLOCK_THRESHOLD}`,
                    'warning'
                );

                if (newCount >= NO_SHOW_BLOCK_THRESHOLD) {
                    const unblockDate = new Date();
                    unblockDate.setDate(unblockDate.getDate() + BLOCK_DAYS);
                    db.prepare('UPDATE users SET blocked_until = ? WHERE id = ?').run(unblockDate.toISOString(), user.id);
                    db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(
                        user.id,
                        `🚫 Your account has been blocked until ${unblockDate.toLocaleDateString('en-IN')} due to ${NO_SHOW_BLOCK_THRESHOLD} no-shows.`,
                        'error'
                    );
                    noShowUpdated.push({ user_id: user.id, name: user.name, blocked: true });
                } else {
                    noShowUpdated.push({ user_id: user.id, name: user.name, no_show_count: newCount, blocked: false });
                }
            }
        }
    })();

    res.json({ message: 'Attendance marked successfully', updates: noShowUpdated });
});

// GET /api/attendance/student — student's own attendance history
router.get('/student', requireAuth, (req, res) => {
    const records = db.prepare(`
    SELECT a.*, b.date, s.name as slot_name, s.start_time, s.end_time
    FROM attendance a
    JOIN bookings b ON b.id = a.booking_id
    JOIN slots s ON s.id = b.slot_id
    WHERE b.user_id = ?
    ORDER BY b.date DESC
  `).all(req.user.id);
    res.json({ records });
});

module.exports = router;
