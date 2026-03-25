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
router.get('/', requireAdmin, async (req, res) => {
    try {
        const { slot_id, date } = req.query;
        const queryDate = date || todayIST();

        let query = `
            SELECT b.id as booking_id, b.status as booking_status,
                   u.id as user_id, u.name, u.email, u.roll_number, u.no_show_count,
                   a.id as attendance_id, a.status as attendance_status, a.marked_at
            FROM bookings b
            JOIN users u ON u.id = b.user_id
            LEFT JOIN attendance a ON a.booking_id = b.id AND a.date = $1
            WHERE b.date = $2 AND b.status = 'confirmed'
        `;
        const params = [queryDate, queryDate];
        let paramIdx = 3;

        if (slot_id) {
            query += ` AND b.slot_id = $${paramIdx}`;
            params.push(slot_id);
            paramIdx++;
        }

        query += ' ORDER BY u.name ASC';
        const { rows: records } = await db.query(query, params);
        res.json({ records, date: queryDate });
    } catch (err) {
        console.error('Attendance list error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/attendance/mark — bulk mark attendance
router.post('/mark', requireAdmin, async (req, res) => {
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: 'entries array is required' });
    }

    const client = await db.getClient();
    const now = new Date().toISOString();
    const noShowUpdated = [];

    try {
        await client.query('BEGIN');

        for (const entry of entries) {
            const { booking_id, status } = entry;
            if (!booking_id || !['present', 'absent'].includes(status)) continue;

            const { rows: bookingRows } = await client.query('SELECT * FROM bookings WHERE id = $1', [booking_id]);
            const booking = bookingRows[0];
            if (!booking) continue;

            // Upsert attendance record
            const { rows: existingRows } = await client.query('SELECT id FROM attendance WHERE booking_id = $1', [booking_id]);
            if (existingRows.length > 0) {
                await client.query(
                    'UPDATE attendance SET status = $1, marked_at = $2, marked_by = $3 WHERE booking_id = $4',
                    [status, now, req.user.id, booking_id]
                );
            } else {
                await client.query(
                    'INSERT INTO attendance (booking_id, date, status, marked_at, marked_by) VALUES ($1, $2, $3, $4, $5)',
                    [booking_id, booking.date, status, now, req.user.id]
                );
            }

            // If absent, increment no-show counter
            if (status === 'absent') {
                const { rows: userRows } = await client.query('SELECT * FROM users WHERE id = $1', [booking.user_id]);
                const user = userRows[0];
                const newCount = user.no_show_count + 1;
                await client.query('UPDATE users SET no_show_count = $1 WHERE id = $2', [newCount, user.id]);

                await client.query('INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)', [
                    user.id,
                    `⚠️ You were marked absent for your gym slot on ${booking.date}. No-show count: ${newCount}/${NO_SHOW_BLOCK_THRESHOLD}`,
                    'warning'
                ]);

                if (newCount >= NO_SHOW_BLOCK_THRESHOLD) {
                    const unblockDate = new Date();
                    unblockDate.setDate(unblockDate.getDate() + BLOCK_DAYS);
                    await client.query('UPDATE users SET blocked_until = $1 WHERE id = $2', [unblockDate.toISOString(), user.id]);
                    await client.query('INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)', [
                        user.id,
                        `🚫 Your account has been blocked until ${unblockDate.toLocaleDateString('en-IN')} due to ${NO_SHOW_BLOCK_THRESHOLD} no-shows.`,
                        'error'
                    ]);
                    noShowUpdated.push({ user_id: user.id, name: user.name, blocked: true });
                } else {
                    noShowUpdated.push({ user_id: user.id, name: user.name, no_show_count: newCount, blocked: false });
                }
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Attendance marked successfully', updates: noShowUpdated });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Attendance mark error:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

// GET /api/attendance/student — student's own attendance history
router.get('/student', requireAuth, async (req, res) => {
    try {
        const { rows: records } = await db.query(`
            SELECT a.*, b.date, s.name as slot_name, s.start_time, s.end_time
            FROM attendance a
            JOIN bookings b ON b.id = a.booking_id
            JOIN slots s ON s.id = b.slot_id
            WHERE b.user_id = $1
            ORDER BY b.date DESC
        `, [req.user.id]);
        res.json({ records });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
