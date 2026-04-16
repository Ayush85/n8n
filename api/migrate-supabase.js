import pg from 'pg';
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

        // --------------------------------------------------------
        // 1. SESSIONS TABLE
        // --------------------------------------------------------
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                session_id  TEXT PRIMARY KEY,
                customer_name TEXT,
                user_contact  TEXT,
                user_id       INTEGER,
                user_email    TEXT,
                user_phone    TEXT,
                is_active     BOOLEAN DEFAULT true,
                title         VARCHAR(100),
                status        TEXT DEFAULT 'ai',
                summary       TEXT,
                metadata      JSONB DEFAULT '{}',
                created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Sessions table created/verified');

        // Safely add user_contact column if upgrading from older schema
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'sessions' AND column_name = 'user_contact'
                ) THEN
                    ALTER TABLE sessions ADD COLUMN user_contact TEXT;
                END IF;
            END $$;
        `);
        console.log('✅ user_contact column verified');

        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'sessions' AND column_name = 'user_id'
                ) THEN
                    ALTER TABLE sessions ADD COLUMN user_id INTEGER;
                END IF;
            END $$;
        `);
        console.log('✅ user_id column verified');

        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'sessions' AND column_name = 'user_email'
                ) THEN
                    ALTER TABLE sessions ADD COLUMN user_email TEXT;
                END IF;
            END $$;
        `);
        console.log('✅ user_email column verified');

        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'sessions' AND column_name = 'user_phone'
                ) THEN
                    ALTER TABLE sessions ADD COLUMN user_phone TEXT;
                END IF;
            END $$;
        `);
        console.log('✅ user_phone column verified');

        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'sessions' AND column_name = 'is_active'
                ) THEN
                    ALTER TABLE sessions ADD COLUMN is_active BOOLEAN DEFAULT true;
                END IF;
            END $$;
        `);
        console.log('✅ is_active column verified');

        // Safely add title column for multi-session chat
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'sessions' AND column_name = 'title'
                ) THEN
                    ALTER TABLE sessions ADD COLUMN title VARCHAR(100);
                END IF;
            END $$;
        `);
        console.log('✅ title column verified');

        // --------------------------------------------------------
        // 2. USERS TABLE
        // --------------------------------------------------------
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id            SERIAL PRIMARY KEY,
                email         TEXT UNIQUE,
                phone         TEXT UNIQUE,
                name          TEXT,
                created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                last_login_at TIMESTAMPTZ
            );
        `);
        console.log('✅ Users table created/verified');

        // --------------------------------------------------------
        // 3. MESSAGES TABLE
        // --------------------------------------------------------
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id          SERIAL PRIMARY KEY,
                session_id  TEXT REFERENCES sessions(session_id) ON DELETE CASCADE,
                sender      TEXT NOT NULL,
                content     TEXT NOT NULL,
                created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Messages table created/verified');

        // --------------------------------------------------------
        // 4. PRODUCTS TABLE
        // --------------------------------------------------------
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id                    INTEGER PRIMARY KEY,
                name                  TEXT,
                slug                  TEXT,
                sku                   TEXT,
                short_description     TEXT,
                description           TEXT,
                price                 NUMERIC,
                original_price        NUMERIC,
                discounted_price      NUMERIC,
                quantity              INTEGER,
                unit                  TEXT,
                weight                TEXT,
                status                INTEGER,
                is_featured           INTEGER,
                highlights            TEXT,
                product_video_url     TEXT,
                emi_enabled           INTEGER,
                pre_order             INTEGER,
                pre_order_price       NUMERIC,
                warranty_description  TEXT,
                average_rating        NUMERIC,
                image_url             TEXT,
                image_thumb           TEXT,
                image_preview         TEXT,
                attributes            JSONB,
                variant_attributes    JSONB,
                images                JSONB,
                reviews               JSONB,
                created_at            TIMESTAMPTZ,
                updated_at            TIMESTAMPTZ,
                imported_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Products table created/verified');

        // --------------------------------------------------------
        // 5. PUSH SUBSCRIPTIONS TABLE
        // --------------------------------------------------------
        await pool.query(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id            SERIAL PRIMARY KEY,
                endpoint      TEXT UNIQUE NOT NULL,
                p256dh        TEXT NOT NULL,
                auth          TEXT NOT NULL,
                role          TEXT NOT NULL DEFAULT 'admin',
                session_id    TEXT,
                user_contact  TEXT,
                external_id   TEXT,
                user_agent    TEXT,
                created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                last_seen_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Push subscriptions table created/verified');

        // Final safety pass: ensure required session columns exist before indexing.
        // This protects older databases where prior conditional blocks may not have applied.
        await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_contact TEXT`);
        await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id INTEGER`);
        await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_email TEXT`);
        await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_phone TEXT`);
        await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);
        await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title VARCHAR(100)`);
        console.log('✅ Final sessions column safety pass complete');

        // --------------------------------------------------------
        // 5. INDEXES
        // --------------------------------------------------------
        const indexes = [
            // Messages
            `CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`,
            `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`,
            // Sessions
            `CREATE INDEX IF NOT EXISTS idx_sessions_user_contact ON sessions(user_contact)`,
            `CREATE INDEX IF NOT EXISTS idx_sessions_status       ON sessions(status)`,
            `CREATE INDEX IF NOT EXISTS idx_sessions_updated_at   ON sessions(updated_at)`,
            `CREATE INDEX IF NOT EXISTS idx_sessions_user_id      ON sessions(user_id)` ,
            `CREATE INDEX IF NOT EXISTS idx_sessions_is_active    ON sessions(is_active)` ,
            // Users
            `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)` ,
            `CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)` ,
            // Push subscriptions
            `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_role ON push_subscriptions(role)`,
            `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_session_id ON push_subscriptions(session_id)`,
            `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_contact ON push_subscriptions(user_contact)`,
            `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_external_id ON push_subscriptions(external_id)`,
            // Products
            `CREATE INDEX IF NOT EXISTS idx_products_slug  ON products(slug)`,
            `CREATE INDEX IF NOT EXISTS idx_products_name  ON products(name)`,
            `CREATE INDEX IF NOT EXISTS idx_products_price ON products(price)`,
        ];

        for (const idx of indexes) {
            await pool.query(idx);
        }
        console.log('✅ All indexes created/verified');

        console.log('\n🎉 Migration complete! All tables are ready.');
    } catch (err) {
        console.error('❌ Migration error:', err.message);
        console.error(err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
