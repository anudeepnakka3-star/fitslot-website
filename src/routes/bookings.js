const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const NO_SHOW_BLOCK_THRESHOLD = 3;
const BLOCK_DAYS = 7;

function todayIST() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function timeToDate(timeStr, dateStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(`${dateStr}T00:00:00+05:30`);
    d.setHours(h, m, 0, 0);
    return d;
}

// POST /api/bookings — book a slot
router.post('/', requireAuth, (req, res) => {
    const { slot_id, date: reqDate, category_ids } = req.body;
    const date = reqDate || todayIST();

    if (!slot_id) return res.status(400).json({ error: 'slot_id is required' });

    // Check if user is blocked
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (user.blocked_until && new Date(user.blocked_until) > new Date()) {
        return res.status(403).json({ error: 'Your account is blocked due to repeated no-shows', blocked: true });
    }

    const slot = db.prepare('SELECT * FROM slots WHERE id = ? AND is_active = 1').get(slot_id);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });

    // One slot per student per day
    const existing = db.prepare(
        "SELECT * FROM bookings WHERE user_id = ? AND date = ? AND status != 'cancelled'"
    ).get(req.user.id, date);
    if (existing) {
        return res.status(409).json({ error: 'You already have a booking for today' });
    }

    // Check booking/waitlist for this specific slot
    const slotBooking = db.prepare(
        "SELECT * FROM bookings WHERE user_id = ? AND slot_id = ? AND date = ? AND status != 'cancelled'"
    ).get(req.user.id, slot_id, date);
    if (slotBooking) {
        return res.status(409).json({ error: 'You are already booked or waitlisted for this slot' });
    }

    // Check booking window: opens 30 min before slot start
    const now = new Date();
    const slotStart = timeToDate(slot.start_time, date);
    const slotEnd = timeToDate(slot.end_time, date);
    const windowOpen = new Date(slotStart.getTime() - 30 * 60 * 1000);

    if (now < windowOpen) {
        return res.status(400).json({
            error: `Booking window not yet open. Opens at ${windowOpen.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
            window_opens_at: windowOpen.toISOString()
        });
    }
    if (now >= slotEnd) {
        return res.status(400).json({ error: 'This slot has already ended' });
    }

    // Check capacity
    const confirmedCount = db.prepare(
        "SELECT COUNT(*) as cnt FROM bookings WHERE slot_id = ? AND date = ? AND status = 'confirmed'"
    ).get(slot_id, date).cnt;

    let status = 'confirmed';
    let waitlist_position = null;

    if (confirmedCount >= slot.capacity) {
        // Add to waitlist
        const maxPos = db.prepare(
            "SELECT MAX(waitlist_position) as mp FROM bookings WHERE slot_id = ? AND date = ? AND status = 'waitlist'"
        ).get(slot_id, date).mp || 0;
        status = 'waitlist';
        waitlist_position = maxPos + 1;
    }

    // Create booking
    const result = db.prepare(
        'INSERT INTO bookings (user_id, slot_id, date, status, waitlist_position) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, slot_id, date, status, waitlist_position);

    const bookingId = result.lastInsertRowid;

    // Add categories
    if (category_ids && Array.isArray(category_ids) && category_ids.length > 0) {
        const insertCat = db.prepare('INSERT OR IGNORE INTO booking_categories (booking_id, category_id) VALUES (?, ?)');
        for (const catId of category_ids) {
            insertCat.run(bookingId, catId);
        }
    }

    // Create attendance placeholder if confirmed
    if (status === 'confirmed') {
        db.prepare('INSERT INTO attendance (booking_id, date, status) VALUES (?, ?, ?)').run(bookingId, date, 'pending');
    }

    // Send notification
    const msg = status === 'confirmed'
        ? `✅ Booking confirmed for ${slot.name} slot (${slot.start_time}–${slot.end_time}) on ${date}`
        : `⏳ You are #${waitlist_position} on the waitlist for ${slot.name} slot on ${date}`;
    db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(req.user.id, msg, status === 'confirmed' ? 'success' : 'info');

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    res.status(201).json({ booking, message: msg });
});

// GET /api/bookings — current user's bookings
router.get('/', requireAuth, (req, res) => {
    const { date, status } = req.query;
    let query = `
    SELECT b.*, s.name as slot_name, s.start_time, s.end_time,
           a.status as attendance_status,
           GROUP_CONCAT(wc.name, ', ') as categories
    FROM bookings b
    JOIN slots s ON s.id = b.slot_id
    LEFT JOIN attendance a ON a.booking_id = b.id
    LEFT JOIN booking_categories bc ON bc.booking_id = b.id
    LEFT JOIN workout_categories wc ON wc.id = bc.category_id
    WHERE b.user_id = ?
  `;
    const params = [req.user.id];

    if (date) { query += ' AND b.date = ?'; params.push(date); }
    if (status) { query += ' AND b.status = ?'; params.push(status); }

    query += ' GROUP BY b.id ORDER BY b.date DESC, s.start_time DESC';

    const bookings = db.prepare(query).all(...params);
    res.json({ bookings });
});

// DELETE /api/bookings/:id — cancel a booking
router.delete('/:id', requireAuth, (req, res) => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized' });
    }
    if (booking.status === 'cancelled') {
        return res.status(400).json({ error: 'Booking already cancelled' });
    }

    const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(booking.slot_id);
    const now = new Date();
    const slotStart = timeToDate(slot.start_time, booking.date);
    const cancelDeadline = new Date(slotStart.getTime() - 10 * 60 * 1000);

    if (now >= cancelDeadline && req.user.role !== 'admin') {
        return res.status(400).json({ error: 'Cancellation window has closed (10 minutes before slot start)' });
    }

    // Cancel
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
    db.prepare("DELETE FROM attendance WHERE booking_id = ?").run(booking.id);

    // Promote first waitlisted student if the cancelled booking was confirmed
    if (booking.status === 'confirmed') {
        const first = db.prepare(
            "SELECT * FROM bookings WHERE slot_id = ? AND date = ? AND status = 'waitlist' ORDER BY waitlist_position ASC LIMIT 1"
        ).get(booking.slot_id, booking.date);

        if (first) {
            db.prepare("UPDATE bookings SET status = 'confirmed', waitlist_position = NULL WHERE id = ?").run(first.id);
            db.prepare('INSERT INTO attendance (booking_id, date, status) VALUES (?, ?, ?)').run(first.id, first.date, 'pending');

            // Re-number remaining waitlist
            const remaining = db.prepare(
                "SELECT id FROM bookings WHERE slot_id = ? AND date = ? AND status = 'waitlist' ORDER BY waitlist_position ASC"
            ).all(booking.slot_id, booking.date);
            remaining.forEach((b, i) => {
                db.prepare('UPDATE bookings SET waitlist_position = ? WHERE id = ?').run(i + 1, b.id);
            });

            // Notify promoted student
            const promotedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(first.user_id);
            db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(
                first.user_id,
                `🎉 You've been moved from the waitlist to confirmed for ${slot.name} slot on ${first.date}!`,
                'success'
            );
        }
    }

    res.json({ message: 'Booking cancelled successfully' });
});

// GET /api/bookings/admin/all — admin: all bookings
router.get('/admin/all', requireAdmin, (req, res) => {
    const { date, slot_id } = req.query;
    const today = todayIST();
    const queryDate = date || today;
    let query = `
    SELECT b.*, s.name as slot_name, s.start_time, s.end_time,
           u.name as student_name, u.email, u.roll_number,
           a.status as attendance_status
    FROM bookings b
    JOIN slots s ON s.id = b.slot_id
    JOIN users u ON u.id = b.user_id
    LEFT JOIN attendance a ON a.booking_id = b.id
    WHERE b.date = ?
  `;
    const params = [queryDate];
    if (slot_id) { query += ' AND b.slot_id = ?'; params.push(slot_id); }
    query += " AND b.status != 'cancelled' ORDER BY s.start_time, b.status DESC, b.waitlist_position ASC";

    const bookings = db.prepare(query).all(...params);
    res.json({ bookings, date: queryDate });
});

module.exports = router;
