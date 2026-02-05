# n8n Chatbot Project

This project consists of an n8n automation workflow, a Node.js API, and a React-based admin dashboard.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
- Alternatively, [Node.js](https://nodejs.org/) (v18+) and [PostgreSQL](https://www.postgresql.org/) if running manually.

---

## Method 1: Running with Docker (Recommended)

1. **Start Docker Desktop**: Make sure the Docker engine is running.
2. **Launch Services**:
   ```bash
   docker compose up -d --build
   ```
3. **Verify Status**:
   ```bash
   docker compose ps
   ```

### Accessing the services:
- **Admin Dashboard**: [http://localhost:8080](http://localhost:8080)
- **n8n Instance**: [http://localhost:5678](http://localhost:5678)
- **API Health**: [http://localhost:3001/health](http://localhost:3001/health)

---

## Method 2: Running Manually (Development)

If you don't want to use Docker, follow these steps:

### 1. Database Setup
- Install PostgreSQL and create a database named `n8n_data`.
- Execute the SQL from `schema.sql` to create the necessary tables.
- Create a `.env` file in the root with your credentials:
  ```env
  DB_USER=your_postgres_user
  DB_PASSWORD=your_postgres_password
  DB_NAME=n8n_data
  DB_HOST=localhost
  DB_PORT=5432
  ```

### 2. Run Backend API
```bash
cd api
npm install
npm run dev
```
The API will run on [http://localhost:3001](http://localhost:3001).

### 3. Run Admin Dashboard
```bash
cd dashboard
npm install
npm run dev
```
The Dashboard will run on [http://localhost:5173](http://localhost:5173).

### 4. Setup n8n
- Start your local n8n.
- Import `chatbot_workflow.json` into n8n.

---

## How to Test Chat

To test the real-time chat functionality, follow these steps:

### 1. Open the Admin Dashboard
- Go to [http://localhost:8080](http://localhost:8080) (Docker) or [http://localhost:5173](http://localhost:5173) (Manual).
- You should see the "Chat Support" interface.

### 2. Simulate a Message from n8n (External)
Since the chat is reactive, you can simulate a message arriving from an AI or a user by hitting the API endpoint directly.

**Using PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/messages" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"sessionId": "test-session-123", "sender": "user", "content": "Hello, I need help!"}'
```

**Using cURL:**
```bash
curl -X POST http://localhost:3001/api/messages \
     -H "Content-Type: application/json" \
     -d '{"sessionId": "test-session-123", "sender": "user", "content": "Hello, I need help!"}'
```

### 3. Verify in Dashboard
- A new session named `Guest` (with ID `test-session-123`) should appear in the sidebar.
- Click on the session to open the chat window.
- The message "Hello, I need help!" should be visible.

### 4. Test Manual Reply
- Type a response in the input field (e.g., "Hi! I'm here to help.") and click **Send**.
- The message should appear on the right side (Blue bubble).
- The session status in the sidebar should change from **AI** to **HUMAN**.

### 5. Verify Real-time Sync
---

## Embedding the Chat Widget

You can add this manual support chat to any website by adding the following snippet before the closing `</body>` tag:

```html
<!-- n8n Chat Support Widget -->
<script src="http://localhost:3001/widget/chat-widget.js"></script>
```

> [!TIP]
> Make sure the Backend API is running and accessible from the website where you embed the widget. In production, replace `localhost:3001` with your actual API domain.

---

## Production Readiness Checklist

- [x] **Logging**: Implemented with Winston (JSON format for cloud logging).
- [x] **Validation**: All incoming messages are validated using Zod.
- [x] **Error Handling**: Centralized middleware to prevent crashes on invalid input.
- [x] **Performance**: Optimized SQL queries with indexes (in `schema.sql`).
- [x] **Manual Priority**: AI logic removed to focus on human support efficiency.
- [x] **Security**: CORS is configurable; basic session management in place.
