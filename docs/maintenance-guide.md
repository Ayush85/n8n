# Maintenance Guide

## Codebase Complexity Reduction Rules

Use these as team standards to keep complexity under control.

1. Keep route handlers small.
- Move heavy logic to helper/service modules.
- Keep each endpoint focused on request parsing + response shaping.

2. Keep schema and code in sync.
- Any new DB field used in API must be added to `schema.sql` and `api/migrate-supabase.js`.

3. Make features optional behind env vars.
- OpenAI, product webhook security, and cloud upload credentials should degrade gracefully.

4. Avoid duplicate business logic.
- Shared logic (session creation, metadata merge, response parsing) should live in helper functions.

5. Validate input at boundaries.
- Continue using Zod schemas for request validation.

## Recommended Refactor Backlog (Safe incremental)

1. Split `api/src/index.js` into modules:
- `routes/chat.js`
- `routes/sessions.js`
- `routes/analytics.js`
- `routes/reports.js`
- `routes/products.js`
- `routes/users.js`

2. Extract shared services:
- `services/sessionService.js`
- `services/fileUploadService.js`
- `services/reportService.js`
- `services/n8nService.js`

3. Add test baseline:
- API route smoke tests
- analytics query tests
- upload validation tests

4. Add lint + formatting commands in both `api` and `dashboard`.

## Runbook: Common Issues

### API restart fails
- Check logs: `Docker compose logs --tail=100 api`
- Validate env vars in root `.env`
- Verify DB connectivity with `api/test-db-connection.js`

### Upload returns 500
- Confirm `DO_SPACES_KEY` and `DO_SPACES_SECRET`
- Confirm `DO_SPACES_BUCKET`, `DO_SPACES_REGION`, `DO_SPACES_ENDPOINT`
- Check API logs for AWS S3 client errors

### Dashboard not updating realtime
- Verify API reachable at `VITE_API_URL`
- Confirm Socket.IO connection from browser network tab
- Check if session room join is firing in widget/dashboard

### Session continuity not working
- Ensure `user_contact` is populated via `/api/sessions/:sessionId/user-info`
- Verify `/api/sessions/by-contact/:contact` returns `sessions` list

## Backup and Recovery Basics

1. Backup DB (scheduled dump from Supabase/Postgres).
2. Keep `.env` secrets in a secure vault.
3. Keep Docker image tags for rollback.
4. Keep `chatbot_workflow.json` versioned to restore n8n logic.
