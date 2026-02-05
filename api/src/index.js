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

// API endpoint for external inputs (n8n or direct widget)
app.post('/api/messages', async (req, res, next) => {
    try {
        const validatedData = MessageSchema.parse(req.body);
        const { sessionId, sender, content } = validatedData;

        // 1. Save to database
        await pool.query(
            'INSERT INTO messages (session_id, sender, content) VALUES ($1, $2, $3)',
            [sessionId, sender, content]
        );

        // 2. Ensure session exists
        await pool.query(
            'INSERT INTO sessions (session_id, status) VALUES ($1, $2) ON CONFLICT (session_id) DO UPDATE SET updated_at = NOW()',
            [sessionId, 'human'] // Defaulting to human as requested
        );

        // 3. Emit to socket room for this session
        io.to(sessionId).emit('new_message', {
            sessionId,
            sender,
            content,
            timestamp: new Date()
        });

        // 4. Update dashbord lists
        io.emit('session_update', { sessionId, lastMessage: content });

        logger.info(`Message received for session ${sessionId} from ${sender}`);
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
