require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { query, initDb, pool } = require('./db');

async function seed() {
    console.log('🌱 Seeding FitSlot database (PostgreSQL)...');

    // Ensure schema exists
    await initDb();

    // ─── Slot definitions (1-hour windows) ───────────────────────────────────────
    const slots = [
        { name: 'Early Morning 1', start_time: '06:00', end_time: '07:00' },
        { name: 'Early Morning 2', start_time: '07:00', end_time: '08:00' },
        { name: 'Evening 1', start_time: '16:00', end_time: '17:00' },
        { name: 'Evening 2', start_time: '17:00', end_time: '18:00' },
        { name: 'Night 1', start_time: '18:00', end_time: '19:00' },
        { name: 'Night 2', start_time: '19:00', end_time: '20:00' },
    ];

    // ─── Workout categories ───────────────────────────────────────────────────────
    const categories = [
        { name: 'Chest', icon: '💪' },
        { name: 'Triceps', icon: '💪' },
        { name: 'Biceps', icon: '💪' },
        { name: 'Back', icon: '🏋️' },
        { name: 'Shoulders', icon: '🏋️' },
        { name: 'Abs', icon: '🔥' },
        { name: 'Forearms', icon: '💪' },
        { name: 'Legs', icon: '🦵' },
        { name: 'Cardio', icon: '🏃' },
    ];

    // ─── Clear & seed slots (keep demo slot) ──────────────────────────────────────
    await query('DELETE FROM booking_categories');
    await query('DELETE FROM attendance');
    await query('DELETE FROM bookings');
    await query('DELETE FROM slots WHERE is_demo = 0');

    for (const s of slots) {
        await query(
            'INSERT INTO slots (name, start_time, end_time, capacity) VALUES ($1, $2, $3, 15)',
            [s.name, s.start_time, s.end_time]
        );
    }
    console.log(`  ✔ ${slots.length} slots created`);

    // ─── Clear & seed categories ──────────────────────────────────────────────────
    await query('DELETE FROM workout_categories');
    for (const c of categories) {
        await query(
            'INSERT INTO workout_categories (name, icon) VALUES ($1, $2)',
            [c.name, c.icon]
        );
    }
    console.log(`  ✔ ${categories.length} workout categories created`);

    // ─── Admin user ───────────────────────────────────────────────────────────────
    const adminEmail = 'admin@bvrit.ac.in';
    const adminPassword = 'admin123';
    const { rows: existingAdmin } = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existingAdmin.length === 0) {
        const hash = bcrypt.hashSync(adminPassword, 10);
        await query(
            'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
            ['Gym Admin', adminEmail, hash, 'admin']
        );
        console.log(`  ✔ Admin created: ${adminEmail} / ${adminPassword}`);
    } else {
        await query('UPDATE users SET role = $1 WHERE email = $2', ['admin', adminEmail]);
        console.log(`  ℹ Admin already exists. Enforced admin role.`);
    }

    const studentEmail = 'student@bvrit.ac.in';
    const studentPassword = 'student123';
    const hash = bcrypt.hashSync(studentPassword, 10);
    const { rows: existingStudent } = await query('SELECT id FROM users WHERE email = $1', [studentEmail]);
    if (existingStudent.length === 0) {
        await query(
            'INSERT INTO users (name, email, password_hash, role, roll_number) VALUES ($1, $2, $3, $4, $5)',
            ['Demo Student', studentEmail, hash, 'student', '22B21A0001']
        );
        console.log(`  ✔ Student created: ${studentEmail} / ${studentPassword}`);
    } else {
        await query('UPDATE users SET password_hash = $1, role = $2 WHERE email = $3', [hash, 'student', studentEmail]);
        console.log(`  ℹ Demo student password reset and role enforced`);
    }

    console.log('✅ Seeding complete!');
    await pool.end();
}

seed().catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
