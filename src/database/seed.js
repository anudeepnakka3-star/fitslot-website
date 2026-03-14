require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const db = require('./db');

console.log('🌱 Seeding FitSlot database...');

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

// ─── Clear & seed slots ───────────────────────────────────────────────────────
db.prepare('DELETE FROM slots').run();
const insertSlot = db.prepare(
    'INSERT INTO slots (name, start_time, end_time, capacity) VALUES (?, ?, ?, 15)'
);
for (const s of slots) {
    insertSlot.run(s.name, s.start_time, s.end_time);
}
console.log(`  ✔ ${slots.length} slots created`);

// ─── Clear & seed categories ──────────────────────────────────────────────────
db.prepare('DELETE FROM booking_categories').run();
db.prepare('DELETE FROM workout_categories').run();
const insertCat = db.prepare(
    'INSERT INTO workout_categories (name, icon) VALUES (?, ?)'
);
for (const c of categories) {
    insertCat.run(c.name, c.icon);
}
console.log(`  ✔ ${categories.length} workout categories created`);

// ─── Admin user ───────────────────────────────────────────────────────────────
const adminEmail = 'admin@bvrit.ac.in';
const adminPassword = 'admin123';
const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run('Gym Admin', adminEmail, hash, 'admin');
    console.log(`  ✔ Admin created: ${adminEmail} / ${adminPassword}`);
} else {
    console.log(`  ℹ Admin already exists`);
}

// ─── Demo student ─────────────────────────────────────────────────────────────
const studentEmail = 'student@bvrit.ac.in';
const studentPassword = 'student123';
const existingStudent = db.prepare('SELECT id FROM users WHERE email = ?').get(studentEmail);
if (!existingStudent) {
    const hash = bcrypt.hashSync(studentPassword, 10);
    db.prepare(
        'INSERT INTO users (name, email, password_hash, role, roll_number) VALUES (?, ?, ?, ?, ?)'
    ).run('Demo Student', studentEmail, hash, 'student', '22B21A0001');
    console.log(`  ✔ Student created: ${studentEmail} / ${studentPassword}`);
} else {
    console.log(`  ℹ Demo student already exists`);
}

console.log('✅ Seeding complete!');
