import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pg from 'pg';
import OpenAI from 'openai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import webpush from 'web-push';
import logger from './config/logger.js';
import { MessageSchema } from './schemas/chat.js';

// OpenAI setup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const { Pool } = pg;

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

// Serve widget files
app.use('/widget', express.static('widget'));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Database setup with Supabase-optimized pool configuration
const pool = new Pool({
    user: process.env.DB_USER || 'n8n',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'n8n_data',
    password: process.env.DB_PASSWORD || 'n8n_password',
    port: parseInt(process.env.DB_PORT || '5432'),
    ssl: process.env.DB_HOST && !process.env.DB_HOST.includes('localhost') ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: false,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
});

pool.on('connect', () => {
    logger.info('Connected to the database');
});

pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', err);
});

const WEB_PUSH_PUBLIC_KEY = process.env.WEB_PUSH_PUBLIC_KEY;
const WEB_PUSH_PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY;
const WEB_PUSH_SUBJECT = process.env.WEB_PUSH_SUBJECT || 'mailto:support@aydexis.com';
const WEB_PUSH_ENABLED = Boolean(WEB_PUSH_PUBLIC_KEY && WEB_PUSH_PRIVATE_KEY);

if (WEB_PUSH_ENABLED) {
    webpush.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY);
    logger.info('Native web push configured (VAPID)');
} else {
    logger.warn('Native web push is disabled. Set WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY to enable it.');
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/push/public-key', (req, res) => {
    if (!WEB_PUSH_ENABLED) {
        return res.status(503).json({ error: 'Web push is not configured on server' });
    }
    res.json({ publicKey: WEB_PUSH_PUBLIC_KEY });
});

app.post('/api/push/subscribe', async (req, res, next) => {
    try {
        const { role = 'admin', sessionId = null, userContact = null, externalId = null, subscription } = req.body || {};
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return res.status(400).json({ error: 'Invalid subscription payload' });
        }

        const normalizedRole = String(role).toLowerCase() === 'user' ? 'user' : 'admin';
        if (normalizedRole === 'admin' && !isAdminAuthorized(req)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        await pool.query(
            `INSERT INTO push_subscriptions
                (endpoint, p256dh, auth, role, session_id, user_contact, external_id, user_agent, updated_at, last_seen_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
             ON CONFLICT (endpoint) DO UPDATE SET
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                role = EXCLUDED.role,
                session_id = EXCLUDED.session_id,
                user_contact = EXCLUDED.user_contact,
                external_id = EXCLUDED.external_id,
                user_agent = EXCLUDED.user_agent,
                updated_at = NOW(),
                last_seen_at = NOW()`,
            [
                subscription.endpoint,
                subscription.keys.p256dh,
                subscription.keys.auth,
                normalizedRole,
                sessionId,
                userContact,
                externalId,
                req.headers['user-agent'] || null,
            ]
        );

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

app.post('/api/push/unsubscribe', async (req, res, next) => {
    try {
        const { endpoint, role = 'admin' } = req.body || {};
        if (!endpoint) {
            return res.status(400).json({ error: 'endpoint is required' });
        }

        const normalizedRole = String(role).toLowerCase() === 'user' ? 'user' : 'admin';
        if (normalizedRole === 'admin' && !isAdminAuthorized(req)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND role = $2', [endpoint, normalizedRole]);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

app.get('/api/push/subscriptions/stats', async (req, res, next) => {
    try {
        if (!isAdminAuthorized(req)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const [adminResult, userResult] = await Promise.all([
            pool.query("SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE role = 'admin'"),
            pool.query("SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE role = 'user'")
        ]);

        const latest = await pool.query(
            `SELECT role, endpoint, updated_at
             FROM push_subscriptions
             ORDER BY updated_at DESC
             LIMIT 5`
        );

        res.json({
            adminCount: adminResult.rows[0]?.count || 0,
            userCount: userResult.rows[0]?.count || 0,
            latest: latest.rows
        });
    } catch (error) {
        next(error);
    }
});

app.post('/api/push/test-admin', async (req, res, next) => {
    try {
        if (!isAdminAuthorized(req)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { title = 'Test Push', body = 'Native push test from API', url } = req.body || {};
        const result = await sendWebPushNotifications({
            title,
            body,
            url: url || getPublicAppUrl(),
            role: 'admin'
        });

        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
});

// ============================================
// FILE UPLOAD - DigitalOcean Spaces
// ============================================
const s3Client = new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT || 'https://sgp1.digitaloceanspaces.com',
    region: process.env.DO_SPACES_REGION || 'sgp1',
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY || '',
        secretAccessKey: process.env.DO_SPACES_SECRET || ''
    },
    forcePathStyle: false
});

const ALLOWED_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed: ${file.mimetype}`));
        }
    }
});

// POST /api/upload - upload a file to DO Spaces and save message
app.post('/api/upload', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const sessionId = req.body.sessionId || 'unknown';
        const folder = process.env.DO_SPACES_FOLDER || 'chatApp';
        const bucket = process.env.DO_SPACES_BUCKET || 'aydexis';
        const region = process.env.DO_SPACES_REGION || 'sgp1';
        const ext = path.extname(req.file.originalname).toLowerCase();
        const uniqueName = `${crypto.randomUUID()}${ext}`;
        const key = `${folder}/${sessionId}/${uniqueName}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            ACL: 'public-read'
        }));

        const fileUrl = `https://${bucket}.${region}.digitaloceanspaces.com/${key}`;
        logger.info(`File uploaded to Spaces: ${fileUrl}`);

        const filePayload = JSON.stringify({
            fileUrl,
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
            fileSize: req.file.size
        });

        await pool.query(
            `INSERT INTO sessions (session_id, status, metadata)
             VALUES ($1, 'ai', '{}')
             ON CONFLICT (session_id) DO UPDATE SET updated_at = NOW()`,
            [sessionId]
        );

        await pool.query(
            'INSERT INTO messages (session_id, sender, content) VALUES ($1, $2, $3)',
            [sessionId, 'user', filePayload]
        );

        io.to(sessionId).emit('new_message', {
            sessionId,
            sender: 'user',
            content: filePayload,
            timestamp: new Date()
        });
        io.emit('session_update', { sessionId, lastMessage: `📎 ${req.file.originalname}` });

        const fileSessionResult = await pool.query(
            'SELECT status, customer_name, user_contact FROM sessions WHERE session_id = $1 LIMIT 1',
            [sessionId]
        );
        const fileSessionRow = fileSessionResult.rows[0];
        const fileIsHumanSession = fileSessionRow?.status === 'human';

        // Broadcast admin_alert — only relevant for human sessions
        io.emit('admin_alert', {
            sessionId,
            sender: 'user',
            content: `📎 ${req.file.originalname}`,
            userName: fileSessionRow?.customer_name || fileSessionRow?.user_contact || 'Customer',
            isHumanSession: fileIsHumanSession,
            timestamp: new Date()
        });

        if (fileIsHumanSession) {
            await sendAdminPushNotification({
                heading: `New file from ${fileSessionRow?.customer_name || fileSessionRow?.user_contact || 'Customer'}`,
                content: `File received: ${req.file.originalname}`,
                url: getPublicAppUrl(),
            });
        }

        res.json({ success: true, fileUrl, fileName: req.file.originalname, fileType: req.file.mimetype, fileSize: req.file.size });
    } catch (error) {
        logger.error('File upload error:', error);
        next(error);
    }
});

// N8N Webhook URL (from environment or default)
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

function getPublicAppUrl() {
    const explicit = process.env.PUBLIC_APP_URL;
    if (explicit && explicit.trim()) return explicit.trim();

    const corsOrigin = process.env.CORS_ORIGIN;
    if (corsOrigin && corsOrigin.trim() && corsOrigin.trim() !== '*') {
        return corsOrigin.trim();
    }

    return undefined;
}

async function ensurePushSubscriptionSchema() {
    try {
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
        await pool.query('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_role ON push_subscriptions(role)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_session_id ON push_subscriptions(session_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_contact ON push_subscriptions(user_contact)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_external_id ON push_subscriptions(external_id)');
    } catch (err) {
        logger.error('Failed to ensure push_subscriptions schema:', err);
    }
}

function isAdminAuthorized(req) {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return true;
    const auth = req.headers.authorization || '';
    return auth === `Bearer ${secret}`;
}

async function sendWebPushNotifications({ title, body, url, role = 'admin', sessionId = null, userContact = null }) {
    if (!WEB_PUSH_ENABLED) return { sent: 0, staleRemoved: 0, skipped: true };

    const params = [role];
    const where = ['role = $1'];

    if (sessionId) {
        params.push(sessionId);
        where.push(`session_id = $${params.length}`);
    }
    if (userContact) {
        params.push(userContact);
        where.push(`LOWER(user_contact) = LOWER($${params.length})`);
    }

    const subsResult = await pool.query(
        `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE ${where.join(' AND ')}`,
        params
    );

    let sent = 0;
    let staleRemoved = 0;

    for (const sub of subsResult.rows) {
        const subscription = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
        };

        const payload = JSON.stringify({
            title: title || 'New Notification',
            body: body || 'You have a new notification',
            url: url || getPublicAppUrl() || '/',
            timestamp: Date.now()
        });

        try {
            await webpush.sendNotification(subscription, payload, { TTL: 60 });
            sent += 1;
        } catch (err) {
            const statusCode = err?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
                await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
                staleRemoved += 1;
                continue;
            }
            logger.warn('Web push send failed for one subscription:', {
                statusCode,
                message: err?.message,
            });
        }
    }

    return { sent, staleRemoved, skipped: false };
}

async function sendAdminPushNotification({ heading, content, url }) {
    const webPushResult = await sendWebPushNotifications({
        title: heading,
        body: content,
        url,
        role: 'admin'
    });

    if (webPushResult.sent > 0) {
        logger.info(`Native web push sent to ${webPushResult.sent} admin subscriber(s)`);
        return;
    }

    logger.warn('No active admin web-push subscription found for this notification.');
}

ensurePushSubscriptionSchema();

// Helper function to parse n8n response (handles multiple layers of JSON stringification)
function parseN8nResponse(data) {
    let parsed = data;

    // Keep parsing if it's a string that looks like JSON
    while (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch (e) {
            // Not JSON, return as is
            break;
        }
    }

    // Now extract the actual message from various possible formats
    // Format 1: [{answer: "message"}] or [{response: "message"}]
    if (Array.isArray(parsed) && parsed.length > 0) {
        const firstItem = parsed[0];

        // Handle [{answer: "..."}]
        if (firstItem.answer) {
            return formatMessage(firstItem.answer);
        }

        // Handle [{response: [...]}] or [{response: "..."}]
        if (firstItem.response) {
            const responseData = firstItem.response;
            if (Array.isArray(responseData) && responseData.length > 0) {
                return formatMessage(responseData[0]);
            }
            return formatMessage(responseData);
        }

        // If first item is a string, return it
        if (typeof firstItem === 'string') {
            return formatMessage(firstItem);
        }
    }

    // Format 2: {response: ["message"]} or {response: "message"}
    if (parsed && typeof parsed === 'object' && parsed.response) {
        if (Array.isArray(parsed.response) && parsed.response.length > 0) {
            return formatMessage(parsed.response[0]);
        }
        return formatMessage(parsed.response);
    }

    // Format 3: {answer: "message"}
    if (parsed && typeof parsed === 'object' && parsed.answer) {
        return formatMessage(parsed.answer);
    }

    // Format 4: {output: ...}, {text: ...}, {result: ...}, etc.
    if (parsed && typeof parsed === 'object') {
        const message = parsed.output || parsed.text || parsed.message || parsed.result;
        if (message) {
            // Recursively parse in case it's still stringified
            return parseN8nResponse(message);
        }
    }

    // Format 5: Direct string or already parsed
    return formatMessage(parsed);
}

// Helper function to format message (convert literal \n to actual newlines)
function formatMessage(message) {
    if (typeof message !== 'string') {
        return message;
    }

    // Replace literal \n with actual newlines
    // Also handle \r\n and just \r
    return message
        .replace(/\\n/g, '\n')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\r/g, '\n');
}

// Human handoff detection phrases
const HUMAN_HANDOFF_PHRASES = [
    'chat with human',
    'talk to human',
    'speak with human',
    'human agent',
    'real person',
    'live agent',
    'customer support',
    'talk to someone',
    'speak to someone',
    'human support',
    'connect to human',
    'transfer to human'
];

// Check if message requests human handoff
function isHumanHandoffRequest(message) {
    const lowerMessage = message.toLowerCase();
    return HUMAN_HANDOFF_PHRASES.some(phrase => lowerMessage.includes(phrase));
}

// Proxy endpoint for n8n AI chat (avoids CORS issues)
app.post('/api/chat', async (req, res, next) => {
    try {
        const { action, sessionId, chatInput, metadata } = req.body;

        logger.info(`Proxying chat request to n8n for session ${sessionId}`);

        // Check if user wants to chat with human
        if (isHumanHandoffRequest(chatInput)) {
            logger.info(`Human handoff requested for session ${sessionId}`);

            const handoffMessage = "Thank you for reaching out! Our support team has been notified and will connect with you within 30 minutes. Please stay in the chat, and we'll be with you shortly! 🙋‍♂️";

            // Update session status to 'human'
            await pool.query(
                "UPDATE sessions SET status = 'human', updated_at = NOW() WHERE session_id = $1",
                [sessionId]
            );

            // Save the AI handoff response to database
            await pool.query(
                'INSERT INTO messages (session_id, sender, content) VALUES ($1, $2, $3)',
                [sessionId, 'ai', handoffMessage]
            );

            // Notify via socket
            io.to(sessionId).emit('status_change', { sessionId, status: 'human' });
            io.emit('session_update', { sessionId, status: 'human' });

            // Broadcast admin_alert for human handoff — urgent
            io.emit('admin_alert', {
                sessionId,
                sender: 'user',
                content: '🔴 Customer requested human support!',
                isHumanSession: true,
                timestamp: new Date()
            });

            await sendAdminPushNotification({
                heading: 'Human support requested',
                content: 'A customer requested to chat with a human agent.',
                url: getPublicAppUrl(),
            });

            // Emit the AI message to socket
            io.to(sessionId).emit('new_message', {
                sessionId,
                sender: 'ai',
                content: handoffMessage,
                timestamp: new Date()
            });

            // Return human handoff response
            return res.json({
                output: handoffMessage,
                handoff: true,
                saved: true,  // Tell widget not to save again
                status: 'human'
            });
        }

        // Forward request to n8n webhook

        // Forward request to n8n webhook
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: action || 'sendMessage',
                sessionId,
                client_id: metadata.client_id,
                chatInput,
                metadata
            })
        });

        if (!response.ok) {
            logger.error(`N8N webhook error: ${response.status} ${response.statusText}`);
            return res.status(502).json({ error: 'AI service unavailable', status: response.status });
        }

        const responseText = await response.text();
        logger.info(`N8N response received for session ${sessionId}`);

        let actualMessage;
        let suggestions = [];

        // Detect n8n streaming SSE format: multiple JSON lines with {type, content}
        const isStreaming = responseText.includes('"type":"item"') || responseText.includes('"type":"begin"');

        if (isStreaming) {
            // Collect all "item" content chunks and assemble the full message
            const lines = responseText.split('\n').filter(l => l.trim());
            let assembled = '';
            for (const line of lines) {
                try {
                    const chunk = JSON.parse(line);
                    if (chunk.type === 'item' && typeof chunk.content === 'string') {
                        assembled += chunk.content;
                    }
                } catch (_) { /* skip malformed lines */ }
            }
            // assembled is the raw JSON string e.g. {"output":"Hey!...","suggestions":[...]}
            try {
                const parsed = JSON.parse(assembled);
                actualMessage = formatMessage(parsed.output || parsed.answer || parsed.response || assembled);
                suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
            } catch (_) {
                actualMessage = formatMessage(assembled);
            }
        } else {
            // Standard JSON response
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                data = responseText;
            }
            actualMessage = parseN8nResponse(data);
            const rawSuggestions = Array.isArray(data) ? data[0]?.suggestions : data?.suggestions;
            suggestions = Array.isArray(rawSuggestions) ? rawSuggestions : [];
        }

        logger.info(`Parsed message from n8n:`, actualMessage);

        // Return in a consistent format
        res.json({ output: actualMessage, suggestions });
    } catch (error) {
        logger.error('Error proxying to n8n:', error);
        next(error);
    }
});

// Product Webhook - Receives product updates from Fatafat Sewa
app.post('/webhook/products', async (req, res) => {
    try {
        // Optional: Verify webhook secret for security
        const webhookSecret = process.env.PRODUCT_WEBHOOK_SECRET;
        if (webhookSecret) {
            const providedSecret = req.headers['x-webhook-secret'] || req.body.secret;
            if (providedSecret !== webhookSecret) {
                logger.warn('Unauthorized product webhook attempt');
                return res.status(401).json({ error: 'Unauthorized' });
            }
        }

        // Accept single product or array of products
        const products = Array.isArray(req.body) ? req.body : 
                        req.body.products ? req.body.products : 
                        [req.body];

        if (!products.length || !products[0].id) {
            return res.status(400).json({ error: 'Invalid product data' });
        }

        const client = await pool.connect();
        let updated = 0;
        let inserted = 0;

        try {
            await client.query('BEGIN');

            for (const p of products) {
                const result = await client.query(
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
                        quantity = EXCLUDED.quantity,
                        price = EXCLUDED.price,
                        original_price = EXCLUDED.original_price,
                        discounted_price = EXCLUDED.discounted_price,
                        status = EXCLUDED.status,
                        is_featured = EXCLUDED.is_featured,
                        average_rating = EXCLUDED.average_rating,
                        image_url = EXCLUDED.image_url,
                        image_thumb = EXCLUDED.image_thumb,
                        image_preview = EXCLUDED.image_preview,
                        images = EXCLUDED.images,
                        reviews = EXCLUDED.reviews,
                        updated_at = EXCLUDED.updated_at,
                        imported_at = CURRENT_TIMESTAMP
                    WHERE 
                        products.quantity != EXCLUDED.quantity OR
                        products.price != EXCLUDED.price OR
                        products.original_price != EXCLUDED.original_price OR
                        products.discounted_price != EXCLUDED.discounted_price OR
                        products.status != EXCLUDED.status OR
                        products.is_featured != EXCLUDED.is_featured OR
                        products.average_rating != EXCLUDED.average_rating OR
                        products.updated_at != EXCLUDED.updated_at
                    RETURNING (xmax = 0) AS inserted`,
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

                if (result.rows[0]?.inserted) {
                    inserted++;
                } else {
                    updated++;
                }
            }

            await client.query('COMMIT');
            
            logger.info(`Product webhook processed: ${inserted} inserted, ${updated} updated`);
            
            res.json({
                success: true,
                inserted,
                updated,
                total: products.length
            });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

    } catch (error) {
        logger.error('Product webhook error:', error);
        res.status(500).json({ error: 'Failed to process product update' });
    }
});

// API endpoint for external inputs (n8n or direct widget)
app.post('/api/messages', async (req, res, next) => {
    try {
        const validatedData = MessageSchema.parse(req.body);
        const { sessionId, sender, content, metadata } = validatedData;

        // Get client IP from request
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';

        // Merge IP into metadata
        const enrichedMetadata = { ...metadata, ip_address: clientIp };

        // 1. Ensure session exists FIRST (before inserting message due to foreign key constraint)
        await pool.query(
            `INSERT INTO sessions (session_id, status, metadata) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (session_id) DO UPDATE SET 
                updated_at = NOW(),
                metadata = COALESCE(sessions.metadata, '{}')::jsonb || $3::jsonb`,
            [sessionId, 'ai', JSON.stringify(enrichedMetadata)]
        );

        // 2. Save message to database
        await pool.query(
            'INSERT INTO messages (session_id, sender, content) VALUES ($1, $2, $3)',
            [sessionId, sender, content]
        );

        // 3. Emit to socket room for this session
        io.to(sessionId).emit('new_message', {
            sessionId,
            sender,
            content,
            timestamp: new Date()
        });

        // 4. Update dashboard lists
        io.emit('session_update', { sessionId, lastMessage: content });
        if (sender === 'user') {
            // Broadcast admin_alert to ALL sockets so dashboard always receives it
            const sessionResult = await pool.query(
                'SELECT status, customer_name, user_contact FROM sessions WHERE session_id = $1 LIMIT 1',
                [sessionId]
            );
            const sessionRow = sessionResult.rows[0];
            io.emit('admin_alert', {
                sessionId,
                sender: 'user',
                content,
                userName: sessionRow?.customer_name || sessionRow?.user_contact || 'Customer',
                isHumanSession: sessionRow?.status === 'human',
                timestamp: new Date()
            });

            if (sessionRow?.status === 'human') {
                await sendAdminPushNotification({
                    heading: `Message from ${sessionRow?.customer_name || sessionRow?.user_contact || 'Customer'}`,
                    content: String(content || '').slice(0, 140) || 'You have a new message',
                    url: getPublicAppUrl(),
                });
            }
        }

        logger.info(`Message received for session ${sessionId} from ${sender} | IP: ${clientIp}`);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// Get sessions for dashboard
app.get('/api/sessions', async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT s.*, 
            (SELECT content FROM messages WHERE session_id = s.session_id ORDER BY created_at DESC LIMIT 1) as last_message,
            (SELECT created_at FROM messages WHERE session_id = s.session_id ORDER BY created_at DESC LIMIT 1) as last_message_at
            FROM sessions s
            ORDER BY last_message_at DESC NULLS LAST
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
});

// Get messages for a session
app.get('/api/sessions/:sessionId/messages', async (req, res, next) => {
    const { sessionId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
            [sessionId]
        );
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
});

// Get single session by ID
app.get('/api/sessions/:sessionId', async (req, res, next) => {
    const { sessionId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM sessions WHERE session_id = $1',
            [sessionId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
});

// Update session status
app.put('/api/sessions/:sessionId/status', async (req, res, next) => {
    const { sessionId } = req.params;
    const { status } = req.body;

    // Validate status value
    const validStatuses = ['ai', 'human'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    try {
        await pool.query(
            'UPDATE sessions SET status = $1, updated_at = NOW() WHERE session_id = $2',
            [status, sessionId]
        );

        // Notify all clients about status change
        io.to(sessionId).emit('status_change', { sessionId, status });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// Update session user info (from pre-chat form)
app.put('/api/sessions/:sessionId/user-info', async (req, res, next) => {
    const { sessionId } = req.params;
    const { contact, email, phone } = req.body;
    try {
        // First ensure the session exists and save user contact
        // Also set customer_name to the contact so it displays instead of "Anonymous"
        await pool.query(
            `INSERT INTO sessions (session_id, customer_name, status, user_contact, metadata) 
             VALUES ($1, $2, 'ai', $2, $3) 
             ON CONFLICT (session_id) DO UPDATE SET 
                updated_at = NOW(),
                customer_name = $2,
                user_contact = $2,
                metadata = COALESCE(sessions.metadata, '{}')::jsonb || $3::jsonb`,
            [sessionId, contact, JSON.stringify({ user_contact: contact, user_email: email, user_phone: phone })]
        );

        logger.info(`User info saved for session ${sessionId}: ${contact}`);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// Create a new chat session for a contact (used by the chat widget)
app.post('/api/sessions/new', async (req, res, next) => {
    const { contact, customerName } = req.body;
    if (!contact) {
        return res.status(400).json({ error: 'contact is required' });
    }
    try {
        const newSessionId = 'sess_' + Math.random().toString(36).substr(2, 9);
        await pool.query(
            `INSERT INTO sessions (session_id, user_contact, customer_name, status, is_active)
             VALUES ($1, $2, $3, 'ai', true)`,
            [newSessionId, contact, customerName || contact]
        );
        logger.info(`New session ${newSessionId} created for contact ${contact}`);
        res.json({ success: true, session_id: newSessionId });
    } catch (error) {
        next(error);
    }
});

// Find existing session by contact (for session continuity)
app.get('/api/sessions/by-contact/:contact', async (req, res, next) => {
    const { contact } = req.params;
    try {
        const result = await pool.query(
            `SELECT s.session_id, s.customer_name, s.user_contact, s.status,
                    s.created_at, s.updated_at,
                    (SELECT content FROM messages m WHERE m.session_id = s.session_id ORDER BY m.created_at ASC LIMIT 1) AS first_message,
                    (SELECT created_at FROM messages m WHERE m.session_id = s.session_id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
             FROM sessions s
             WHERE s.user_contact = $1
             ORDER BY s.updated_at DESC`,
            [contact]
        );

        if (result.rows.length === 0) {
            logger.info(`No existing sessions found for contact: ${contact}`);
            return res.json({ found: false, sessions: [] });
        }

        logger.info(`Found ${result.rows.length} session(s) for contact ${contact}`);
        res.json({ found: true, sessions: result.rows, session: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

// ============================================
// USER AUTHENTICATION & MANAGEMENT
// ============================================

// User login/register - creates or updates user and links session
app.post('/api/auth/login', async (req, res, next) => {
    try {
        const { email, phone, name, sessionId } = req.body;

        if (!email && !phone) {
            return res.status(400).json({ error: 'Email or phone is required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Check if user exists
            let userResult;
            if (email) {
                userResult = await client.query(
                    'SELECT * FROM users WHERE email = $1',
                    [email]
                );
            } else {
                userResult = await client.query(
                    'SELECT * FROM users WHERE phone = $1',
                    [phone]
                );
            }

            let user;
            if (userResult.rows.length > 0) {
                // Update existing user
                user = userResult.rows[0];
                await client.query(
                    `UPDATE users 
                     SET name = COALESCE($1, name), 
                         phone = COALESCE($2, phone),
                         email = COALESCE($3, email),
                         last_login_at = NOW()
                     WHERE id = $4
                     RETURNING *`,
                    [name, phone, email, user.id]
                );
                logger.info(`User logged in: ${user.email || user.phone}`);
            } else {
                // Create new user
                const insertResult = await client.query(
                    `INSERT INTO users (email, phone, name, last_login_at) 
                     VALUES ($1, $2, $3, NOW()) 
                     RETURNING *`,
                    [email, phone, name]
                );
                user = insertResult.rows[0];
                logger.info(`New user registered: ${user.email || user.phone}`);
            }

            // Link current session to user if sessionId provided
            if (sessionId) {
                await client.query(
                    `UPDATE sessions 
                     SET user_id = $1, 
                         user_email = $2, 
                         user_phone = $3,
                         customer_name = $4
                     WHERE session_id = $5`,
                    [user.id, email, phone, name || user.name, sessionId]
                );
                logger.info(`Session ${sessionId} linked to user ${user.id}`);
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    phone: user.phone,
                    name: user.name
                }
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error('Login error:', error);
        next(error);
    }
});

// Get user profile
app.get('/api/users/:userId', async (req, res, next) => {
    const { userId } = req.params;
    try {
        const result = await pool.query(
            'SELECT id, email, phone, name, created_at, last_login_at FROM users WHERE id = $1',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
});

// Get user by email or phone
app.post('/api/users/find', async (req, res, next) => {
    try {
        const { email, phone } = req.body;

        if (!email && !phone) {
            return res.status(400).json({ error: 'Email or phone is required' });
        }

        let result;
        if (email) {
            result = await pool.query(
                'SELECT id, email, phone, name, created_at, last_login_at FROM users WHERE email = $1',
                [email]
            );
        } else {
            result = await pool.query(
                'SELECT id, email, phone, name, created_at, last_login_at FROM users WHERE phone = $1',
                [phone]
            );
        }

        if (result.rows.length === 0) {
            return res.json({ found: false });
        }

        res.json({ found: true, user: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

// Get all sessions for a user
app.get('/api/users/:userId/sessions', async (req, res, next) => {
    const { userId } = req.params;
    const { active_only } = req.query;

    try {
        let query = `
            SELECT 
                s.*,
                (SELECT content FROM messages WHERE session_id = s.session_id ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages WHERE session_id = s.session_id ORDER BY created_at DESC LIMIT 1) as last_message_at,
                (SELECT COUNT(*) FROM messages WHERE session_id = s.session_id) as message_count
            FROM sessions s
            WHERE s.user_id = $1
        `;

        if (active_only === 'true') {
            query += ' AND s.is_active = true';
        }

        query += ' ORDER BY s.updated_at DESC';

        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
});

// Create new session for user
app.post('/api/users/:userId/sessions', async (req, res, next) => {
    const { userId } = req.params;
    const { sessionId } = req.body;

    try {
        // Get user info
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        const newSessionId = sessionId || 'sess_' + Math.random().toString(36).substr(2, 9);

        // Deactivate old sessions (optional)
        await pool.query(
            'UPDATE sessions SET is_active = false WHERE user_id = $1',
            [userId]
        );

        // Create new session
        await pool.query(
            `INSERT INTO sessions (session_id, user_id, user_email, user_phone, customer_name, status, is_active) 
             VALUES ($1, $2, $3, $4, $5, 'ai', true)`,
            [newSessionId, user.id, user.email, user.phone, user.name]
        );

        logger.info(`New session ${newSessionId} created for user ${userId}`);

        res.json({
            success: true,
            sessionId: newSessionId
        });
    } catch (error) {
        next(error);
    }
});

// Mark session as inactive
app.put('/api/sessions/:sessionId/deactivate', async (req, res, next) => {
    const { sessionId } = req.params;

    try {
        await pool.query(
            'UPDATE sessions SET is_active = false WHERE session_id = $1',
            [sessionId]
        );

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// ============================================
// ANALYTICS ENDPOINTS
// ============================================

// Get overall analytics
app.get('/api/analytics', async (req, res, next) => {
    try {
        // Total sessions
        const totalSessions = await pool.query('SELECT COUNT(*) as count FROM sessions');

        // Total unique users (distinct contacts)
        const totalUsers = await pool.query(
            `SELECT COUNT(DISTINCT user_contact) as count FROM sessions WHERE user_contact IS NOT NULL`
        );

        // Total messages
        const totalMessages = await pool.query('SELECT COUNT(*) as count FROM messages');

        // Messages by sender type
        const messagesBySender = await pool.query(`
            SELECT sender, COUNT(*) as count 
            FROM messages 
            GROUP BY sender 
            ORDER BY count DESC
        `);

        // Active sessions (messages in last 24 hours)
        const activeSessions = await pool.query(`
            SELECT COUNT(DISTINCT session_id) as count 
            FROM messages 
            WHERE created_at > NOW() - INTERVAL '24 hours'
        `);

        // Sessions by status
        const sessionsByStatus = await pool.query(`
            SELECT status, COUNT(*) as count 
            FROM sessions 
            GROUP BY status
        `);

        // Messages per day (last 7 days)
        const messagesPerDay = await pool.query(`
            SELECT DATE(created_at) as date, COUNT(*) as count 
            FROM messages 
            WHERE created_at > NOW() - INTERVAL '7 days'
            GROUP BY DATE(created_at) 
            ORDER BY date DESC
        `);

        // Average messages per session
        const avgMessagesPerSession = await pool.query(`
            SELECT AVG(msg_count)::numeric(10,2) as avg 
            FROM (SELECT session_id, COUNT(*) as msg_count FROM messages GROUP BY session_id) as subq
        `);

        // Peak hours (messages grouped by hour)
        const peakHours = await pool.query(`
            SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count 
            FROM messages 
            GROUP BY EXTRACT(HOUR FROM created_at) 
            ORDER BY count DESC 
            LIMIT 5
        `);

        // Response time metrics (time between user message and admin/ai reply)
        const avgResponseTime = await pool.query(`
            WITH user_messages AS (
                SELECT session_id, created_at as user_time, 
                       ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) as rn
                FROM messages WHERE sender = 'user'
            ),
            responses AS (
                SELECT session_id, created_at as response_time, sender,
                       ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) as rn
                FROM messages WHERE sender IN ('admin', 'ai')
            )
            SELECT 
                AVG(EXTRACT(EPOCH FROM (r.response_time - u.user_time)))::numeric(10,2) as avg_seconds
            FROM user_messages u
            JOIN responses r ON u.session_id = r.session_id AND r.rn = u.rn
            WHERE r.response_time > u.user_time
        `);

        res.json({
            totalSessions: parseInt(totalSessions.rows[0].count),
            totalUsers: parseInt(totalUsers.rows[0].count),
            totalMessages: parseInt(totalMessages.rows[0].count),
            activeSessions24h: parseInt(activeSessions.rows[0].count),
            messagesBySender: messagesBySender.rows,
            sessionsByStatus: sessionsByStatus.rows,
            messagesPerDay: messagesPerDay.rows,
            avgMessagesPerSession: parseFloat(avgMessagesPerSession.rows[0]?.avg || 0),
            peakHours: peakHours.rows,
            avgResponseTimeSeconds: parseFloat(avgResponseTime.rows[0]?.avg_seconds || 0)
        });
    } catch (error) {
        next(error);
    }
});

// GPT-powered session summary
app.get('/api/sessions/:sessionId/summary', async (req, res, next) => {
    const { sessionId } = req.params;

    // Guard: Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('sk-your')) {
        return res.status(503).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file.' });
    }

    try {
        // Get all messages for the session
        const messages = await pool.query(
            'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
            [sessionId]
        );

        // Get session info
        const session = await pool.query(
            'SELECT * FROM sessions WHERE session_id = $1',
            [sessionId]
        );

        if (session.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (messages.rows.length === 0) {
            return res.json({
                sessionId,
                summary: 'No messages in this session yet.',
                sentiment: 'neutral',
                topics: [],
                intent: 'unknown',
                resolved: 'unclear',
                stats: { totalMessages: 0, userMessages: 0, aiMessages: 0, adminMessages: 0, sessionDurationSeconds: 0 }
            });
        }

        const userMessages = messages.rows.filter(m => m.sender === 'user');
        const aiMessages = messages.rows.filter(m => m.sender === 'ai');
        const adminMessages = messages.rows.filter(m => m.sender === 'admin');

        // Calculate session duration
        let sessionDuration = 0;
        if (messages.rows.length > 1) {
            const firstMsg = new Date(messages.rows[0].created_at);
            const lastMsg = new Date(messages.rows[messages.rows.length - 1].created_at);
            sessionDuration = Math.round((lastMsg - firstMsg) / 1000);
        }

        // Build conversation text for GPT
        const conversationText = messages.rows
            .map(m => `${m.sender.toUpperCase()}: ${m.content}`)
            .join('\n');

        // Call GPT for intelligent summary
        const gptResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: `You are a chat analyst. Analyze the following customer support conversation and return a JSON object with these exact fields:
- "summary": a concise 2-3 sentence summary of the conversation
- "sentiment": the user's overall sentiment (one of: "positive", "neutral", "negative")
- "topics": an array of key topics discussed (max 5 short phrases)
- "intent": what the user was trying to achieve in one sentence
- "resolved": whether the user's issue was resolved (one of: true, false, "unclear")
- "highlights": array of max 3 notable quotes or key moments from the conversation

Return ONLY valid JSON, no other text.`
                },
                {
                    role: 'user',
                    content: conversationText
                }
            ]
        });

        let gptAnalysis;
        try {
            gptAnalysis = JSON.parse(gptResponse.choices[0].message.content);
        } catch (parseErr) {
            logger.error('Failed to parse GPT response:', gptResponse.choices[0].message.content);
            gptAnalysis = {
                summary: gptResponse.choices[0].message.content,
                sentiment: 'neutral',
                topics: [],
                intent: 'unknown',
                resolved: 'unclear',
                highlights: []
            };
        }

        // Also save the summary to the session for caching
        await pool.query(
            'UPDATE sessions SET summary = $1, updated_at = NOW() WHERE session_id = $2',
            [gptAnalysis.summary, sessionId]
        );

        logger.info(`GPT summary generated for session ${sessionId}`);

        res.json({
            sessionId,
            status: session.rows[0].status,
            customerName: session.rows[0].customer_name,
            metadata: session.rows[0].metadata,
            createdAt: session.rows[0].created_at,
            updatedAt: session.rows[0].updated_at,
            ...gptAnalysis,
            stats: {
                totalMessages: messages.rows.length,
                userMessages: userMessages.length,
                aiMessages: aiMessages.length,
                adminMessages: adminMessages.length,
                sessionDurationSeconds: sessionDuration
            },
            tokensUsed: gptResponse.usage?.total_tokens || 0
        });
    } catch (error) {
        logger.error('Error generating GPT summary:', error);
        next(error);
    }
});

// GPT-powered chat report across multiple sessions
app.post('/api/reports/chat', async (req, res, next) => {
    // Guard: Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('sk-your')) {
        return res.status(503).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file.' });
    }

    try {
        const { startDate, endDate, status, limit = 20 } = req.body;

        // Build dynamic query based on filters
        let whereConditions = [];
        let queryParams = [];
        let paramIndex = 1;

        if (startDate) {
            whereConditions.push(`s.created_at >= $${paramIndex}`);
            queryParams.push(startDate);
            paramIndex++;
        }
        if (endDate) {
            whereConditions.push(`s.created_at <= $${paramIndex}`);
            queryParams.push(endDate);
            paramIndex++;
        }
        if (status) {
            whereConditions.push(`s.status = $${paramIndex}`);
            queryParams.push(status);
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get sessions with their messages
        const sessionsResult = await pool.query(
            `SELECT s.session_id, s.customer_name, s.status, s.created_at
             FROM sessions s
             ${whereClause}
             ORDER BY s.created_at DESC
             LIMIT $${paramIndex}`,
            [...queryParams, Math.min(limit, 50)]
        );

        if (sessionsResult.rows.length === 0) {
            return res.json({
                reportSummary: 'No sessions found matching the specified filters.',
                commonTopics: [],
                sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
                recommendations: [],
                sessionCount: 0
            });
        }

        // Fetch messages for each session
        const sessionSummaries = [];
        for (const session of sessionsResult.rows) {
            const messagesResult = await pool.query(
                'SELECT sender, content FROM messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT 30',
                [session.session_id]
            );

            if (messagesResult.rows.length > 0) {
                const convo = messagesResult.rows
                    .map(m => `${m.sender.toUpperCase()}: ${m.content}`)
                    .join('\n');
                sessionSummaries.push(`--- Session: ${session.customer_name || session.session_id} (${session.status}) ---\n${convo}`);
            }
        }

        if (sessionSummaries.length === 0) {
            return res.json({
                reportSummary: 'Sessions found but no messages to analyze.',
                commonTopics: [],
                sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
                recommendations: [],
                sessionCount: sessionsResult.rows.length
            });
        }

        // Truncate to ~12000 chars to stay within token limits
        let combinedText = sessionSummaries.join('\n\n');
        if (combinedText.length > 12000) {
            combinedText = combinedText.substring(0, 12000) + '\n... (truncated)';
        }

        // Call GPT for overall report
        const gptResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: `You are a customer support analyst. Analyze these ${sessionSummaries.length} chat conversations and return a JSON report with these exact fields:
- "reportSummary": a concise 3-5 sentence overall summary of all conversations
- "commonTopics": array of the top 5-10 most common topics/issues customers are asking about (each as a short string)
- "sentimentBreakdown": object with keys "positive", "neutral", "negative" containing estimated counts based on the conversations
- "recommendations": array of 3-5 actionable suggestions to improve customer support based on the patterns you see
- "keyInsights": array of 3-5 important observations about customer behavior or common pain points

Return ONLY valid JSON, no other text.`
                },
                {
                    role: 'user',
                    content: combinedText
                }
            ]
        });

        let report;
        try {
            report = JSON.parse(gptResponse.choices[0].message.content);
        } catch (parseErr) {
            logger.error('Failed to parse GPT report response:', gptResponse.choices[0].message.content);
            report = {
                reportSummary: gptResponse.choices[0].message.content,
                commonTopics: [],
                sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
                recommendations: [],
                keyInsights: []
            };
        }

        logger.info(`GPT report generated for ${sessionSummaries.length} sessions`);

        res.json({
            ...report,
            sessionCount: sessionsResult.rows.length,
            sessionsAnalyzed: sessionSummaries.length,
            filters: { startDate, endDate, status, limit },
            generatedAt: new Date().toISOString(),
            tokensUsed: gptResponse.usage?.total_tokens || 0
        });
    } catch (error) {
        logger.error('Error generating chat report:', error);
        next(error);
    }
});

// Get top user queries across all sessions
app.get('/api/analytics/top-queries', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 20;

        // Get recent user messages
        const result = await pool.query(`
            SELECT content, created_at, session_id 
            FROM messages 
            WHERE sender = 'user' 
            ORDER BY created_at DESC 
            LIMIT 100
        `);

        // Extract and count common phrases/questions
        const queryCounts = {};
        result.rows.forEach(row => {
            const content = row.content.toLowerCase().trim();
            if (content.length > 5) {
                queryCounts[content] = (queryCounts[content] || 0) + 1;
            }
        });

        const topQueries = Object.entries(queryCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([query, count]) => ({ query, count }));

        res.json({ topQueries, totalUserMessages: result.rows.length });
    } catch (error) {
        next(error);
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    if (err.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    logger.error('Unhandled Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Socket.io logic
io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.on('join_session', (sessionId) => {
        if (!sessionId) return;
        socket.join(sessionId);
        logger.info(`Client ${socket.id} joined session: ${sessionId}`);
    });

    socket.on('leave_session', (sessionId) => {
        if (!sessionId) return;
        socket.leave(sessionId);
        logger.info(`Client ${socket.id} left session: ${sessionId}`);
    });

    socket.on('send_manual_message', async (data) => {
        try {
            const validatedData = MessageSchema.parse({ ...data, sender: 'admin' });
            const { sessionId, content } = validatedData;

            await pool.query(
                'INSERT INTO messages (session_id, sender, content) VALUES ($1, $2, $3)',
                [sessionId, 'admin', content]
            );

            // Broadcast to the specifically joined room
            io.to(sessionId).emit('new_message', {
                sessionId,
                sender: 'admin',
                content,
                timestamp: new Date()
            });

            await pool.query(
                "UPDATE sessions SET status = 'human', updated_at = NOW() WHERE session_id = $1",
                [sessionId]
            );

            const sessionResult = await pool.query(
                'SELECT user_contact FROM sessions WHERE session_id = $1 LIMIT 1',
                [sessionId]
            );
            const userContact = sessionResult.rows[0]?.user_contact || null;
            if (userContact) {
                await sendWebPushNotifications({
                    title: 'New support reply',
                    body: content.length > 120 ? `${content.slice(0, 117)}...` : content,
                    url: getPublicAppUrl(),
                    role: 'user',
                    userContact,
                });
            } else {
                logger.warn(`Skipping user push for ${sessionId}; no user_contact available.`);
            }

            // Notify all clients about status change
            io.to(sessionId).emit('status_change', { sessionId, status: 'human' });

            logger.info(`Admin reply sent to ${sessionId}`);
        } catch (error) {
            logger.error('Error sending manual message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
    });
});

const PORT = process.env.API_PORT || 3001;
httpServer.listen(PORT, () => {
    logger.info(`API Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    httpServer.close(() => {
        logger.info('HTTP server closed');
        pool.end(() => {
            logger.info('Database pool closed');
            process.exit(0);
        });
    });
});
