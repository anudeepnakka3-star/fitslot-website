const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth } = require('../middleware/auth');

// GET /api/notifications — user's notifications (with pagination)
router.get('/', requireAuth, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const { rows: countRows } = await db.query(
            'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = $1',
            [req.user.id]
        );
        const total = parseInt(countRows[0].cnt);

        const { rows: notifications } = await db.query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
            [req.user.id, limit, offset]
        );

        const { rows: unreadRows } = await db.query(
            'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = $1 AND is_read = 0',
            [req.user.id]
        );
        const unread = parseInt(unreadRows[0].cnt);

        res.json({
            notifications,
            unread,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (err) {
        console.error('Notifications list error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PATCH /api/notifications/:id/read — mark as read
router.patch('/:id/read', requireAuth, async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM notifications WHERE id = $1', [req.params.id]);
        const notif = rows[0];
        if (!notif) return res.status(404).json({ error: 'Notification not found' });
        if (notif.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
        await db.query('UPDATE notifications SET is_read = 1 WHERE id = $1', [req.params.id]);
        res.json({ message: 'Marked as read' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', requireAuth, async (req, res) => {
    try {
        await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = $1', [req.user.id]);
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
