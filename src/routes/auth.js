const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'fitslot_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const STUDENT_DOMAIN = process.env.STUDENT_EMAIL_DOMAIN || 'bvrit.ac.in';

// ─── Helper: verify Google credential via tokeninfo endpoint ──────────────────
function verifyGoogleToken(credential) {
    return new Promise((resolve, reject) => {
        const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const payload = JSON.parse(data);
                    if (payload.error) return reject(new Error(payload.error_description || 'Invalid Google token'));
                    resolve(payload);
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

// ─── Helper: build safe user object ──────────────────────────────────────────
function safeUser(u) {
    return { id: u.id, name: u.name, email: u.email, role: u.role, roll_number: u.roll_number, no_show_count: u.no_show_count };
}

// ─── POST /api/auth/login  ────────────────────────────────────────────────────
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: 'Email and password are required' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user)
        return res.status(401).json({ error: 'Invalid email or password' });

    if (!user.password_hash)
        return res.status(401).json({ error: 'This account uses Google Sign-In. Please use the "Sign in with Google" button.' });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid)
        return res.status(401).json({ error: 'Invalid email or password' });

    if (user.blocked_until && new Date(user.blocked_until) > new Date()) {
        return res.status(403).json({
            error: `Account blocked due to repeated no-shows. Unblocked on ${new Date(user.blocked_until).toLocaleDateString('en-IN')}.`,
            blocked: true,
            blocked_until: user.blocked_until
        });
    }
    if (user.blocked_until) {
        db.prepare('UPDATE users SET blocked_until = NULL, no_show_count = 0 WHERE id = ?').run(user.id);
    }

    const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role },
        JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({ token, user: safeUser(user) });
});

// ─── POST /api/auth/google  ───────────────────────────────────────────────────
// Receives the Google ID token credential from the frontend GIS popup,
// verifies it, finds or creates the user, returns a JWT.
router.post('/google', async (req, res) => {
    const { credential } = req.body;
    if (!credential)
        return res.status(400).json({ error: 'Google credential is required' });

    try {
        const payload = await verifyGoogleToken(credential);

        const email = payload.email?.toLowerCase().trim();
        if (!email)
            return res.status(400).json({ error: 'No email returned from Google' });

        // Enforce college domain
        const domain = email.split('@')[1];
        if (domain !== STUDENT_DOMAIN)
            return res.status(403).json({ error: `Only @${STUDENT_DOMAIN} Google accounts are allowed. Got: @${domain}` });

        if (!payload.email_verified || payload.email_verified === 'false')
            return res.status(403).json({ error: 'Google account email is not verified' });

        // Find or create user
        let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) {
            const name = payload.name || email.split('@')[0];
            const result = db.prepare(
                'INSERT INTO users (name, email, password_hash, role, google_id) VALUES (?, ?, NULL, ?, ?)'
            ).run(name, email, 'student', payload.sub);
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
        } else if (!user.google_id) {
            db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(payload.sub, user.id);
        }

        // Block check
        if (user.blocked_until && new Date(user.blocked_until) > new Date()) {
            return res.status(403).json({
                error: `Account blocked until ${new Date(user.blocked_until).toLocaleDateString('en-IN')} due to repeated no-shows.`
            });
        }

        const token = jwt.sign(
            { id: user.id, name: user.name, email: user.email, role: user.role },
            JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }
        );
        res.json({ token, user: safeUser(user) });
    } catch (e) {
        console.error('Google auth error:', e);
        res.status(500).json({ error: 'Google authentication failed: ' + e.message });
    }
});

// ─── POST /api/auth/register  ────────────────────────────────────────────────
router.post('/register', (req, res) => {
    const { name, email, password, roll_number } = req.body;
    if (!name || !email || !password)
        return res.status(400).json({ error: 'Name, email and password are required' });

    const domain = email.split('@')[1];
    if (domain !== STUDENT_DOMAIN)
        return res.status(400).json({ error: `Only @${STUDENT_DOMAIN} emails are allowed` });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing)
        return res.status(409).json({ error: 'An account with this email already exists' });

    if (password.length < 6)
        return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
        'INSERT INTO users (name, email, password_hash, role, roll_number) VALUES (?, ?, ?, ?, ?)'
    ).run(name.trim(), email.toLowerCase().trim(), hash, 'student', roll_number || null);

    const token = jwt.sign(
        { id: result.lastInsertRowid, name: name.trim(), email: email.toLowerCase(), role: 'student' },
        JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }
    );
    res.status(201).json({ token, user: { id: result.lastInsertRowid, name: name.trim(), email: email.toLowerCase(), role: 'student', roll_number: roll_number || null } });
});

// ─── GET /api/auth/me  ───────────────────────────────────────────────────────
router.get('/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
        return res.status(401).json({ error: 'Not authenticated' });
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const user = db.prepare(
            'SELECT id, name, email, role, roll_number, no_show_count, blocked_until FROM users WHERE id = ?'
        ).get(decoded.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;
