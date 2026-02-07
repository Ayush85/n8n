import pg from 'pg';
import fs from 'fs';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
    ssl: { rejectUnauthorized: false } // Required for Supabase
});

async function migrate() {
    try {
        console.log('Applying schema migrations...');

        // Add metadata column if it doesn't exist
        await pool.query(`
            ALTER TABLE sessions 
            ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
        `);
        console.log('✅ Metadata column added/verified');

        console.log('Migration complete!');
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        await pool.end();
    }
}

migrate();
