# API Reference

Base URL examples:
- Local Docker: `http://localhost:3001`
- Production: your API domain

## Health

### `GET /health`
Returns API liveness.

Response:
```json
{ "status": "ok", "timestamp": "2026-03-07T00:00:00.000Z" }
```

## Chat + Realtime

### `POST /api/chat`
Proxy chat request to n8n and return normalized output.

Body:
```json
{
  "action": "sendMessage",
  "sessionId": "sess_abc123",
  "chatInput": "Hello",
  "metadata": {
    "client_id": "client_1",
    "site_name": "Fatafat Sewa"
  }
}
```

Notes:
- If handoff intent is detected, session is switched to `human` and a handoff response is returned.

### `POST /api/messages`
Insert a message directly (user/admin/ai), ensure session exists, emit realtime updates.

Body:
```json
{
  "sessionId": "sess_abc123",
  "sender": "user",
  "content": "Need help with EMI",
  "metadata": { "site_name": "Fatafat Sewa" }
}
```

### Socket.IO events
- Client emits:
  - `join_session` (`sessionId`)
  - `leave_session` (`sessionId`)
  - `send_manual_message` (`{ sessionId, content }`)
- Server emits:
  - `new_message`
  - `session_update`
  - `status_change`

## File Upload

### `POST /api/upload`
Multipart upload endpoint for images/documents.

Form fields:
- `file`: binary file
- `sessionId`: session identifier

Response:
```json
{
  "success": true,
  "fileUrl": "https://bucket.region.digitaloceanspaces.com/path/file.png",
  "fileName": "screenshot.png",
  "fileType": "image/png",
  "fileSize": 12345
}
```

## Sessions

### `GET /api/sessions`
List all sessions with `last_message` and `last_message_at`.

### `GET /api/sessions/:sessionId`
Get single session.

### `GET /api/sessions/:sessionId/messages`
Get ordered message history for a session.

### `PUT /api/sessions/:sessionId/status`
Update session status (`ai` or `human`).

Body:
```json
{ "status": "human" }
```

### `PUT /api/sessions/:sessionId/user-info`
Attach contact details to session.

Body:
```json
{
  "contact": "user@example.com",
  "email": "user@example.com",
  "phone": null
}
```

### `GET /api/sessions/by-contact/:contact`
Find all sessions for one contact.

Response:
```json
{
  "found": true,
  "sessions": [ ... ],
  "session": { ...most recent... }
}
```

## Users

### `POST /api/auth/login`
Create or update user, optionally link a session.

### `GET /api/users/:userId`
Get user profile.

### `POST /api/users/find`
Find user by email or phone.

### `GET /api/users/:userId/sessions`
Get sessions for a user. Query: `active_only=true|false`.

### `POST /api/users/:userId/sessions`
Create a new session for user and deactivate prior active ones.

### `PUT /api/sessions/:sessionId/deactivate`
Mark a session inactive.

## Analytics

### `GET /api/analytics`
Returns:
- total sessions/messages
- active sessions (24h)
- messages by sender
- sessions by status
- messages per day (7d)
- avg messages per session
- peak hours
- avg response time

### `GET /api/analytics/top-queries?limit=10`
Returns top user queries from recent messages.

## GPT Reports

### `GET /api/sessions/:sessionId/summary`
GPT-generated per-session summary and insights.

### `POST /api/reports/chat`
Batch GPT report across multiple sessions.

Body (optional filters):
```json
{
  "startDate": "2026-03-01",
  "endDate": "2026-03-07",
  "status": "ai",
  "limit": 20
}
```

## Product Sync

### `POST /webhook/products`
Insert/update product catalog rows from upstream webhook.

Optional security:
- Header `x-webhook-secret` (if `PRODUCT_WEBHOOK_SECRET` configured)

## Error Format

Typical response:
```json
{ "error": "Internal server error" }
```

Validation errors (Zod):
```json
{ "error": "Validation failed", "details": [...] }
```
