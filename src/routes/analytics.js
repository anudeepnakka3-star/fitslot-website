const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

function todayIST() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// GET /api/analytics/summary — daily attendance summary + slot utilization
router.get('/summary', requireAdmin, (req, res) => {
    const { date } = req.query;
    const queryDate = date || todayIST();

    // Total confirmed bookings today
    const totalBookings = db.prepare(
        "SELECT COUNT(*) as cnt FROM bookings WHERE date = ? AND status = 'confirmed'"
    ).get(queryDate).cnt;

    // Total present today
    const totalPresent = db.prepare(`
    SELECT COUNT(*) as cnt FROM attendance a
    JOIN bookings b ON b.id = a.booking_id
    WHERE b.date = ? AND a.status = 'present'
  `).get(queryDate).cnt;

    // Total absent today
    const totalAbsent = db.prepare(`
    SELECT COUNT(*) as cnt FROM attendance a
    JOIN bookings b ON b.id = a.booking_id
    WHERE b.date = ? AND a.status = 'absent'
  `).get(queryDate).cnt;

    // Slot utilization for today
    const slots = db.prepare(`
    SELECT s.id, s.name, s.start_time, s.end_time, s.capacity,
           COUNT(b.id) as booked,
           SUM(CASE WHEN b.status = 'waitlist' THEN 1 ELSE 0 END) as waitlisted
    FROM slots s
    LEFT JOIN bookings b ON b.slot_id = s.id AND b.date = ? AND b.status != 'cancelled'
    WHERE s.is_active = 1
    GROUP BY s.id
    ORDER BY s.start_time
  `).all(queryDate);

    // 7-day trend
    const trend = db.prepare(`
    SELECT b.date, COUNT(*) as total,
           SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present
    FROM bookings b
    LEFT JOIN attendance a ON a.booking_id = b.id
    WHERE b.date >= date(?, '-6 days') AND b.date <= ? AND b.status = 'confirmed'
    GROUP BY b.date
    ORDER BY b.date ASC
  `).all(queryDate, queryDate);

    // Peak slot today
    const peakSlot = slots.reduce((max, s) => s.booked > (max?.booked || 0) ? s : max, null);

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
});

// GET /api/analytics/categories — workout category breakdown
router.get('/categories', requireAdmin, (req, res) => {
    const { days } = req.query;
    const daysBack = parseInt(days) || 30;

    const cats = db.prepare(`
    SELECT wc.name, wc.icon, COUNT(*) as count
    FROM booking_categories bc
    JOIN workout_categories wc ON wc.id = bc.category_id
    JOIN bookings b ON b.id = bc.booking_id
    WHERE b.date >= date('now', ?)
      AND b.status != 'cancelled'
    GROUP BY wc.id
    ORDER BY count DESC
  `).all(`-${daysBack} days`);

    res.json({ categories: cats, days: daysBack });
});

// GET /api/analytics/noshows — top no-show students
router.get('/noshows', requireAdmin, (req, res) => {
    const students = db.prepare(`
    SELECT id, name, email, roll_number, no_show_count, blocked_until
    FROM users
    WHERE role = 'student' AND no_show_count > 0
    ORDER BY no_show_count DESC
    LIMIT 20
  `).all();
    res.json({ students });
});

// GET /api/analytics/students — registered student count
router.get('/students', requireAdmin, (req, res) => {
    const total = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'student'").get().cnt;
    const blocked = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'student' AND blocked_until > datetime('now')").get().cnt;
    res.json({ total, blocked });
});

module.exports = router;
