const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
});

async function test() {
    console.log('Testing connection to Supabase...');
    console.log('Using URL:', process.env.DATABASE_URL?.substring(0, 50) + '...');
    try {
        const res = await pool.query('SELECT NOW()');
        console.log('✅ Connection Successful!');
        console.log('Database Time:', res.rows[0].now);
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection Failed:', err.message);
        console.error('Full Error:', JSON.stringify(err, null, 2));
        process.exit(1);
    }
}

test();
