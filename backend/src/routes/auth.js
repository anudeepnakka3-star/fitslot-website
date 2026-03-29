const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const https = require('https');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'fitslot_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const STUDENT_DOMAIN = process.env.STUDENT_EMAIL_DOMAIN || 'bvrit.ac.in';

// ─── Validation error handler ─────────────────────────────────────────────────
function handleValidation(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() });
    }
    return null;
}

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
    return { 
        id: u.id, name: u.name, email: u.email, role: u.role, 
        roll_number: u.roll_number, no_show_count: u.no_show_count,
        department: u.department, class_section: u.class_section, photo_url: u.photo_url
    };
}

// ─── POST /api/auth/login  ────────────────────────────────────────────────────
router.post('/login', [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
    const vErr = handleValidation(req, res);
    if (vErr) return;

    try {
        const { email, password } = req.body;
        const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        const user = rows[0];
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
            await db.query('UPDATE users SET blocked_until = NULL, no_show_count = 0 WHERE id = $1', [user.id]);
        }

        const token = jwt.sign(
            { id: user.id, name: user.name, email: user.email, role: user.role },
            JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }
        );
        res.json({ token, user: safeUser(user) });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── POST /api/auth/google  ───────────────────────────────────────────────────
router.post('/google', [
    body('credential').notEmpty().withMessage('Google credential is required'),
], async (req, res) => {
    const vErr = handleValidation(req, res);
    if (vErr) return;

    const { credential } = req.body;

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
        let { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        let user = rows[0];

        if (!user) {
            const name = payload.name || email.split('@')[0];
            const roll_number = email.split('@')[0].toUpperCase();
            const result = await db.query(
                'INSERT INTO users (name, email, password_hash, role, google_id, roll_number) VALUES ($1, $2, NULL, $3, $4, $5) RETURNING *',
                [name, email, 'student', payload.sub, roll_number]
            );
            user = result.rows[0];
        } else {
            if (!user.google_id) {
                await db.query('UPDATE users SET google_id = $1 WHERE id = $2', [payload.sub, user.id]);
                user.google_id = payload.sub;
            }
            if (!user.roll_number) {
                const roll_number = email.split('@')[0].toUpperCase();
                await db.query('UPDATE users SET roll_number = $1 WHERE id = $2', [roll_number, user.id]);
                user.roll_number = roll_number;
            }
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
router.post('/register', [
    body('name').trim().notEmpty().withMessage('Name is required')
        .isLength({ max: 100 }).withMessage('Name must be 100 characters or less'),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
        .isLength({ max: 128 }).withMessage('Password must be 128 characters or less'),
    body('roll_number').optional().trim().isLength({ max: 20 }).withMessage('Roll number too long'),
], async (req, res) => {
    const vErr = handleValidation(req, res);
    if (vErr) return;

    try {
        const { name, email, password, roll_number } = req.body;

        const domain = email.split('@')[1];
        if (domain !== STUDENT_DOMAIN)
            return res.status(400).json({ error: `Only @${STUDENT_DOMAIN} emails are allowed` });

        const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        if (existing.length > 0)
            return res.status(409).json({ error: 'An account with this email already exists' });

        const hash = bcrypt.hashSync(password, 10);
        const result = await db.query(
            'INSERT INTO users (name, email, password_hash, role, roll_number) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name.trim(), email.toLowerCase().trim(), hash, 'student', roll_number || null]
        );
        const newId = result.rows[0].id;

        const token = jwt.sign(
            { id: newId, name: name.trim(), email: email.toLowerCase(), role: 'student' },
            JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }
        );
        res.status(201).json({ token, user: { id: newId, name: name.trim(), email: email.toLowerCase(), role: 'student', roll_number: roll_number || null } });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── POST /api/auth/forgot-password  ─────────────────────────────────────────
router.post('/forgot-password', [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
], async (req, res) => {
    const vErr = handleValidation(req, res);
    if (vErr) return;

    try {
        const { email } = req.body;
        const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        const user = rows[0];

        // Always respond success to prevent email enumeration
        if (!user || !user.password_hash) {
            return res.json({ message: 'If an account with that email exists, a password reset link has been generated.' });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

        // Delete any existing tokens for this user
        await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

        // Store the hashed token
        await db.query(
            'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [user.id, resetTokenHash, expiresAt]
        );

        // In production, you'd send an email. For now, log the token.
        console.log(`[Password Reset] Token for ${email}: ${resetToken}`);

        res.json({
            message: 'If an account with that email exists, a password reset link has been generated.',
            // DEV ONLY — remove in production:
            _dev_reset_token: process.env.NODE_ENV !== 'production' ? resetToken : undefined,
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── POST /api/auth/reset-password  ──────────────────────────────────────────
router.post('/reset-password', [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
        .isLength({ max: 128 }).withMessage('Password must be 128 characters or less'),
], async (req, res) => {
    const vErr = handleValidation(req, res);
    if (vErr) return;

    try {
        const { token, password } = req.body;
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const { rows } = await db.query(
            'SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW()::text',
            [tokenHash]
        );
        const record = rows[0];

        if (!record) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const hash = bcrypt.hashSync(password, 10);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, record.user_id]);
        await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [record.user_id]);

        res.json({ message: 'Password has been reset successfully. You can now log in.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── GET /api/auth/me  ───────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
        return res.status(401).json({ error: 'Not authenticated' });
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const { rows } = await db.query(
            'SELECT id, name, email, role, roll_number, department, class_section, photo_url, no_show_count, blocked_until FROM users WHERE id = $1',
            [decoded.id]
        );
        const user = rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;
