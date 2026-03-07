-- ============================================================
-- Aydexis Chat System - Complete Database Schema
-- Apply this to Supabase via: node api/migrate-supabase.js
-- ============================================================

-- ============================================================
-- 1. SESSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    customer_name TEXT,
    user_contact TEXT,          -- email or phone from pre-chat form
    user_id INTEGER,            -- optional relation to users table
    user_email TEXT,
    user_phone TEXT,
    is_active BOOLEAN DEFAULT true,
    title VARCHAR(100),
    status TEXT DEFAULT 'ai',   -- 'ai' | 'human'
    summary TEXT,               -- GPT-generated summary (cached)
    metadata JSONB DEFAULT '{}',-- client info: IP, site_name, host, href, title, user_agent, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add user_contact column if upgrading from an older schema
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'user_contact'
    ) THEN
        ALTER TABLE sessions ADD COLUMN user_contact TEXT;
    END IF;
END $$;

-- Safely add user_id column if upgrading from an older schema
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE sessions ADD COLUMN user_id INTEGER;
    END IF;
END $$;

-- Safely add user_email column if upgrading from an older schema
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'user_email'
    ) THEN
        ALTER TABLE sessions ADD COLUMN user_email TEXT;
    END IF;
END $$;

-- Safely add user_phone column if upgrading from an older schema
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'user_phone'
    ) THEN
        ALTER TABLE sessions ADD COLUMN user_phone TEXT;
    END IF;
END $$;

-- Safely add is_active column if upgrading from an older schema
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE sessions ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Safely add title column if upgrading from an older schema
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'title'
    ) THEN
        ALTER TABLE sessions ADD COLUMN title VARCHAR(100);
    END IF;
END $$;

-- ============================================================
-- 2. MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT REFERENCES sessions(session_id) ON DELETE CASCADE,
    sender      TEXT NOT NULL,  -- 'user' | 'admin' | 'ai'
    content     TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE,
    phone         TEXT UNIQUE,
    name          TEXT,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ
);

-- ============================================================
-- 4. PRODUCTS TABLE (Fatafat Sewa catalogue)
-- ============================================================
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

-- ============================================================
-- 5. INDEXES
-- ============================================================

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_contact ON sessions(user_contact);
CREATE INDEX IF NOT EXISTS idx_sessions_status       ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at   ON sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id      ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active    ON sessions(is_active);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_products_slug  ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_name  ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
