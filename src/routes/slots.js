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
router.get('/', requireAuth, (req, res) => {
    const date = req.query.date || todayIST();
    const now = new Date();

    const slots = db.prepare('SELECT * FROM slots WHERE is_active = 1 ORDER BY start_time').all();

    const result = slots.map(slot => {
        // Confirmed bookings count (not cancelled)
        const confirmed = db.prepare(
            "SELECT COUNT(*) as cnt FROM bookings WHERE slot_id = ? AND date = ? AND status = 'confirmed'"
        ).get(slot.id, date);

        const waitlist = db.prepare(
            "SELECT COUNT(*) as cnt FROM bookings WHERE slot_id = ? AND date = ? AND status = 'waitlist'"
        ).get(slot.id, date);

        const available = slot.capacity - confirmed.cnt;

        // Check booking window: opens 30 min before slot start
        const slotStart = timeToDate(slot.start_time, date);
        const slotEnd = timeToDate(slot.end_time, date);
        const windowOpen = new Date(slotStart.getTime() - 30 * 60 * 1000);

        let windowStatus = 'open';
        if (now < windowOpen) windowStatus = 'not_yet';
        if (now >= slotEnd) windowStatus = 'ended';

        // User's booking for this slot
        let userBooking = null;
        if (req.user) {
            userBooking = db.prepare(
                "SELECT * FROM bookings WHERE user_id = ? AND slot_id = ? AND date = ?"
            ).get(req.user.id, slot.id, date);
        }

        return {
            ...slot,
            date,
            confirmed_count: confirmed.cnt,
            waitlist_count: waitlist.cnt,
            available,
            window_status: windowStatus,
            window_opens_at: windowOpen.toISOString(),
            user_booking: userBooking || null,
        };
    });

    res.json({ slots: result, date });
});

// GET /api/slots/:id
router.get('/:id', requireAuth, (req, res) => {
    const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(req.params.id);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    res.json({ slot });
});

// GET /api/slots/:id/students — admin: list students for a slot on a date
router.get('/:id/students', requireAuth, (req, res) => {
    const date = req.query.date || todayIST();
    const students = db.prepare(`
    SELECT b.id as booking_id, b.status, b.waitlist_position, b.created_at,
           u.id as user_id, u.name, u.email, u.roll_number,
           a.status as attendance_status
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN attendance a ON a.booking_id = b.id AND a.date = ?
    WHERE b.slot_id = ? AND b.date = ? AND b.status != 'cancelled'
    ORDER BY b.status DESC, b.waitlist_position ASC, b.created_at ASC
  `).all(date, req.params.id, date);

    res.json({ students, date });
});

// GET /api/slots/categories/all — public
router.get('/categories/all', (req, res) => {
    const cats = db.prepare('SELECT * FROM workout_categories').all();
    res.json({ categories: cats });
});

module.exports = router;
