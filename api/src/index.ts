import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pg from 'pg';
import OpenAI from 'openai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import path from 'path';
import bcrypt from 'bcryptjs';
import { signToken, requireAuth, requireRole } from './middleware/auth.js';
import crypto from 'crypto';
import webpush from 'web-push';
import logger from './config/logger.js';
import { MessageSchema } from './schemas/chat.js';

const { Pool } = pg;

// ── Types ────────────────────────────────────────────────────────────────────

interface PushNotificationPayload {
    title: string;
    body: string;
    url?: string;
    role?: 'admin' | 'user';
    sessionId?: string | null;
    userContact?: string | null;
}

interface AdminPushPayload {
    heading: string;
    content: string;
    url?: string;
}

interface ProductPayload {
    id: string;
    name: string;
    slug: string;
    sku: string;
    short_description: string;
    description: string;
    price: number;
    original_price: number;
    discounted_price: number;
    quantity: number;
    unit: string;
    weight: number;
    status: string;
    is_featured: boolean;
    highlights: string;
    product_video_url: string;
    emi_enabled: boolean;
    pre_order: boolean;
    pre_order_price: number;
    warranty_description: string;
    average_rating: number;
    image?: { full?: string; thumb?: string; preview?: string };
    attributes?: Record<string, unknown>;
    variant_attributes?: Record<string, unknown>;
    images?: unknown[];
    reviews?: unknown[];
    created_at: string;
    updated_at: string;
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Express + Socket.io ──────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));
app.use('/widget', express.static('widget'));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── Database ─────────────────────────────────────────────────────────────────

const pool = new Pool({
    user: process.env.DB_USER || 'n8n',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'n8n_data',
    password: process.env.DB_PASSWORD || 'n8n_password',
    port: parseInt(process.env.DB_PORT || '5432'),
    ssl:
        process.env.DB_HOST && !process.env.DB_HOST.includes('localhost')
            ? { rejectUnauthorized: false }
            : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: false,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
});

pool.on('connect', () => logger.info('Connected to the database'));
pool.on('error', (err) => logger.error('Unexpected error on idle client', err));

// ── Web Push ─────────────────────────────────────────────────────────────────

const WEB_PUSH_PUBLIC_KEY = process.env.WEB_PUSH_PUBLIC_KEY ?? '';
const WEB_PUSH_PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY ?? '';
const WEB_PUSH_SUBJECT = process.env.WEB_PUSH_SUBJECT || 'mailto:support@aydexis.com';
const WEB_PUSH_ENABLED = Boolean(WEB_PUSH_PUBLIC_KEY && WEB_PUSH_PRIVATE_KEY);

if (WEB_PUSH_ENABLED) {
    webpush.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY);
    logger.info('Native web push configured (VAPID)');
} else {
    logger.warn('Native web push disabled — set WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY to enable.');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPublicAppUrl(): string | undefined {
    const explicit = process.env.PUBLIC_APP_URL;
    if (explicit?.trim()) return explicit.trim();
    const origin = process.env.CORS_ORIGIN;
    if (origin?.trim() && origin.trim() !== '*') return origin.trim();
    return undefined;
}

function isAdminAuthorized(req: Request): boolean {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return true;
    return req.headers.authorization === `Bearer ${secret}`;
}

function formatMessage(message: unknown): string {
    if (typeof message !== 'string') return String(message ?? '');
    return message.replace(/\\n/g, '\n').replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n');
}

function parseN8nResponse(data: unknown): string {
    let parsed = data;
    while (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { break; }
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0] as Record<string, unknown>;
        if (first.answer) return formatMessage(first.answer);
        if (first.response) {
            const r = first.response;
            if (Array.isArray(r) && r.length > 0) return formatMessage(r[0]);
            return formatMessage(r);
        }
        if (typeof first === 'string') return formatMessage(first);
    }

    if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        if (obj.response) {
            if (Array.isArray(obj.response) && obj.response.length > 0) return formatMessage(obj.response[0]);
            return formatMessage(obj.response);
        }
        if (obj.answer) return formatMessage(obj.answer);
        const msg = obj.output ?? obj.text ?? obj.message ?? obj.result;
        if (msg) return parseN8nResponse(msg);
    }

    return formatMessage(parsed);
}

const HUMAN_HANDOFF_PHRASES = [
    'chat with human', 'talk to human', 'speak with human', 'human agent',
    'real person', 'live agent', 'customer support', 'talk to someone',
    'speak to someone', 'human support', 'connect to human', 'transfer to human',
];

function isHumanHandoffRequest(message: string): boolean {
    const lower = message.toLowerCase();
    return HUMAN_HANDOFF_PHRASES.some((p) => lower.includes(p));
}

async function sendWebPushNotifications({
    title, body, url, role = 'admin', sessionId = null, userContact = null,
}: PushNotificationPayload): Promise<{ sent: number; staleRemoved: number; skipped: boolean }> {
    if (!WEB_PUSH_ENABLED) return { sent: 0, staleRemoved: 0, skipped: true };

    const params: unknown[] = [role];
    const where: string[] = ['role = $1'];

    if (sessionId) { params.push(sessionId); where.push(`session_id = $${params.length}`); }
    if (userContact) { params.push(userContact); where.push(`LOWER(user_contact) = LOWER($${params.length})`); }

    const subsResult = await pool.query(
        `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE ${where.join(' AND ')}`,
        params,
    );

    let sent = 0;
    let staleRemoved = 0;

    for (const sub of subsResult.rows as { endpoint: string; p256dh: string; auth: string }[]) {
        const payload = JSON.stringify({
            title: title || 'New Notification',
            body: body || 'You have a new notification',
            url: url ?? getPublicAppUrl() ?? '/',
            timestamp: Date.now(),
        });

        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload,
                { TTL: 60 },
            );
            sent += 1;
        } catch (err: unknown) {
            const statusCode = (err as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
                await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
                staleRemoved += 1;
            } else {
                logger.warn('Web push send failed:', { statusCode, message: (err as Error).message });
            }
        }
    }

    return { sent, staleRemoved, skipped: false };
}

async function sendAdminPushNotification({ heading, content, url }: AdminPushPayload): Promise<void> {
    const result = await sendWebPushNotifications({ title: heading, body: content, url, role: 'admin' });
    if (result.sent > 0) {
        logger.info(`Native web push sent to ${result.sent} admin subscriber(s)`);
    } else {
        logger.warn('No active admin web-push subscription found.');
    }
}

async function ensurePushSubscriptionSchema(): Promise<void> {
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

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Push endpoints ────────────────────────────────────────────────────────────

app.get('/api/push/public-key', (_req: Request, res: Response) => {
    if (!WEB_PUSH_ENABLED) return void res.status(503).json({ error: 'Web push not configured' });
    res.json({ publicKey: WEB_PUSH_PUBLIC_KEY });
});

app.post('/api/push/subscribe', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { role = 'admin', sessionId = null, userContact = null, externalId = null, subscription } = req.body ?? {};
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return void res.status(400).json({ error: 'Invalid subscription payload' });
        }

        const normalizedRole = String(role).toLowerCase() === 'user' ? 'user' : 'admin';
        if (normalizedRole === 'admin' && !isAdminAuthorized(req)) {
            return void res.status(401).json({ error: 'Unauthorized' });
        }

        await pool.query(
            `INSERT INTO push_subscriptions
                (endpoint, p256dh, auth, role, session_id, user_contact, external_id, user_agent, updated_at, last_seen_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
             ON CONFLICT (endpoint) DO UPDATE SET
                p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, role=EXCLUDED.role,
                session_id=EXCLUDED.session_id, user_contact=EXCLUDED.user_contact,
                external_id=EXCLUDED.external_id, user_agent=EXCLUDED.user_agent,
                updated_at=NOW(), last_seen_at=NOW()`,
            [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth,
             normalizedRole, sessionId, userContact, externalId, req.headers['user-agent'] || null],
        );

        res.json({ success: true });
    } catch (err) { next(err); }
});

app.post('/api/push/unsubscribe', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { endpoint, role = 'admin' } = req.body ?? {};
        if (!endpoint) return void res.status(400).json({ error: 'endpoint is required' });

        const normalizedRole = String(role).toLowerCase() === 'user' ? 'user' : 'admin';
        if (normalizedRole === 'admin' && !isAdminAuthorized(req)) {
            return void res.status(401).json({ error: 'Unauthorized' });
        }

        await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND role = $2', [endpoint, normalizedRole]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

app.get('/api/push/subscriptions/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!isAdminAuthorized(req)) return void res.status(401).json({ error: 'Unauthorized' });

        const [adminResult, userResult, latest] = await Promise.all([
            pool.query("SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE role='admin'"),
            pool.query("SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE role='user'"),
            pool.query('SELECT role,endpoint,updated_at FROM push_subscriptions ORDER BY updated_at DESC LIMIT 5'),
        ]);

        res.json({ adminCount: adminResult.rows[0]?.count || 0, userCount: userResult.rows[0]?.count || 0, latest: latest.rows });
    } catch (err) { next(err); }
});

app.post('/api/push/test-admin', async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!isAdminAuthorized(req)) return void res.status(401).json({ error: 'Unauthorized' });
        const { title = 'Test Push', body = 'Native push test', url } = req.body ?? {};
        const result = await sendWebPushNotifications({ title, body, url: url || getPublicAppUrl(), role: 'admin' });
        res.json({ success: true, ...result });
    } catch (err) { next(err); }
});

// ── File upload (DigitalOcean Spaces) ────────────────────────────────────────

const s3Client = new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT || 'https://sgp1.digitaloceanspaces.com',
    region: process.env.DO_SPACES_REGION || 'sgp1',
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY || '',
        secretAccessKey: process.env.DO_SPACES_SECRET || '',
    },
    forcePathStyle: false,
});

const ALLOWED_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed: ${file.mimetype}`));
        }
    },
});

app.post('/api/upload', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.file) return void res.status(400).json({ error: 'No file provided' });

        const sessionId = (req.body.sessionId as string) || 'unknown';
        const folder = process.env.DO_SPACES_FOLDER || 'chatApp';
        const bucket = process.env.DO_SPACES_BUCKET || 'aydexis';
        const region = process.env.DO_SPACES_REGION || 'sgp1';
        const ext = path.extname(req.file.originalname).toLowerCase();
        const key = `${folder}/${sessionId}/${crypto.randomUUID()}${ext}`;

        await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            ACL: 'public-read',
        }));

        const fileUrl = `https://${bucket}.${region}.digitaloceanspaces.com/${key}`;
        const filePayload = JSON.stringify({
            fileUrl, fileName: req.file.originalname, fileType: req.file.mimetype, fileSize: req.file.size,
        });

        await pool.query(
            `INSERT INTO sessions (session_id, status, metadata) VALUES ($1,'ai','{}')
             ON CONFLICT (session_id) DO UPDATE SET updated_at=NOW()`,
            [sessionId],
        );
        await pool.query('INSERT INTO messages (session_id, sender, content) VALUES ($1,$2,$3)',
            [sessionId, 'user', filePayload]);

        io.to(sessionId).emit('new_message', { sessionId, sender: 'user', content: filePayload, timestamp: new Date() });
        io.emit('session_update', { sessionId, lastMessage: `📎 ${req.file.originalname}` });

        const sessionResult = await pool.query(
            'SELECT status, customer_name, user_contact FROM sessions WHERE session_id=$1 LIMIT 1',
            [sessionId],
        );
        const row = sessionResult.rows[0] as { status: string; customer_name: string; user_contact: string } | undefined;
        const isHuman = row?.status === 'human';

        io.emit('admin_alert', {
            sessionId, sender: 'user', content: `📎 ${req.file.originalname}`,
            userName: row?.customer_name || row?.user_contact || 'Customer',
            isHumanSession: isHuman, timestamp: new Date(),
        });

        if (isHuman) {
            await sendAdminPushNotification({
                heading: `New file from ${row?.customer_name || row?.user_contact || 'Customer'}`,
                content: `File received: ${req.file.originalname}`,
                url: getPublicAppUrl(),
            });
        }

        res.json({ success: true, fileUrl, fileName: req.file.originalname, fileType: req.file.mimetype, fileSize: req.file.size });
    } catch (err) { next(err); }
});

// ── Chat proxy ────────────────────────────────────────────────────────────────

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL ?? '';

app.post('/api/chat', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { action, sessionId, chatInput, metadata } = req.body as {
            action?: string; sessionId: string; chatInput: string; metadata?: Record<string, unknown>;
        };

        if (isHumanHandoffRequest(chatInput)) {
            const handoffMessage =
                'Thank you for reaching out! Our support team has been notified and will connect with you within 30 minutes. Please stay in the chat, and we\'ll be with you shortly! 🙋‍♂️';

            await pool.query("UPDATE sessions SET status='human', updated_at=NOW() WHERE session_id=$1", [sessionId]);
            await pool.query('INSERT INTO messages (session_id, sender, content) VALUES ($1,$2,$3)',
                [sessionId, 'ai', handoffMessage]);

            io.to(sessionId).emit('status_change', { sessionId, status: 'human' });
            io.emit('session_update', { sessionId, status: 'human' });
            io.emit('admin_alert', {
                sessionId, sender: 'user', content: '🔴 Customer requested human support!',
                isHumanSession: true, timestamp: new Date(),
            });
            io.to(sessionId).emit('new_message', { sessionId, sender: 'ai', content: handoffMessage, timestamp: new Date() });

            await sendAdminPushNotification({
                heading: 'Human support requested',
                content: 'A customer requested to chat with a human agent.',
                url: getPublicAppUrl(),
            });

            return void res.json({ output: handoffMessage, handoff: true, saved: true, status: 'human' });
        }

        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action || 'sendMessage', sessionId, client_id: metadata?.client_id, chatInput, metadata }),
        });

        if (!response.ok) {
            return void res.status(502).json({ error: 'AI service unavailable', status: response.status });
        }

        const responseText = await response.text();
        let actualMessage: string;
        let suggestions: unknown[] = [];

        const isStreaming = responseText.includes('"type":"item"') || responseText.includes('"type":"begin"');

        if (isStreaming) {
            let assembled = '';
            for (const line of responseText.split('\n').filter(Boolean)) {
                try {
                    const chunk = JSON.parse(line) as { type: string; content?: string };
                    if (chunk.type === 'item' && typeof chunk.content === 'string') assembled += chunk.content;
                } catch { /* skip */ }
            }
            try {
                const parsed = JSON.parse(assembled) as Record<string, unknown>;
                actualMessage = formatMessage(parsed.output ?? parsed.answer ?? parsed.response ?? assembled);
                suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
            } catch {
                actualMessage = formatMessage(assembled);
            }
        } else {
            let data: unknown;
            try { data = JSON.parse(responseText); } catch { data = responseText; }
            actualMessage = parseN8nResponse(data);
            const raw = Array.isArray(data) ? (data[0] as Record<string, unknown>)?.suggestions : (data as Record<string, unknown>)?.suggestions;
            suggestions = Array.isArray(raw) ? raw : [];
        }

        res.json({ output: actualMessage, suggestions });
    } catch (err) { next(err); }
});

// ── Product webhook ───────────────────────────────────────────────────────────

app.post('/webhook/products', async (req: Request, res: Response) => {
    try {
        const webhookSecret = process.env.PRODUCT_WEBHOOK_SECRET;
        if (webhookSecret) {
            const provided = (req.headers['x-webhook-secret'] as string | undefined) || (req.body as Record<string, string>).secret;
            if (provided !== webhookSecret) {
                return void res.status(401).json({ error: 'Unauthorized' });
            }
        }

        const body = req.body as ProductPayload | ProductPayload[] | { products?: ProductPayload[] };
        const products: ProductPayload[] = Array.isArray(body)
            ? body
            : 'products' in body && body.products
                ? body.products
                : [body as ProductPayload];

        if (!products.length || !products[0].id) {
            return void res.status(400).json({ error: 'Invalid product data' });
        }

        const client = await pool.connect();
        let inserted = 0;
        let updated = 0;

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
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                        $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        quantity=EXCLUDED.quantity, price=EXCLUDED.price,
                        original_price=EXCLUDED.original_price, discounted_price=EXCLUDED.discounted_price,
                        status=EXCLUDED.status, is_featured=EXCLUDED.is_featured,
                        average_rating=EXCLUDED.average_rating, image_url=EXCLUDED.image_url,
                        image_thumb=EXCLUDED.image_thumb, image_preview=EXCLUDED.image_preview,
                        images=EXCLUDED.images, reviews=EXCLUDED.reviews,
                        updated_at=EXCLUDED.updated_at, imported_at=CURRENT_TIMESTAMP
                    WHERE
                        products.quantity!=EXCLUDED.quantity OR products.price!=EXCLUDED.price OR
                        products.original_price!=EXCLUDED.original_price OR
                        products.discounted_price!=EXCLUDED.discounted_price OR
                        products.status!=EXCLUDED.status OR products.is_featured!=EXCLUDED.is_featured OR
                        products.average_rating!=EXCLUDED.average_rating OR products.updated_at!=EXCLUDED.updated_at
                    RETURNING (xmax=0) AS inserted`,
                    [
                        p.id, p.name, p.slug, p.sku, p.short_description, p.description,
                        p.price, p.original_price, p.discounted_price, p.quantity, p.unit, p.weight,
                        p.status, p.is_featured, p.highlights, p.product_video_url,
                        p.emi_enabled, p.pre_order, p.pre_order_price, p.warranty_description,
                        p.average_rating, p.image?.full ?? null, p.image?.thumb ?? null, p.image?.preview ?? null,
                        JSON.stringify(p.attributes ?? {}), JSON.stringify(p.variant_attributes ?? {}),
                        JSON.stringify(p.images ?? []), JSON.stringify(p.reviews ?? []),
                        p.created_at, p.updated_at,
                    ],
                );
                if ((result.rows[0] as { inserted?: boolean })?.inserted) inserted++; else updated++;
            }

            await client.query('COMMIT');
            logger.info(`Product webhook: ${inserted} inserted, ${updated} updated`);
            res.json({ success: true, inserted, updated, total: products.length });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        logger.error('Product webhook error:', err);
        res.status(500).json({ error: 'Failed to process product update' });
    }
});

// ── Messages ──────────────────────────────────────────────────────────────────

app.post('/api/messages', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const validated = MessageSchema.parse(req.body);
        const { sessionId, sender, content, metadata } = validated;

        const clientIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]
            ?? (req.socket?.remoteAddress ?? 'unknown');
        const enrichedMetadata = { ...metadata, ip_address: clientIp };

        await pool.query(
            `INSERT INTO sessions (session_id, status, metadata)
             VALUES ($1,'ai',$2)
             ON CONFLICT (session_id) DO UPDATE SET
                updated_at=NOW(), metadata=COALESCE(sessions.metadata,'{}')::jsonb || $2::jsonb`,
            [sessionId, JSON.stringify(enrichedMetadata)],
        );
        await pool.query('INSERT INTO messages (session_id, sender, content) VALUES ($1,$2,$3)',
            [sessionId, sender, content]);

        io.to(sessionId).emit('new_message', { sessionId, sender, content, timestamp: new Date() });
        io.emit('session_update', { sessionId, lastMessage: content });

        if (sender === 'user') {
            const sessionResult = await pool.query(
                'SELECT status, customer_name, user_contact FROM sessions WHERE session_id=$1 LIMIT 1',
                [sessionId],
            );
            const row = sessionResult.rows[0] as { status: string; customer_name: string; user_contact: string } | undefined;
            io.emit('admin_alert', {
                sessionId, sender: 'user', content,
                userName: row?.customer_name || row?.user_contact || 'Customer',
                isHumanSession: row?.status === 'human', timestamp: new Date(),
            });

            if (row?.status === 'human') {
                await sendAdminPushNotification({
                    heading: `Message from ${row.customer_name || row.user_contact || 'Customer'}`,
                    content: String(content).slice(0, 140) || 'You have a new message',
                    url: getPublicAppUrl(),
                });
            }
        }

        res.json({ success: true });
    } catch (err) { next(err); }
});

// ── Sessions ──────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await pool.query(`
            SELECT s.*,
                (SELECT content FROM messages WHERE session_id=s.session_id ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages WHERE session_id=s.session_id ORDER BY created_at DESC LIMIT 1) as last_message_at
            FROM sessions s
            ORDER BY last_message_at DESC NULLS LAST
        `);
        res.json(result.rows);
    } catch (err) { next(err); }
});

app.get('/api/sessions/by-contact/:contact', async (req: Request, res: Response, next: NextFunction) => {
    const { contact } = req.params;
    try {
        const result = await pool.query(
            `SELECT s.session_id, s.customer_name, s.user_contact, s.status, s.created_at, s.updated_at,
                    (SELECT content FROM messages m WHERE m.session_id=s.session_id ORDER BY m.created_at ASC LIMIT 1) AS first_message,
                    (SELECT created_at FROM messages m WHERE m.session_id=s.session_id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
             FROM sessions s WHERE s.user_contact=$1 ORDER BY s.updated_at DESC`,
            [contact],
        );
        if (result.rows.length === 0) return void res.json({ found: false, sessions: [] });
        res.json({ found: true, sessions: result.rows, session: result.rows[0] });
    } catch (err) { next(err); }
});

app.get('/api/sessions/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId } = req.params;
    try {
        const result = await pool.query('SELECT * FROM sessions WHERE session_id=$1', [sessionId]);
        if (result.rows.length === 0) return void res.status(404).json({ error: 'Session not found' });
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

app.get('/api/sessions/:sessionId/messages', async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM messages WHERE session_id=$1 ORDER BY created_at ASC', [sessionId]);
        res.json(result.rows);
    } catch (err) { next(err); }
});

app.put('/api/sessions/:sessionId/status', async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId } = req.params;
    const { status } = req.body as { status?: string };
    if (!status || !['ai', 'human'].includes(status)) {
        return void res.status(400).json({ error: 'Invalid status. Must be: ai or human' });
    }
    try {
        await pool.query('UPDATE sessions SET status=$1, updated_at=NOW() WHERE session_id=$2', [status, sessionId]);
        io.to(sessionId).emit('status_change', { sessionId, status });
        res.json({ success: true });
    } catch (err) { next(err); }
});

app.put('/api/sessions/:sessionId/user-info', async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId } = req.params;
    const { contact, email, phone } = req.body as { contact?: string; email?: string; phone?: string };
    try {
        await pool.query(
            `INSERT INTO sessions (session_id, customer_name, status, user_contact, metadata)
             VALUES ($1,$2,'ai',$2,$3)
             ON CONFLICT (session_id) DO UPDATE SET
                updated_at=NOW(), customer_name=$2, user_contact=$2,
                metadata=COALESCE(sessions.metadata,'{}')::jsonb || $3::jsonb`,
            [sessionId, contact, JSON.stringify({ user_contact: contact, user_email: email, user_phone: phone })],
        );
        res.json({ success: true });
    } catch (err) { next(err); }
});

app.put('/api/sessions/:sessionId/deactivate', async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId } = req.params;
    try {
        await pool.query('UPDATE sessions SET is_active=false WHERE session_id=$1', [sessionId]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

app.post('/api/sessions/new', async (req: Request, res: Response, next: NextFunction) => {
    const { contact, customerName } = req.body as { contact?: string; customerName?: string };
    if (!contact) return void res.status(400).json({ error: 'contact is required' });
    try {
        const newSessionId = 'sess_' + Math.random().toString(36).substr(2, 9);
        await pool.query(
            `INSERT INTO sessions (session_id, user_contact, customer_name, status, is_active)
             VALUES ($1,$2,$3,'ai',true)`,
            [newSessionId, contact, customerName || contact],
        );
        res.json({ success: true, session_id: newSessionId });
    } catch (err) { next(err); }
});

// ── Users / Auth ──────────────────────────────────────────────────────────────

// POST /api/users/login — customer/user login
app.post('/api/users/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, phone, name, sessionId } = req.body as {
            email?: string; phone?: string; name?: string; sessionId?: string;
        };
        if (!email && !phone) return void res.status(400).json({ error: 'Email or phone is required' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const userResult = email
                ? await client.query('SELECT * FROM users WHERE email=$1', [email])
                : await client.query('SELECT * FROM users WHERE phone=$1', [phone]);

            let user = userResult.rows[0] as Record<string, unknown> | undefined;

            if (user) {
                await client.query(
                    `UPDATE users SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email), last_login_at=NOW() WHERE id=$4`,
                    [name, phone, email, user.id],
                );
            } else {
                const inserted = await client.query(
                    `INSERT INTO users (email, phone, name, last_login_at) VALUES ($1,$2,$3,NOW()) RETURNING *`,
                    [email, phone, name],
                );
                user = inserted.rows[0] as Record<string, unknown>;
            }

            if (sessionId) {
                await client.query(
                    `UPDATE sessions SET user_id=$1, user_email=$2, user_phone=$3, customer_name=$4 WHERE session_id=$5`,
                    [user.id, email, phone, name || user.name, sessionId],
                );
            }

            await client.query('COMMIT');
            res.json({ success: true, user: { id: user.id, email: user.email, phone: user.phone, name: user.name } });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) { next(err); }
});

app.get('/api/users/:userId', async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    try {
        const result = await pool.query(
            'SELECT id,email,phone,name,created_at,last_login_at FROM users WHERE id=$1', [userId]);
        if (result.rows.length === 0) return void res.status(404).json({ error: 'User not found' });
        res.json(result.rows[0]);
    } catch (err) { next(err); }
});

app.post('/api/users/find', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, phone } = req.body as { email?: string; phone?: string };
        if (!email && !phone) return void res.status(400).json({ error: 'Email or phone is required' });

        const result = email
            ? await pool.query('SELECT id,email,phone,name,created_at,last_login_at FROM users WHERE email=$1', [email])
            : await pool.query('SELECT id,email,phone,name,created_at,last_login_at FROM users WHERE phone=$1', [phone]);

        if (result.rows.length === 0) return void res.json({ found: false });
        res.json({ found: true, user: result.rows[0] });
    } catch (err) { next(err); }
});

app.get('/api/users/:userId/sessions', async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    const { active_only } = req.query;
    try {
        let query = `
            SELECT s.*,
                (SELECT content FROM messages WHERE session_id=s.session_id ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages WHERE session_id=s.session_id ORDER BY created_at DESC LIMIT 1) as last_message_at,
                (SELECT COUNT(*) FROM messages WHERE session_id=s.session_id) as message_count
            FROM sessions s WHERE s.user_id=$1`;
        if (active_only === 'true') query += ' AND s.is_active=true';
        query += ' ORDER BY s.updated_at DESC';
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (err) { next(err); }
});

app.post('/api/users/:userId/sessions', async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = req.params;
    const { sessionId } = req.body as { sessionId?: string };
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE id=$1', [userId]);
        if (userResult.rows.length === 0) return void res.status(404).json({ error: 'User not found' });

        const user = userResult.rows[0] as Record<string, unknown>;
        const newSessionId = sessionId || 'sess_' + Math.random().toString(36).substr(2, 9);

        await pool.query('UPDATE sessions SET is_active=false WHERE user_id=$1', [userId]);
        await pool.query(
            `INSERT INTO sessions (session_id, user_id, user_email, user_phone, customer_name, status, is_active)
             VALUES ($1,$2,$3,$4,$5,'ai',true)`,
            [newSessionId, user.id, user.email, user.phone, user.name],
        );

        res.json({ success: true, sessionId: newSessionId });
    } catch (err) { next(err); }
});

// ── Analytics ─────────────────────────────────────────────────────────────────

app.get('/api/analytics', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const [totalSessions, totalUsers, totalMessages, activeSessions, sessionsByStatus,
               messagesPerDay, avgMsgs, peakHours, avgResponseTime, messagesBySender] = await Promise.all([
            pool.query('SELECT COUNT(*) as count FROM sessions'),
            pool.query("SELECT COUNT(DISTINCT user_contact) as count FROM sessions WHERE user_contact IS NOT NULL"),
            pool.query('SELECT COUNT(*) as count FROM messages'),
            pool.query("SELECT COUNT(DISTINCT session_id) as count FROM messages WHERE created_at > NOW()-INTERVAL '24 hours'"),
            pool.query("SELECT status, COUNT(*) as count FROM sessions GROUP BY status"),
            pool.query("SELECT DATE(created_at) as date, COUNT(*) as count FROM messages WHERE created_at > NOW()-INTERVAL '7 days' GROUP BY DATE(created_at) ORDER BY date DESC"),
            pool.query("SELECT AVG(msg_count)::numeric(10,2) as avg FROM (SELECT session_id, COUNT(*) as msg_count FROM messages GROUP BY session_id) as subq"),
            pool.query("SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count FROM messages GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY count DESC LIMIT 5"),
            pool.query(`
                WITH user_messages AS (
                    SELECT session_id, created_at as user_time, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) as rn
                    FROM messages WHERE sender='user'
                ), responses AS (
                    SELECT session_id, created_at as response_time, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) as rn
                    FROM messages WHERE sender IN ('admin','ai')
                )
                SELECT AVG(EXTRACT(EPOCH FROM (r.response_time-u.user_time)))::numeric(10,2) as avg_seconds
                FROM user_messages u JOIN responses r ON u.session_id=r.session_id AND r.rn=u.rn
                WHERE r.response_time > u.user_time`),
            pool.query("SELECT sender, COUNT(*) as count FROM messages GROUP BY sender ORDER BY count DESC"),
        ]);

        res.json({
            totalSessions: parseInt(totalSessions.rows[0].count),
            totalUsers: parseInt(totalUsers.rows[0].count),
            totalMessages: parseInt(totalMessages.rows[0].count),
            activeSessions24h: parseInt(activeSessions.rows[0].count),
            messagesBySender: messagesBySender.rows,
            sessionsByStatus: sessionsByStatus.rows,
            messagesPerDay: messagesPerDay.rows,
            avgMessagesPerSession: parseFloat(avgMsgs.rows[0]?.avg || 0),
            peakHours: peakHours.rows,
            avgResponseTimeSeconds: parseFloat(avgResponseTime.rows[0]?.avg_seconds || 0),
        });
    } catch (err) { next(err); }
});

app.get('/api/analytics/top-queries', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = parseInt((req.query.limit as string | undefined) ?? '20');
        const result = await pool.query(
            "SELECT content, created_at, session_id FROM messages WHERE sender='user' ORDER BY created_at DESC LIMIT 100");

        const queryCounts: Record<string, number> = {};
        for (const row of result.rows as { content: string }[]) {
            const content = row.content.toLowerCase().trim();
            if (content.length > 5) queryCounts[content] = (queryCounts[content] ?? 0) + 1;
        }

        const topQueries = Object.entries(queryCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit)
            .map(([query, count]) => ({ query, count }));

        res.json({ topQueries, totalUserMessages: result.rows.length });
    } catch (err) { next(err); }
});

// ── AI Session Summary ────────────────────────────────────────────────────────

app.get('/api/sessions/:sessionId/summary', async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId } = req.params;
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('sk-your')) {
        return void res.status(503).json({ error: 'OpenAI API key not configured.' });
    }
    try {
        const [messagesResult, sessionResult] = await Promise.all([
            pool.query('SELECT * FROM messages WHERE session_id=$1 ORDER BY created_at ASC', [sessionId]),
            pool.query('SELECT * FROM sessions WHERE session_id=$1', [sessionId]),
        ]);

        if (sessionResult.rows.length === 0) return void res.status(404).json({ error: 'Session not found' });

        const messages = messagesResult.rows as { sender: string; content: string; created_at: string }[];
        if (messages.length === 0) {
            return void res.json({
                sessionId, summary: 'No messages yet.', sentiment: 'neutral', topics: [], intent: 'unknown', resolved: 'unclear',
                stats: { totalMessages: 0, userMessages: 0, aiMessages: 0, adminMessages: 0, sessionDurationSeconds: 0 },
            });
        }

        const conversationText = messages.map((m) => `${m.sender.toUpperCase()}: ${m.content}`).join('\n');
        const firstMsg = new Date(messages[0].created_at);
        const lastMsg = new Date(messages[messages.length - 1].created_at);
        const sessionDuration = Math.round((lastMsg.getTime() - firstMsg.getTime()) / 1000);

        const gptResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: `Analyze this customer support conversation. Return JSON with: "summary" (2-3 sentences), "sentiment" (positive/neutral/negative), "topics" (array of max 5 phrases), "intent" (one sentence), "resolved" (true/false/"unclear"), "highlights" (array of max 3 notable quotes).`,
                },
                { role: 'user', content: conversationText },
            ],
        });

        let gptAnalysis: Record<string, unknown>;
        try {
            gptAnalysis = JSON.parse(gptResponse.choices[0].message.content ?? '{}');
        } catch {
            gptAnalysis = { summary: gptResponse.choices[0].message.content, sentiment: 'neutral', topics: [], intent: 'unknown', resolved: 'unclear', highlights: [] };
        }

        await pool.query('UPDATE sessions SET summary=$1, updated_at=NOW() WHERE session_id=$2',
            [gptAnalysis.summary, sessionId]);

        const session = sessionResult.rows[0] as Record<string, unknown>;
        res.json({
            sessionId, status: session.status, customerName: session.customer_name,
            metadata: session.metadata, createdAt: session.created_at, updatedAt: session.updated_at,
            ...gptAnalysis,
            stats: {
                totalMessages: messages.length,
                userMessages: messages.filter((m) => m.sender === 'user').length,
                aiMessages: messages.filter((m) => m.sender === 'ai').length,
                adminMessages: messages.filter((m) => m.sender === 'admin').length,
                sessionDurationSeconds: sessionDuration,
            },
            tokensUsed: gptResponse.usage?.total_tokens ?? 0,
        });
    } catch (err) { next(err); }
});

// ── Workspace / SaaS Auth ────────────────────────────────────────────────────

async function ensureAuthSchema(): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS workspaces (
            id          SERIAL PRIMARY KEY,
            name        TEXT NOT NULL,
            slug        TEXT UNIQUE NOT NULL,
            plan        TEXT NOT NULL DEFAULT 'free',
            created_at  TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS workspace_members (
            id           SERIAL PRIMARY KEY,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            email        TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            name         TEXT NOT NULL,
            role         TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('owner','admin','agent')),
            avatar_url   TEXT,
            is_active    BOOLEAN DEFAULT TRUE,
            created_at   TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (workspace_id, email)
        );
        CREATE INDEX IF NOT EXISTS idx_workspace_members_email ON workspace_members(email);
    `);
}

// POST /api/auth/register — create workspace + owner account
app.post('/api/auth/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { workspaceName, email, password, name } = req.body as {
            workspaceName?: string; email?: string; password?: string; name?: string;
        };
        if (!workspaceName || !email || !password || !name) {
            return void res.status(400).json({ error: 'workspaceName, email, password, and name are required' });
        }
        if (password.length < 8) return void res.status(400).json({ error: 'Password must be at least 8 characters' });

        const slug = workspaceName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40) + '-' + Date.now().toString(36);
        const passwordHash = await bcrypt.hash(password, 12);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const existing = await client.query('SELECT id FROM workspace_members WHERE email=$1', [email]);
            if (existing.rows.length > 0) {
                await client.query('ROLLBACK');
                return void res.status(409).json({ error: 'An account with this email already exists' });
            }

            const ws = await client.query(
                `INSERT INTO workspaces (name, slug) VALUES ($1, $2) RETURNING id, name, slug`,
                [workspaceName, slug],
            );
            const workspace = ws.rows[0] as { id: number; name: string; slug: string };

            const memberRes = await client.query(
                `INSERT INTO workspace_members (workspace_id, email, password_hash, name, role)
                 VALUES ($1, $2, $3, $4, 'owner') RETURNING id, email, name, role`,
                [workspace.id, email, passwordHash, name],
            );
            const member = memberRes.rows[0] as { id: number; email: string; name: string; role: 'owner' };

            await client.query('COMMIT');

            const token = signToken({ userId: member.id, email: member.email, role: member.role, workspaceId: workspace.id });
            res.status(201).json({ token, user: { id: member.id, email: member.email, name: member.name, role: member.role }, workspace });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) { next(err); }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body as { email?: string; password?: string };
        if (!email || !password) return void res.status(400).json({ error: 'email and password are required' });

        const result = await pool.query(
            `SELECT m.id, m.email, m.name, m.role, m.password_hash, m.workspace_id,
                    w.name AS workspace_name, w.slug AS workspace_slug, w.plan
             FROM workspace_members m
             JOIN workspaces w ON w.id = m.workspace_id
             WHERE m.email = $1 AND m.is_active = TRUE`,
            [email],
        );

        if (result.rows.length === 0) return void res.status(401).json({ error: 'Invalid email or password' });

        const row = result.rows[0] as {
            id: number; email: string; name: string; role: 'owner' | 'admin' | 'agent';
            password_hash: string; workspace_id: number; workspace_name: string; workspace_slug: string; plan: string;
        };

        const valid = await bcrypt.compare(password, row.password_hash);
        if (!valid) return void res.status(401).json({ error: 'Invalid email or password' });

        const token = signToken({ userId: row.id, email: row.email, role: row.role, workspaceId: row.workspace_id });
        res.json({
            token,
            user: { id: row.id, email: row.email, name: row.name, role: row.role },
            workspace: { id: row.workspace_id, name: row.workspace_name, slug: row.workspace_slug, plan: row.plan },
        });
    } catch (err) { next(err); }
});

// GET /api/auth/me — verify token and return user
app.get('/api/auth/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await pool.query(
            `SELECT m.id, m.email, m.name, m.role, m.avatar_url, m.workspace_id,
                    w.name AS workspace_name, w.slug AS workspace_slug, w.plan
             FROM workspace_members m
             JOIN workspaces w ON w.id = m.workspace_id
             WHERE m.id = $1`,
            [req.auth!.userId],
        );
        if (result.rows.length === 0) return void res.status(404).json({ error: 'User not found' });
        const row = result.rows[0] as Record<string, unknown>;
        res.json({
            user: { id: row.id, email: row.email, name: row.name, role: row.role, avatarUrl: row.avatar_url },
            workspace: { id: row.workspace_id, name: row.workspace_name, slug: row.workspace_slug, plan: row.plan },
        });
    } catch (err) { next(err); }
});

// GET /api/workspace/members — list team
app.get('/api/workspace/members', requireAuth, requireRole('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await pool.query(
            `SELECT id, email, name, role, avatar_url, is_active, created_at
             FROM workspace_members WHERE workspace_id=$1 ORDER BY created_at ASC`,
            [req.auth!.workspaceId],
        );
        res.json(result.rows);
    } catch (err) { next(err); }
});

// POST /api/workspace/members — invite team member
app.post('/api/workspace/members', requireAuth, requireRole('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, name, role = 'agent', password } = req.body as { email?: string; name?: string; role?: string; password?: string };
        if (!email || !name || !password) return void res.status(400).json({ error: 'email, name, and password are required' });
        if (!['admin', 'agent'].includes(role)) return void res.status(400).json({ error: 'role must be admin or agent' });

        const passwordHash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `INSERT INTO workspace_members (workspace_id, email, password_hash, name, role)
             VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role, created_at`,
            [req.auth!.workspaceId, email, passwordHash, name, role],
        );
        res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ZodError') {
        return void res.status(400).json({ error: 'Validation failed', details: (err as unknown as { errors: unknown }).errors });
    }
    logger.error('Unhandled Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.on('join_session', (sessionId: string) => {
        if (!sessionId) return;
        socket.join(sessionId);
    });

    socket.on('leave_session', (sessionId: string) => {
        if (!sessionId) return;
        socket.leave(sessionId);
    });

    socket.on('send_manual_message', async (data: unknown) => {
        try {
            const validated = MessageSchema.parse({ ...(data as object), sender: 'admin' });
            const { sessionId, content } = validated;

            await pool.query('INSERT INTO messages (session_id, sender, content) VALUES ($1,$2,$3)',
                [sessionId, 'admin', content]);
            io.to(sessionId).emit('new_message', { sessionId, sender: 'admin', content, timestamp: new Date() });
            await pool.query("UPDATE sessions SET status='human', updated_at=NOW() WHERE session_id=$1", [sessionId]);

            const sessionResult = await pool.query('SELECT user_contact FROM sessions WHERE session_id=$1 LIMIT 1', [sessionId]);
            const userContact = (sessionResult.rows[0] as { user_contact?: string } | undefined)?.user_contact ?? null;

            if (userContact) {
                await sendWebPushNotifications({
                    title: 'New support reply',
                    body: content.length > 120 ? `${content.slice(0, 117)}...` : content,
                    url: getPublicAppUrl(),
                    role: 'user',
                    userContact,
                });
            }

            io.to(sessionId).emit('status_change', { sessionId, status: 'human' });
        } catch (err) {
            logger.error('Error sending manual message:', err);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    socket.on('disconnect', () => logger.info(`Client disconnected: ${socket.id}`));
});

// ── Boot ──────────────────────────────────────────────────────────────────────

ensurePushSubscriptionSchema();
ensureAuthSchema().catch((err) => logger.error('Failed to ensure auth schema:', err));

const PORT = parseInt(process.env.API_PORT ?? '3001');
httpServer.listen(PORT, () => logger.info(`API Server running on port ${PORT}`));

process.on('SIGTERM', () => {
    logger.info('SIGTERM received — shutting down');
    httpServer.close(() => {
        pool.end(() => process.exit(0));
    });
});
