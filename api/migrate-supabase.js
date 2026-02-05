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

async function applySchema() {
    try {
        console.log('Reading schema.sql...');
        const schema = fs.readFileSync('../schema.sql', 'utf8');

        console.log('Connecting to Supabase...');
        const client = await pool.connect();

        console.log('Applying schema...');
        await client.query(schema);

        console.log('Schema applied successfully!');
        client.release();
    } catch (err) {
        console.error('Error applying schema:', err);
    } finally {
        await pool.end();
    }
}

applySchema();
