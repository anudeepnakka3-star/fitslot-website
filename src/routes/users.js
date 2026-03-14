const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/users — admin: list all students
router.get('/', requireAdmin, (req, res) => {
    const users = db.prepare(
        "SELECT id, name, email, roll_number, no_show_count, blocked_until, created_at FROM users WHERE role = 'student' ORDER BY name ASC"
    ).all();
    res.json({ users });
});

// PATCH /api/users/:id/unblock — admin: manually unblock a student
router.patch('/:id/unblock', requireAdmin, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.prepare('UPDATE users SET blocked_until = NULL, no_show_count = 0 WHERE id = ?').run(user.id);
    db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(
        user.id, '✅ Your account has been unblocked by the admin.', 'success'
    );
    res.json({ message: `${user.name} unblocked successfully` });
});

module.exports = router;
