const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth } = require('../middleware/auth');

// GET /api/notifications — user's notifications
router.get('/', requireAuth, (req, res) => {
    const notifications = db.prepare(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.user.id);
    const unread = db.prepare(
        'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get(req.user.id).cnt;
    res.json({ notifications, unread });
});

// PATCH /api/notifications/:id/read — mark as read
router.patch('/:id/read', requireAuth, (req, res) => {
    const notif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    if (notif.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Marked as read' });
});

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', requireAuth, (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ message: 'All notifications marked as read' });
});

module.exports = router;
