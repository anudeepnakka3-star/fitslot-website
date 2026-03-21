const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

// GET /api/users — admin: list all students
router.get('/', requireAdmin, (req, res) => {
    const users = db.prepare(
        "SELECT id, name, email, roll_number, department, class_section, photo_url, no_show_count, blocked_until, created_at FROM users WHERE role = 'student' ORDER BY name ASC"
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

// PUT /api/users/profile — student: update own profile
const { requireAuth } = require('../middleware/auth');

router.put('/profile', requireAuth, (req, res) => {
    const { name, department, class_section, photo_url } = req.body;

    if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Name cannot be empty' });
    }
    if (!department || department.trim() === '') {
        return res.status(400).json({ error: 'Department cannot be empty' });
    }
    if (!class_section || class_section.trim() === '') {
        return res.status(400).json({ error: 'Class section is required' });
    }

    try {
        db.prepare(
            'UPDATE users SET name = ?, department = ?, class_section = ?, photo_url = ? WHERE id = ?'
        ).run(name.trim(), department.trim(), class_section.trim(), photo_url, req.user.id);
        
        res.json({ message: 'Profile updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
