const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./src/routes/auth');
const slotRoutes = require('./src/routes/slots');
const bookingRoutes = require('./src/routes/bookings');
const attendanceRoutes = require('./src/routes/attendance');
const analyticsRoutes = require('./src/routes/analytics');
const notificationRoutes = require('./src/routes/notifications');
const userRoutes = require('./src/routes/users');
const { initDb } = require('./src/database/db');

const app = express();

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://accounts.google.com", "https://apis.google.com", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com"],
            frameSrc: ["https://accounts.google.com"],
        },
    },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
}));

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 10,                    // 10 requests per window
    message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,   // 1 minute
    max: 100,                   // 100 requests per minute
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.get('/api/debug-db', async (req, res) => {
    try {
        const dbUrl = process.env.DATABASE_URL || 'NOT SET';
        const dbUrlStart = dbUrl.substring(0, 20) + '...';
        const { query } = require('./src/database/db');
        const { rows } = await query('SELECT NOW()');
        res.json({ status: 'connected', time: rows[0].now, dbUrlPresent: !!process.env.DATABASE_URL, dbUrlStart });
    } catch (err) {
        const dbUrl = process.env.DATABASE_URL || 'NOT SET';
        const dbUrlStart = dbUrl.substring(0, 20) + '...';
        res.status(500).json({ 
            status: 'error', 
            message: err.message, 
            dbUrlPresent: !!process.env.DATABASE_URL,
            dbUrlStart,
            dbUrlLength: dbUrl.length,
            stack: err.stack 
        });
    }
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
    });
});

// Serve static frontend
const publicPath = path.join(process.cwd(), 'frontend', 'public');
app.use(express.static(publicPath));

// API Routes (with rate limiting)
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/slots', apiLimiter, slotRoutes);
app.use('/api/bookings', apiLimiter, bookingRoutes);
app.use('/api/attendance', apiLimiter, attendanceRoutes);
app.use('/api/analytics', apiLimiter, analyticsRoutes);
app.use('/api/notifications', apiLimiter, notificationRoutes);
app.use('/api/users', apiLimiter, userRoutes);

// Serve explicit student profile route
app.get('/student/profile', (req, res) => {
    res.sendFile(path.join(publicPath, 'profile.html'));
});

// SPA fallback — serve 404 page for unknown routes, JSON for API
app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) {
        const notFoundPage = path.join(publicPath, '404.html');
        res.status(404).sendFile(notFoundPage, (err) => {
            if (err) {
                res.status(404).send('<h1>404 — Page Not Found</h1>');
            }
        });
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});



// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
    initDb().then(() => {
        app.listen(PORT, () => {
            console.log(`✅ FitSlot server running at http://localhost:${PORT}`);
        });
    }).catch(err => {
        console.error('❌ Failed to initialize database:', err);
        process.exit(1);
    });
}

module.exports = app;

