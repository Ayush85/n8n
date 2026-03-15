# Deployment and Service Options

## Current Setup (Recommended for your project)

You currently run:

1. `api` container (Express + Socket.IO + widget static)
2. `dashboard` container (Nginx serving built React app)

This is a standard split and is usually the right choice.

## Is Two Servers Necessary?

Short answer: not strictly necessary, but practical and cleaner.

### Keep two services when:
- You need independent deploy/restart of UI vs API.
- You want separate scaling (more API replicas than dashboard).
- You want clear separation of concerns.

### Move to one service when:
- You want simplest operations for very small traffic.
- You are okay with coupling frontend + backend deploy cycle.

## Option A: Keep Current (Best balance)

Pros:
- Better maintainability
- Safer changes
- Easier troubleshooting

Cons:
- Two containers to monitor

## Option B: Single Node Service (merge dashboard static into API)

Approach:
1. Build dashboard assets (`dashboard/dist`).
2. Copy assets into API image.
3. Serve static assets from Express (`app.use(express.static(...))`).
4. Keep one container exposing one port.

Pros:
- One container, one process boundary

Cons:
- Tighter coupling
- API restart affects dashboard availability
- Harder independent scaling

## Option C: Single Public Domain via Reverse Proxy (best UX, still two services)

Keep two containers internally, expose one domain:
- `/` -> dashboard
- `/api` and `/socket.io` -> API

Pros:
- One public entry point
- Keeps clean architecture

Cons:
- Needs Nginx/Caddy proxy config

## Environment Variables

### Required for API
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `N8N_WEBHOOK_URL`

### Optional/feature flags
- `OPENAI_API_KEY`
- `CORS_ORIGIN`
- `DO_SPACES_KEY`
- `DO_SPACES_SECRET`
- `DO_SPACES_ENDPOINT`
- `DO_SPACES_BUCKET`
- `DO_SPACES_REGION`
- `DO_SPACES_FOLDER`
- `PRODUCT_WEBHOOK_SECRET`

### Dashboard
- `VITE_API_URL`
- `VITE_ADMIN_SECRET` (if used for admin auth headers)

## Operational Commands

From repository root:

```bash
# build and run
Docker compose up -d --build

# check status
Docker compose ps

# inspect logs
Docker compose logs -f api
Docker compose logs -f dashboard

# restart one service
Docker compose restart api
Docker compose restart dashboard

# stop all
Docker compose down
```

## Health Checks

- API: `http://localhost:3001/health`
- Dashboard: `http://localhost:8080`

## Database Migration

Run after schema changes:

```bash
cd api
node migrate-supabase.js
```

Use this migration script for idempotent setup of sessions/messages/users/products.
