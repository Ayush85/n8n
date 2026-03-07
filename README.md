# n8n Chat Support Platform

Real-time customer chat platform with:

- embeddable website widget
- backend API + Socket.IO realtime server
- admin dashboard
- analytics and GPT-powered reporting
- file uploads to DigitalOcean Spaces

## Documentation Index

- Architecture and system diagrams: `docs/architecture.md`
- API endpoints and contracts: `docs/api-reference.md`
- Deployment choices (1 vs 2 services): `docs/deployment-options.md`
- Maintenance and cleanup guide: `docs/maintenance-guide.md`

## Quick Start (Docker)

1. Ensure Docker Desktop is running.
2. Configure root `.env` values (DB, n8n webhook, optional OpenAI/Spaces keys).
3. Start services:

```bash
docker compose up -d --build
```

4. Verify:

```bash
docker compose ps
```

5. Open:

- Dashboard: `http://localhost:8080`
- API health: `http://localhost:3001/health`
- n8n (if running separately): `http://localhost:5678`

## Manual Development

### API

```bash
cd api
npm install
npm run dev
```

### Dashboard

```bash
cd dashboard
npm install
npm run dev
```

### Database bootstrap

Use either:

- `schema.sql` (base schema), or
- `api/migrate-supabase.js` (idempotent migration script)

## Widget Embed

```html
<script src="http://localhost:3001/widget/chat-widget.js"></script>
```

In production, replace the host with your API domain.

## Test a Message Quickly

PowerShell:

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/messages" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"sessionId":"test-session-123","sender":"user","content":"Hello, I need help!"}'
```

## Two Services: Is It Necessary?

Not strictly necessary, but recommended for this project.

- Keep two services for cleaner separation, easier scaling, and safer deployments.
- If you want one service only, see `docs/deployment-options.md` for merge options and trade-offs.
