import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 5000,
});

console.log("🔍 Testing Supabase pooled connection...");

try {
    const res = await pool.query("select now()");
    console.log("✅ Connected:", res.rows[0]);
} catch (err) {
    console.error("❌ Failed:", err.code, err.message);
} finally {
    await pool.end();
}
