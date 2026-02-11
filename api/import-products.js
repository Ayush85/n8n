import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
});

const API_BASE = 'https://api.fatafatsewa.com/api/get-all-products';
const PER_PAGE = 100;
const DELAY_MS = 500;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function createTable() {
    const sql = `
        DROP TABLE IF EXISTS products;
        CREATE TABLE products (
            id INTEGER PRIMARY KEY,
            name TEXT,
            slug TEXT,
            sku TEXT,
            short_description TEXT,
            description TEXT,
            price NUMERIC,
            original_price NUMERIC,
            discounted_price NUMERIC,
            quantity INTEGER,
            unit TEXT,
            weight TEXT,
            status INTEGER,
            is_featured INTEGER,
            highlights TEXT,
            product_video_url TEXT,
            emi_enabled INTEGER,
            pre_order INTEGER,
            pre_order_price NUMERIC,
            warranty_description TEXT,
            average_rating NUMERIC,
            image_url TEXT,
            image_thumb TEXT,
            image_preview TEXT,
            attributes JSONB,
            variant_attributes JSONB,
            images JSONB,
            reviews JSONB,
            created_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ,
            imported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_products_slug ON products(slug);
        CREATE INDEX idx_products_name ON products(name);
        CREATE INDEX idx_products_price ON products(price);
    `;
    await pool.query(sql);
    console.log('✅ Products table created successfully.');
}

async function fetchPage(page) {
    const url = `${API_BASE}?page=${page}&per_page=${PER_PAGE}`;
    const response = await fetch(url, {
        headers: { 'accept': 'application/json' },
    });
    if (!response.ok) {
        throw new Error(`API returned ${response.status} for page ${page}`);
    }
    return response.json();
}

async function insertProducts(products) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const p of products) {
            await client.query(
                `INSERT INTO products (
                    id, name, slug, sku, short_description, description,
                    price, original_price, discounted_price, quantity, unit, weight,
                    status, is_featured, highlights, product_video_url,
                    emi_enabled, pre_order, pre_order_price, warranty_description,
                    average_rating, image_url, image_thumb, image_preview,
                    attributes, variant_attributes, images, reviews,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8, $9, $10, $11, $12,
                    $13, $14, $15, $16,
                    $17, $18, $19, $20,
                    $21, $22, $23, $24,
                    $25, $26, $27, $28,
                    $29, $30
                )
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    slug = EXCLUDED.slug,
                    sku = EXCLUDED.sku,
                    short_description = EXCLUDED.short_description,
                    description = EXCLUDED.description,
                    price = EXCLUDED.price,
                    original_price = EXCLUDED.original_price,
                    discounted_price = EXCLUDED.discounted_price,
                    quantity = EXCLUDED.quantity,
                    unit = EXCLUDED.unit,
                    weight = EXCLUDED.weight,
                    status = EXCLUDED.status,
                    is_featured = EXCLUDED.is_featured,
                    highlights = EXCLUDED.highlights,
                    product_video_url = EXCLUDED.product_video_url,
                    emi_enabled = EXCLUDED.emi_enabled,
                    pre_order = EXCLUDED.pre_order,
                    pre_order_price = EXCLUDED.pre_order_price,
                    warranty_description = EXCLUDED.warranty_description,
                    average_rating = EXCLUDED.average_rating,
                    image_url = EXCLUDED.image_url,
                    image_thumb = EXCLUDED.image_thumb,
                    image_preview = EXCLUDED.image_preview,
                    attributes = EXCLUDED.attributes,
                    variant_attributes = EXCLUDED.variant_attributes,
                    images = EXCLUDED.images,
                    reviews = EXCLUDED.reviews,
                    created_at = EXCLUDED.created_at,
                    updated_at = EXCLUDED.updated_at,
                    imported_at = CURRENT_TIMESTAMP`,
                [
                    p.id,
                    p.name,
                    p.slug,
                    p.sku,
                    p.short_description,
                    p.description,
                    p.price,
                    p.original_price,
                    p.discounted_price,
                    p.quantity,
                    p.unit,
                    p.weight,
                    p.status,
                    p.is_featured,
                    p.highlights,
                    p.product_video_url,
                    p.emi_enabled,
                    p.pre_order,
                    p.pre_order_price,
                    p.warranty_description,
                    p.average_rating,
                    p.image?.full || null,
                    p.image?.thumb || null,
                    p.image?.preview || null,
                    JSON.stringify(p.attributes || {}),
                    JSON.stringify(p.variant_attributes || {}),
                    JSON.stringify(p.images || []),
                    JSON.stringify(p.reviews || []),
                    p.created_at,
                    p.updated_at,
                ]
            );
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function main() {
    console.log('🚀 Starting Fatafat Sewa product import...\n');

    // Step 1: Create table
    await createTable();

    // Step 2: Fetch first page to get total count
    console.log('📡 Fetching page 1 to determine total pages...');
    const firstPage = await fetchPage(1);
    const { total, last_page } = firstPage.meta;
    console.log(`📊 Total products: ${total} | Total pages: ${last_page}\n`);

    // Insert first page
    await insertProducts(firstPage.data);
    let insertedCount = firstPage.data.length;
    console.log(`✅ Page 1/${last_page} — Inserted ${insertedCount}/${total} products`);

    // Step 3: Fetch remaining pages
    for (let page = 2; page <= last_page; page++) {
        await sleep(DELAY_MS);
        try {
            const result = await fetchPage(page);
            await insertProducts(result.data);
            insertedCount += result.data.length;
            console.log(`✅ Page ${page}/${last_page} — Inserted ${insertedCount}/${total} products`);
        } catch (err) {
            console.error(`❌ Error on page ${page}: ${err.message}`);
            // Retry once after a longer delay
            await sleep(2000);
            try {
                const result = await fetchPage(page);
                await insertProducts(result.data);
                insertedCount += result.data.length;
                console.log(`✅ Page ${page}/${last_page} (retry) — Inserted ${insertedCount}/${total} products`);
            } catch (retryErr) {
                console.error(`❌ Failed again on page ${page}: ${retryErr.message}. Skipping.`);
            }
        }
    }

    // Step 4: Verify
    const countResult = await pool.query('SELECT COUNT(*) FROM products');
    console.log(`\n🎉 Import complete! Total products in database: ${countResult.rows[0].count}`);

    await pool.end();
}

main().catch(err => {
    console.error('Fatal error:', err);
    pool.end();
    process.exit(1);
});
