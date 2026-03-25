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
router.post('/', requireAuth, async (req, res) => {
    try {
        const { slot_id, date: reqDate, category_ids } = req.body;
        const date = reqDate || todayIST();

        if (!slot_id) return res.status(400).json({ error: 'slot_id is required' });

        // Check if user is blocked
        const { rows: userRows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        const user = userRows[0];
        if (user.blocked_until && new Date(user.blocked_until) > new Date()) {
            return res.status(403).json({ error: 'Your account is blocked due to repeated no-shows', blocked: true });
        }

        const { rows: slotRows } = await db.query('SELECT * FROM slots WHERE id = $1 AND is_active = 1', [slot_id]);
        const slot = slotRows[0];
        if (!slot) return res.status(404).json({ error: 'Slot not found' });

        // One slot per student per day
        const { rows: existingRows } = await db.query(
            "SELECT * FROM bookings WHERE user_id = $1 AND date = $2 AND status != 'cancelled'",
            [req.user.id, date]
        );
        if (existingRows.length > 0) {
            return res.status(409).json({ error: 'You already have a booking for today' });
        }

        // Check booking/waitlist for this specific slot
        const { rows: slotBookingRows } = await db.query(
            "SELECT * FROM bookings WHERE user_id = $1 AND slot_id = $2 AND date = $3 AND status != 'cancelled'",
            [req.user.id, slot_id, date]
        );
        if (slotBookingRows.length > 0) {
            return res.status(409).json({ error: 'You are already booked or waitlisted for this slot' });
        }

        // Check booking window: opens 30 min before slot start
        const now = new Date();
        const slotStart = timeToDate(slot.start_time, date);
        const slotEnd = timeToDate(slot.end_time, date);
        const windowOpen = new Date(slotStart.getTime() - 30 * 60 * 1000);

        if (!slot.is_demo && now < windowOpen) {
            return res.status(400).json({
                error: `Booking window not yet open. Opens at ${windowOpen.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
                window_opens_at: windowOpen.toISOString()
            });
        }
        if (!slot.is_demo && now >= slotEnd) {
            return res.status(400).json({ error: 'This slot has already ended' });
        }

        // Check capacity
        const { rows: confirmedRows } = await db.query(
            "SELECT COUNT(*) as cnt FROM bookings WHERE slot_id = $1 AND date = $2 AND status = 'confirmed'",
            [slot_id, date]
        );
        const confirmedCount = parseInt(confirmedRows[0].cnt);

        let status = 'confirmed';
        let waitlist_position = null;

        if (confirmedCount >= slot.capacity) {
            // Add to waitlist
            const { rows: maxPosRows } = await db.query(
                "SELECT COALESCE(MAX(waitlist_position), 0) as mp FROM bookings WHERE slot_id = $1 AND date = $2 AND status = 'waitlist'",
                [slot_id, date]
            );
            status = 'waitlist';
            waitlist_position = parseInt(maxPosRows[0].mp) + 1;
        }

        // Create booking
        const { rows: bookingResult } = await db.query(
            'INSERT INTO bookings (user_id, slot_id, date, status, waitlist_position) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [req.user.id, slot_id, date, status, waitlist_position]
        );
        const bookingId = bookingResult[0].id;

        // Add categories
        if (category_ids && Array.isArray(category_ids) && category_ids.length > 0) {
            for (const catId of category_ids) {
                await db.query(
                    'INSERT INTO booking_categories (booking_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [bookingId, catId]
                );
            }
        }

        // Create attendance placeholder if confirmed
        if (status === 'confirmed') {
            await db.query('INSERT INTO attendance (booking_id, date, status) VALUES ($1, $2, $3)', [bookingId, date, 'pending']);
        }

        // Send notification
        const msg = status === 'confirmed'
            ? `✅ Booking confirmed for ${slot.name} slot (${slot.start_time}–${slot.end_time}) on ${date}`
            : `⏳ You are #${waitlist_position} on the waitlist for ${slot.name} slot on ${date}`;
        await db.query('INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)', [req.user.id, msg, status === 'confirmed' ? 'success' : 'info']);

        const { rows: newBooking } = await db.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
        res.status(201).json({ booking: newBooking[0], message: msg });
    } catch (err) {
        console.error('Create booking error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/bookings — current user's bookings (with pagination)
router.get('/', requireAuth, async (req, res) => {
    try {
        const { date, status } = req.query;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE b.user_id = $1';
        const params = [req.user.id];
        let paramIdx = 2;

        if (date) { whereClause += ` AND b.date = $${paramIdx}`; params.push(date); paramIdx++; }
        if (status) { whereClause += ` AND b.status = $${paramIdx}`; params.push(status); paramIdx++; }

        const { rows: countRows } = await db.query(
            `SELECT COUNT(*) as cnt FROM bookings b ${whereClause}`, params
        );
        const total = parseInt(countRows[0].cnt);

        const query = `
            SELECT b.*, s.name as slot_name, s.start_time, s.end_time,
                   a.status as attendance_status,
                   STRING_AGG(wc.name, ', ') as categories
            FROM bookings b
            JOIN slots s ON s.id = b.slot_id
            LEFT JOIN attendance a ON a.booking_id = b.id
            LEFT JOIN booking_categories bc ON bc.booking_id = b.id
            LEFT JOIN workout_categories wc ON wc.id = bc.category_id
            ${whereClause}
            GROUP BY b.id, s.name, s.start_time, s.end_time, a.status
            ORDER BY b.date DESC, s.start_time DESC
            LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `;

        const { rows: bookings } = await db.query(query, [...params, limit, offset]);
        res.json({
            bookings,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error('Get bookings error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/bookings/:id — cancel a booking
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { rows: bookingRows } = await db.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
        const booking = bookingRows[0];
        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized' });
        }
        if (booking.status === 'cancelled') {
            return res.status(400).json({ error: 'Booking already cancelled' });
        }

        const { rows: slotRows } = await db.query('SELECT * FROM slots WHERE id = $1', [booking.slot_id]);
        const slot = slotRows[0];
        const now = new Date();
        const slotStart = timeToDate(slot.start_time, booking.date);
        const cancelDeadline = new Date(slotStart.getTime() - 10 * 60 * 1000);

        if (!slot.is_demo && now >= cancelDeadline && req.user.role !== 'admin') {
            return res.status(400).json({ error: 'Cancellation window has closed (10 minutes before slot start)' });
        }

        // Cancel
        await db.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [booking.id]);
        await db.query("DELETE FROM attendance WHERE booking_id = $1", [booking.id]);

        // Promote first waitlisted student if the cancelled booking was confirmed
        if (booking.status === 'confirmed') {
            const { rows: firstRows } = await db.query(
                "SELECT * FROM bookings WHERE slot_id = $1 AND date = $2 AND status = 'waitlist' ORDER BY waitlist_position ASC LIMIT 1",
                [booking.slot_id, booking.date]
            );
            const first = firstRows[0];

            if (first) {
                await db.query("UPDATE bookings SET status = 'confirmed', waitlist_position = NULL WHERE id = $1", [first.id]);
                await db.query('INSERT INTO attendance (booking_id, date, status) VALUES ($1, $2, $3)', [first.id, first.date, 'pending']);

                // Re-number remaining waitlist
                const { rows: remaining } = await db.query(
                    "SELECT id FROM bookings WHERE slot_id = $1 AND date = $2 AND status = 'waitlist' ORDER BY waitlist_position ASC",
                    [booking.slot_id, booking.date]
                );
                for (let i = 0; i < remaining.length; i++) {
                    await db.query('UPDATE bookings SET waitlist_position = $1 WHERE id = $2', [i + 1, remaining[i].id]);
                }

                // Notify promoted student
                await db.query('INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)', [
                    first.user_id,
                    `🎉 You've been moved from the waitlist to confirmed for ${slot.name} slot on ${first.date}!`,
                    'success'
                ]);
            }
        }

        res.json({ message: 'Booking cancelled successfully' });
    } catch (err) {
        console.error('Cancel booking error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/bookings/admin/all — admin: all bookings (with pagination + search)
router.get('/admin/all', requireAdmin, async (req, res) => {
    try {
        const { date, slot_id, search } = req.query;
        const today = todayIST();
        const queryDate = date || today;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        let whereClause = "WHERE b.date = $1 AND b.status != 'cancelled'";
        const params = [queryDate];
        let paramIdx = 2;

        if (slot_id) { whereClause += ` AND b.slot_id = $${paramIdx}`; params.push(slot_id); paramIdx++; }
        if (search) {
            whereClause += ` AND (u.name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx + 1} OR u.roll_number ILIKE $${paramIdx + 2})`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
            paramIdx += 3;
        }

        const { rows: countRows } = await db.query(
            `SELECT COUNT(*) as cnt FROM bookings b JOIN users u ON u.id = b.user_id ${whereClause}`, params
        );
        const total = parseInt(countRows[0].cnt);

        const query = `
            SELECT b.*, s.name as slot_name, s.start_time, s.end_time,
                   u.name as student_name, u.email, u.roll_number,
                   a.status as attendance_status
            FROM bookings b
            JOIN slots s ON s.id = b.slot_id
            JOIN users u ON u.id = b.user_id
            LEFT JOIN attendance a ON a.booking_id = b.id
            ${whereClause}
            ORDER BY s.start_time, b.status DESC, b.waitlist_position ASC
            LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `;

        const { rows: bookings } = await db.query(query, [...params, limit, offset]);
        res.json({
            bookings,
            date: queryDate,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error('Admin bookings error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
