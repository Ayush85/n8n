import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pg from 'pg';
import logger from './config/logger.js';
import { MessageSchema } from './schemas/chat.js';

const { Pool } = pg;

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Serve widget files
app.use('/widget', express.static('widget'));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Database setup
const pool = new Pool({
    user: process.env.DB_USER || 'n8n',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'n8n_data',
    password: process.env.DB_PASSWORD || 'n8n_password',
    port: parseInt(process.env.DB_PORT || '5432'),
    ssl: process.env.DB_HOST && !process.env.DB_HOST.includes('localhost') ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
    logger.info('Connected to the database');
});

pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', err);
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// N8N Webhook URL (from environment or default)
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.aydexis.com/webhook/b5ecaafa-5b1f-483f-b03e-4275a31bdb0a/chat';

// Proxy endpoint for n8n AI chat (avoids CORS issues)
app.post('/api/chat', async (req, res, next) => {
    try {
        const { action, sessionId, chatInput, metadata } = req.body;

        logger.info(`Proxying chat request to n8n for session ${sessionId}`);

        // Forward request to n8n webhook
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: action || 'sendMessage',
                sessionId,
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

        // Try to parse as JSON, otherwise return as text
        try {
            const data = JSON.parse(responseText);
            res.json(data);
        } catch (e) {
            res.json({ output: responseText });
        }
    } catch (error) {
        logger.error('Error proxying to n8n:', error);
        next(error);
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

        // 1. Save message to database
        await pool.query(
            'INSERT INTO messages (session_id, sender, content) VALUES ($1, $2, $3)',
            [sessionId, sender, content]
        );

        // 2. Ensure session exists and update metadata
        await pool.query(
            `INSERT INTO sessions (session_id, status, metadata) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (session_id) DO UPDATE SET 
                updated_at = NOW(),
                metadata = COALESCE(sessions.metadata, '{}')::jsonb || $3::jsonb`,
            [sessionId, 'human', JSON.stringify(enrichedMetadata)]
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
