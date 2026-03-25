const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

function todayIST() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// GET /api/analytics/summary — daily attendance summary + slot utilization
router.get('/summary', requireAdmin, async (req, res) => {
    try {
        const { date } = req.query;
        const queryDate = date || todayIST();

        // Total confirmed bookings today
        const { rows: bookingRows } = await db.query(
            "SELECT COUNT(*) as cnt FROM bookings WHERE date = $1 AND status = 'confirmed'",
            [queryDate]
        );
        const totalBookings = parseInt(bookingRows[0].cnt);

        // Total present today
        const { rows: presentRows } = await db.query(`
            SELECT COUNT(*) as cnt FROM attendance a
            JOIN bookings b ON b.id = a.booking_id
            WHERE b.date = $1 AND a.status = 'present'
        `, [queryDate]);
        const totalPresent = parseInt(presentRows[0].cnt);

        // Total absent today
        const { rows: absentRows } = await db.query(`
            SELECT COUNT(*) as cnt FROM attendance a
            JOIN bookings b ON b.id = a.booking_id
            WHERE b.date = $1 AND a.status = 'absent'
        `, [queryDate]);
        const totalAbsent = parseInt(absentRows[0].cnt);

        // Slot utilization for today
        const { rows: slots } = await db.query(`
            SELECT s.id, s.name, s.start_time, s.end_time, s.capacity,
                   COUNT(b.id) as booked,
                   SUM(CASE WHEN b.status = 'waitlist' THEN 1 ELSE 0 END) as waitlisted
            FROM slots s
            LEFT JOIN bookings b ON b.slot_id = s.id AND b.date = $1 AND b.status != 'cancelled'
            WHERE s.is_active = 1
            GROUP BY s.id
            ORDER BY s.start_time
        `, [queryDate]);

        // 7-day trend
        const { rows: trend } = await db.query(`
            SELECT b.date, COUNT(*) as total,
                   SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present
            FROM bookings b
            LEFT JOIN attendance a ON a.booking_id = b.id
            WHERE b.date >= ($1::date - INTERVAL '6 days')::text AND b.date <= $1 AND b.status = 'confirmed'
            GROUP BY b.date
            ORDER BY b.date ASC
        `, [queryDate]);

        // Peak slot today
        const peakSlot = slots.reduce((max, s) => parseInt(s.booked) > (parseInt(max?.booked) || 0) ? s : max, null);

        res.json({
            date: queryDate,
            total_bookings: totalBookings,
            total_present: totalPresent,
            total_absent: totalAbsent,
            attendance_rate: totalBookings > 0 ? Math.round((totalPresent / totalBookings) * 100) : 0,
            slot_utilization: slots,
            peak_slot: peakSlot,
            trend
        });
    } catch (err) {
        console.error('Analytics summary error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/analytics/categories — workout category breakdown
router.get('/categories', requireAdmin, async (req, res) => {
    try {
        const { days } = req.query;
        const daysBack = parseInt(days) || 30;

        const { rows: cats } = await db.query(`
            SELECT wc.name, wc.icon, COUNT(*) as count
            FROM booking_categories bc
            JOIN workout_categories wc ON wc.id = bc.category_id
            JOIN bookings b ON b.id = bc.booking_id
            WHERE b.date >= (CURRENT_DATE - ($1 || ' days')::INTERVAL)::text
              AND b.status != 'cancelled'
            GROUP BY wc.id, wc.name, wc.icon
            ORDER BY count DESC
        `, [daysBack]);

        res.json({ categories: cats, days: daysBack });
    } catch (err) {
        console.error('Analytics categories error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/analytics/noshows — top no-show students
router.get('/noshows', requireAdmin, async (req, res) => {
    try {
        const { rows: students } = await db.query(`
            SELECT id, name, email, roll_number, no_show_count, blocked_until
            FROM users
            WHERE role = 'student' AND no_show_count > 0
            ORDER BY no_show_count DESC
            LIMIT 20
        `);
        res.json({ students });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/analytics/students — registered student count
router.get('/students', requireAdmin, async (req, res) => {
    try {
        const { rows: totalRows } = await db.query("SELECT COUNT(*) as cnt FROM users WHERE role = 'student'");
        const { rows: blockedRows } = await db.query("SELECT COUNT(*) as cnt FROM users WHERE role = 'student' AND blocked_until > NOW()::text");
        res.json({ total: parseInt(totalRows[0].cnt), blocked: parseInt(blockedRows[0].cnt) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
