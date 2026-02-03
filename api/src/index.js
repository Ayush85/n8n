import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

const app = express();
app.use(cors());
app.use(express.json());

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
    port: process.env.DB_PORT || 5432,
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// API endpoint for n8n to push new messages
app.post('/api/messages', async (req, res) => {
    const { sessionId, sender, content } = req.body;

    try {
        // Emit to socket room for this session
        io.to(sessionId).emit('new_message', {
            sessionId,
            sender,
            content,
            timestamp: new Date()
        });

        // Also emit to a general 'admin' channel for session listing updates
        io.emit('session_update', { sessionId, lastMessage: content });

        res.json({ success: true });
    } catch (error) {
        console.error('Error handling n8n message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get sessions for dashboard
app.get('/api/sessions', async (req, res) => {
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
        console.error('Error fetching sessions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get messages for a session
app.get('/api/sessions/:sessionId/messages', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
            [sessionId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Socket.io logic
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_session', (sessionId) => {
        socket.join(sessionId);
        console.log(`Client ${socket.id} joined session: ${sessionId}`);
    });

    socket.on('send_manual_message', async (data) => {
        const { sessionId, content } = data;
        try {
            // 1. Log to database
            await pool.query(
                'INSERT INTO messages (session_id, sender, content) VALUES ($1, $2, $3)',
                [sessionId, 'admin', content]
            );

            // 2. Broadcast to others in the room (e.g. other dashboard tabs)
            socket.to(sessionId).emit('new_message', {
                sessionId,
                sender: 'admin',
                content,
                timestamp: new Date()
            });

            // 3. Update session status if needed
            await pool.query(
                "UPDATE sessions SET status = 'human', updated_at = NOW() WHERE session_id = $1",
                [sessionId]
            );

            console.log(`Manual message sent to ${sessionId}`);
        } catch (error) {
            console.error('Error sending manual message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.API_PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
});
