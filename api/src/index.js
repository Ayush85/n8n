import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pg from 'pg';
import OpenAI from 'openai';
import logger from './config/logger.js';
import { MessageSchema } from './schemas/chat.js';
import { meta } from 'zod/v4/core';

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
        origin: "*",
        methods: ["GET", "POST"]
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
    // Supabase pooler configuration
    max: 10, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
    allowExitOnIdle: false, // Don't allow the pool to exit when all clients are idle
    // Keepalive settings to prevent connection drops
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
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
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

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

        logger.info(`Proxying chat request to n8n for session ${sessionId}`);

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

        // Try to parse as JSON, otherwise return as text
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            data = responseText;
        }

        // Parse the n8n response to extract the actual message
        const actualMessage = parseN8nResponse(data);

        logger.info(`Parsed message from n8n:`, actualMessage);

        // Return in a consistent format
        res.json({ output: actualMessage });
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

// Find existing session by contact (for session continuity)
app.get('/api/sessions/by-contact/:contact', async (req, res, next) => {
    const { contact } = req.params;
    try {
        const result = await pool.query(
            `SELECT session_id, customer_name, user_contact, status, created_at, updated_at
             FROM sessions 
             WHERE user_contact = $1 
             ORDER BY updated_at DESC 
             LIMIT 1`,
            [contact]
        );

        if (result.rows.length === 0) {
            logger.info(`No existing session found for contact: ${contact}`);
            return res.json({ found: false });
        }

        logger.info(`Found existing session for contact ${contact}: ${result.rows[0].session_id}`);
        res.json({ found: true, session: result.rows[0] });
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
