const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAdmin, requireAuth } = require('../middleware/auth');

// GET /api/users — admin: list all students (with pagination + search)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;
        const search = req.query.search?.trim() || '';

        let whereClause = "WHERE role = 'student'";
        const params = [];
        let paramIdx = 1;

        if (search) {
            whereClause += ` AND (name ILIKE $${paramIdx} OR email ILIKE $${paramIdx + 1} OR roll_number ILIKE $${paramIdx + 2})`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
            paramIdx += 3;
        }

        const { rows: countRows } = await db.query(
            `SELECT COUNT(*) as cnt FROM users ${whereClause}`, params
        );
        const total = parseInt(countRows[0].cnt);

        const { rows: users } = await db.query(
            `SELECT id, name, email, roll_number, department, class_section, photo_url, no_show_count, blocked_until, created_at
             FROM users ${whereClause}
             ORDER BY name ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
            [...params, limit, offset]
        );

        res.json({
            users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        console.error('Users list error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PATCH /api/users/:id/unblock — admin: manually unblock a student
router.patch('/:id/unblock', requireAdmin, async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        const user = rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });
        await db.query('UPDATE users SET blocked_until = NULL, no_show_count = 0 WHERE id = $1', [user.id]);
        await db.query('INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)', [
            user.id, '✅ Your account has been unblocked by the admin.', 'success'
        ]);
        res.json({ message: `${user.name} unblocked successfully` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/users/profile — student: update own profile
router.put('/profile', requireAuth, async (req, res) => {
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
        await db.query(
            'UPDATE users SET name = $1, department = $2, class_section = $3, photo_url = $4 WHERE id = $5',
            [name.trim(), department.trim(), class_section.trim(), photo_url, req.user.id]
        );
        res.json({ message: 'Profile updated successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
