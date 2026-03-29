const request = require('supertest');
const app = require('../server');
const db = require('../src/database/db');
const bcrypt = require('bcryptjs');

// ─── Test Setup ──────────────────────────────────────────────────────────────

let studentToken, adminToken;
const testStudentEmail = 'teststudent@bvrit.ac.in';
const testAdminEmail = 'testadmin@bvrit.ac.in';
const testPassword = 'Test1234!';

beforeAll(async () => {
    // Ensure schema is initialized
    await db.initDb();

    // Clean up any previous test data
    await db.query("DELETE FROM users WHERE email IN ($1, $2)", [testStudentEmail, testAdminEmail]);

    // Create test student
    const studentHash = bcrypt.hashSync(testPassword, 10);
    await db.query(
        "INSERT INTO users (name, email, password_hash, role, roll_number) VALUES ($1, $2, $3, 'student', '99T99A9999')",
        ['Test Student', testStudentEmail, studentHash]
    );

    // Create test admin
    const adminHash = bcrypt.hashSync(testPassword, 10);
    await db.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')",
        ['Test Admin', testAdminEmail, adminHash]
    );
});

afterAll(async () => {
    // Clean up test data
    const { rows: studentRows } = await db.query("SELECT id FROM users WHERE email = $1", [testStudentEmail]);
    const student = studentRows[0];
    
    if (student) {
        await db.query("DELETE FROM bookings WHERE user_id = $1", [student.id]);
        await db.query("DELETE FROM notifications WHERE user_id = $1", [student.id]);
    }
    
    await db.query("DELETE FROM users WHERE email IN ($1, $2)", [testStudentEmail, testAdminEmail]);
    await db.pool.end();
});

// ─── Health Check ────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
    it('should return health status', async () => {
        const res = await request(app).get('/api/health');
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body).toHaveProperty('uptime');
        expect(res.body).toHaveProperty('timestamp');
    });
});

// ─── Authentication ──────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
    it('should login student with valid credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: testStudentEmail, password: testPassword });
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.user.email).toBe(testStudentEmail);
        expect(res.body.user.role).toBe('student');
        studentToken = res.body.token;
    });

    it('should login admin with valid credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: testAdminEmail, password: testPassword });
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.user.role).toBe('admin');
        adminToken = res.body.token;
    });

    it('should reject invalid password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: testStudentEmail, password: 'WrongPassword1!' });
        
        expect(res.statusCode).toBe(401);
        expect(res.body).toHaveProperty('error');
    });

    it('should reject non-existent email', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@bvrit.ac.in', password: testPassword });
        
        expect(res.statusCode).toBe(401);
    });

    it('should reject invalid email format', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'not-an-email', password: testPassword });
        
        expect(res.statusCode).toBe(400);
    });
});

// ─── Slots ───────────────────────────────────────────────────────────────────

describe('GET /api/slots', () => {
    it('should return slots (requires auth)', async () => {
        const res = await request(app)
            .get('/api/slots')
            .set('Authorization', `Bearer ${studentToken}`);
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('slots');
        expect(Array.isArray(res.body.slots)).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
        const res = await request(app).get('/api/slots');
        expect(res.statusCode).toBe(401);
    });
});

// ─── Bookings ────────────────────────────────────────────────────────────────

describe('GET /api/bookings', () => {
    it('should return student bookings', async () => {
        const res = await request(app)
            .get('/api/bookings')
            .set('Authorization', `Bearer ${studentToken}`);
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('bookings');
        expect(Array.isArray(res.body.bookings)).toBe(true);
    });

    it('should support pagination', async () => {
        const res = await request(app)
            .get('/api/bookings?page=1&limit=5')
            .set('Authorization', `Bearer ${studentToken}`);
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('pagination');
        expect(res.body.pagination.page).toBe(1);
        expect(res.body.pagination.limit).toBe(5);
    });
});

// ─── Admin Endpoints ─────────────────────────────────────────────────────────

describe('GET /api/bookings/admin/all', () => {
    it('should return all bookings for admin', async () => {
        const res = await request(app)
            .get('/api/bookings/admin/all')
            .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('bookings');
    });

    it('should reject non-admin users', async () => {
        const res = await request(app)
            .get('/api/bookings/admin/all')
            .set('Authorization', `Bearer ${studentToken}`);
        
        expect(res.statusCode).toBe(403);
    });
});

describe('GET /api/users', () => {
    it('should return students list for admin', async () => {
        const res = await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('users');
        expect(Array.isArray(res.body.users)).toBe(true);
    });

    it('should reject non-admin users', async () => {
        const res = await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${studentToken}`);
        
        expect(res.statusCode).toBe(403);
    });
});

// ─── Notifications ───────────────────────────────────────────────────────────

describe('GET /api/notifications', () => {
    it('should return user notifications', async () => {
        const res = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${studentToken}`);
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('notifications');
    });
});

// ─── User Profile ────────────────────────────────────────────────────────────

describe('PUT /api/users/profile', () => {
    it('should update user profile', async () => {
        const res = await request(app)
            .put('/api/users/profile')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({ name: 'Updated Student', department: 'CSE', class_section: 'A' });
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('message');
    });
});

// ─── 404 Handling ────────────────────────────────────────────────────────────

describe('404 Handling', () => {
    it('should return JSON 404 for unknown API routes', async () => {
        const res = await request(app).get('/api/nonexistent');
        expect(res.statusCode).toBe(404);
        expect(res.body).toHaveProperty('error');
    });

    it('should return HTML 404 for unknown page routes', async () => {
        const res = await request(app).get('/nonexistent-page');
        expect(res.statusCode).toBe(404);
        expect(res.headers['content-type']).toMatch(/html/);
    });
});
