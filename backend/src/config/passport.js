const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../database/db');
const jwt = require('jsonwebtoken');

const STUDENT_DOMAIN = process.env.STUDENT_EMAIL_DOMAIN || 'bvrit.ac.in';
const JWT_SECRET = process.env.JWT_SECRET || 'fitslot_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

passport.use(new GoogleStrategy(
    {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value?.toLowerCase().trim();
            if (!email) return done(null, false, { message: 'No email from Google' });

            // Enforce college domain for students
            const domain = email.split('@')[1];
            if (domain !== STUDENT_DOMAIN) {
                return done(null, false, { message: `Only @${STUDENT_DOMAIN} email accounts are allowed` });
            }

            // Find or create user
            let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

            if (!user) {
                // Auto-register on first Google login
                const name = profile.displayName || email.split('@')[0];
                const result = db.prepare(
                    'INSERT INTO users (name, email, password_hash, role, google_id) VALUES (?, ?, ?, ?, ?)'
                ).run(name, email, null, 'student', profile.id);

                user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
            } else {
                // Update google_id if not already set
                if (!user.google_id) {
                    db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(profile.id, user.id);
                }
            }

            // Blocked check
            if (user.blocked_until && new Date(user.blocked_until) > new Date()) {
                return done(null, false, {
                    message: `Account blocked until ${new Date(user.blocked_until).toLocaleDateString('en-IN')}`
                });
            }

            // Issue JWT (stored in profile so callback can grab it)
            const token = jwt.sign(
                { id: user.id, name: user.name, email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            return done(null, { user, token });
        } catch (err) {
            return done(err);
        }
    }
));

// Minimal serialise/deserialise (we use JWT, not sessions for actual auth)
passport.serializeUser((data, done) => done(null, data));
passport.deserializeUser((data, done) => done(null, data));

module.exports = passport;
