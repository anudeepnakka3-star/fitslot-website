const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth } = require('../middleware/auth');

// Helper: get today's date as YYYY-MM-DD (IST)
function todayIST() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Helper: format HH:MM to Date today for comparison
function timeToDate(timeStr, dateStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(`${dateStr}T00:00:00+05:30`);
    d.setHours(h, m, 0, 0);
    return d;
}

// GET /api/slots  — list all slots with availability for today (or ?date=YYYY-MM-DD)
router.get('/', requireAuth, async (req, res) => {
    try {
        const date = req.query.date || todayIST();
        const now = new Date();

        const { rows: slots } = await db.query('SELECT * FROM slots WHERE is_active = 1 ORDER BY start_time');

        const result = [];
        for (const slot of slots) {
            // Confirmed bookings count (not cancelled)
            const { rows: confirmedRows } = await db.query(
                "SELECT COUNT(*) as cnt FROM bookings WHERE slot_id = $1 AND date = $2 AND status = 'confirmed'",
                [slot.id, date]
            );

            const { rows: waitlistRows } = await db.query(
                "SELECT COUNT(*) as cnt FROM bookings WHERE slot_id = $1 AND date = $2 AND status = 'waitlist'",
                [slot.id, date]
            );

            const confirmed = parseInt(confirmedRows[0].cnt);
            const waitlisted = parseInt(waitlistRows[0].cnt);
            const available = slot.capacity - confirmed;

            // Check booking window: opens 30 min before slot start
            const slotStart = timeToDate(slot.start_time, date);
            const slotEnd = timeToDate(slot.end_time, date);
            const windowOpen = new Date(slotStart.getTime() - 30 * 60 * 1000);

            let windowStatus = 'open';
            if (!slot.is_demo && now < windowOpen) windowStatus = 'not_yet';
            if (!slot.is_demo && now >= slotEnd) windowStatus = 'ended';

            // User's booking for this slot
            let userBooking = null;
            if (req.user) {
                const { rows: userRows } = await db.query(
                    "SELECT * FROM bookings WHERE user_id = $1 AND slot_id = $2 AND date = $3",
                    [req.user.id, slot.id, date]
                );
                userBooking = userRows[0] || null;
            }

            result.push({
                ...slot,
                date,
                confirmed_count: confirmed,
                waitlist_count: waitlisted,
                available,
                window_status: windowStatus,
                window_opens_at: windowOpen.toISOString(),
                user_booking: userBooking,
            });
        }

        res.json({ slots: result, date });
    } catch (err) {
        console.error('Slots list error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/slots/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM slots WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Slot not found' });
        res.json({ slot: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/slots/:id/students — admin: list students for a slot on a date
router.get('/:id/students', requireAuth, async (req, res) => {
    try {
        const date = req.query.date || todayIST();
        const { rows: students } = await db.query(`
            SELECT b.id as booking_id, b.status, b.waitlist_position, b.created_at,
                   u.id as user_id, u.name, u.email, u.roll_number,
                   a.status as attendance_status
            FROM bookings b
            JOIN users u ON u.id = b.user_id
            LEFT JOIN attendance a ON a.booking_id = b.id AND a.date = $1
            WHERE b.slot_id = $2 AND b.date = $3 AND b.status != 'cancelled'
            ORDER BY b.status DESC, b.waitlist_position ASC, b.created_at ASC
        `, [date, req.params.id, date]);

        res.json({ students, date });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/slots/categories/all — public
router.get('/categories/all', async (req, res) => {
    try {
        const { rows: categories } = await db.query('SELECT * FROM workout_categories');
        res.json({ categories });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
