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

        const queryStr = `
            SELECT s.*, 
                   COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) as confirmed_count,
                   COUNT(CASE WHEN b.status = 'waitlist' THEN 1 END) as waitlist_count
            FROM slots s
            LEFT JOIN bookings b ON b.slot_id = s.id AND b.date = $1
            WHERE s.is_active = 1
            GROUP BY s.id
            ORDER BY s.start_time
        `;

        const { rows: slots } = await db.query(queryStr, [date]);

        let userBookingsMap = {};
        if (req.user) {
            const { rows: userRows } = await db.query(
                "SELECT * FROM bookings WHERE user_id = $1 AND date = $2",
                [req.user.id, date]
            );
            for (const b of userRows) {
                userBookingsMap[b.slot_id] = b;
            }
        }

        const result = slots.map(slot => {
            const confirmed = parseInt(slot.confirmed_count);
            const waitlisted = parseInt(slot.waitlist_count);
            const available = slot.capacity - confirmed;

            // Check booking window: opens 30 min before slot start
            const slotStart = timeToDate(slot.start_time, date);
            const slotEnd = timeToDate(slot.end_time, date);
            const windowOpen = new Date(slotStart.getTime() - 30 * 60 * 1000);

            let windowStatus = 'open';
            if (!slot.is_demo && now < windowOpen) windowStatus = 'not_yet';
            if (!slot.is_demo && now >= slotEnd) windowStatus = 'ended';

            return {
                ...slot,
                date,
                confirmed_count: confirmed,
                waitlist_count: waitlisted,
                available,
                window_status: windowStatus,
                window_opens_at: windowOpen.toISOString(),
                user_booking: userBookingsMap[slot.id] || null,
            };
        });

        res.json({ slots: result, date });
    } catch (err) {
        console.error('Slots list error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/slots/categories/all — public (MUST be before /:id to avoid being caught by it)
router.get('/categories/all', async (req, res) => {
    try {
        const { rows: categories } = await db.query('SELECT * FROM workout_categories');
        res.json({ categories });
    } catch (err) {
        console.error(err);
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

module.exports = router;
