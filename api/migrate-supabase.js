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
        console.log('Connecting to database...');
        console.log(`Host: ${process.env.DB_HOST}`);
        console.log(`Database: ${process.env.DB_NAME}`);
        console.log(`User: ${process.env.DB_USER}`);
        
        // Test connection
        const testResult = await pool.query('SELECT NOW()');
        console.log('✅ Database connected at:', testResult.rows[0].now);

        console.log('\nApplying schema migrations...');

        // Create sessions table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                customer_name TEXT,
                status TEXT DEFAULT 'human',
                summary TEXT,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Sessions table created/verified');

        // Create messages table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                session_id TEXT REFERENCES sessions(session_id) ON DELETE CASCADE,
                sender TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Messages table created/verified');

        // Create indexes for performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
        `);
        console.log('✅ Indexes created/verified');

        console.log('\n🎉 Migration complete!');
    } catch (err) {
        console.error('❌ Migration error:', err.message);
        console.error(err);
    } finally {
        await pool.end();
    }
}

migrate();
