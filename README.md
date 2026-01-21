# 🎫 Swarm Tickets

Lightweight ticket tracking system designed for AI-powered bug fixing workflows with Claude-flow/Claude Code.

Track bugs, errors, and issues that both humans and AI agents can read and update. Perfect for projects where you want Claude to autonomously fix tickets.

## ✨ Features

- 📝 **Multiple storage backends** - JSON, SQLite, or Supabase
- 🤖 **AI-friendly format** - Designed for Claude swarm workflows
- 🎨 **Beautiful web UI** - View and manage tickets in your browser
- 💬 **Comment system** - Human and AI collaboration on tickets
- 🐛 **Bug Report Widget** - Embeddable widget for end-user bug reports
- 💾 **Automatic backups** - Never lose ticket history
- 🔧 **RESTful API** - Integrate with any tool
- ⚙️ **Configurable labels** - Customize field names for your project
- 📋 **Quick prompt generation** - Copy Claude-ready prompts with one click
- 🔄 **Auto port detection** - No conflicts with existing services

## 📦 Installation

```bash
npm install swarm-tickets
```

After installation, the package will automatically set up:
- `.claude/skills/swarm-tickets/` - Claude skill documentation
- `ticket-tracker.html` - Web interface (in your project root)
- `tickets.json` - Ticket storage file

## 🚀 Quick Start

### 1. Start the server

```bash
npx swarm-tickets
```

This starts the API server on port 3456 (or next available port).

### 2. Open the web UI

Navigate to `http://localhost:3456/ticket-tracker.html`

### 3. Create your first ticket

Use the web UI or API:

```bash
curl -X POST http://localhost:3456/api/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "route": "/dashboard/users",
    "f12Errors": "TypeError: Cannot read property...",
    "serverErrors": "Error connecting to database",
    "description": "User list not loading",
    "status": "open"
  }'
```

### 4. Let Claude fix it

Click the "📋 Quick Prompt" button on any ticket, paste into Claude Code/flow, and watch it work!

## 💾 Storage Options

Swarm Tickets supports three storage backends:

### JSON (Default)
No configuration needed. Tickets are stored in `./tickets.json`.

```bash
# Explicit configuration (optional)
export SWARM_TICKETS_STORAGE=json
npx swarm-tickets
```

### SQLite (Local SQL)
For better performance and query capabilities with a local database.

> **Note:** `better-sqlite3` is an optional dependency because it requires native compilation. Only install if you want SQLite storage.

```bash
# Install optional dependency
npm install better-sqlite3

# Configure
export SWARM_TICKETS_STORAGE=sqlite
export SWARM_TICKETS_SQLITE_PATH=./tickets.db  # optional, default: ./tickets.db

npx swarm-tickets
```

### Supabase (Cloud SQL)
For team collaboration, cloud storage, and production deployments.

```bash
# Install optional dependency
npm install @supabase/supabase-js

# Configure
export SWARM_TICKETS_STORAGE=supabase
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-anon-key

# Optional: For auto-table creation
export SUPABASE_SERVICE_ROLE_KEY=your-service-key

npx swarm-tickets
```

#### Finding Your Supabase Credentials

1. Go to [supabase.com](https://supabase.com) and create a project (or open existing)
2. Navigate to **Project Settings** > **API**
3. Copy these values:
   - **Project URL** → use as `SUPABASE_URL`
   - **anon public** key → use as `SUPABASE_ANON_KEY`
   - **service_role** key → use as `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

#### Supabase Manual Setup

If you prefer to create tables manually (recommended for production):

> To run the SQL: Go to your Supabase Dashboard > **SQL Editor** > **New query**, paste the SQL below, and click **Run**.

```sql
-- Supabase SQL Schema for swarm-tickets

-- Main tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  route TEXT NOT NULL,
  f12_errors TEXT DEFAULT '',
  server_errors TEXT DEFAULT '',
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in-progress', 'fixed', 'closed')),
  priority TEXT CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low')),
  namespace TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Related tickets junction table
CREATE TABLE IF NOT EXISTS ticket_relations (
  id SERIAL PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  related_ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  UNIQUE(ticket_id, related_ticket_id)
);

-- Swarm actions log
CREATE TABLE IF NOT EXISTS swarm_actions (
  id SERIAL PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  action TEXT NOT NULL,
  result TEXT
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL DEFAULT 'human' CHECK (type IN ('human', 'ai')),
  author TEXT DEFAULT 'anonymous',
  content TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}',
  edited_at TIMESTAMP WITH TIME ZONE
);

-- API Keys for bug report widget
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_used TIMESTAMP WITH TIME ZONE,
  rate_limit INTEGER DEFAULT 100,
  enabled BOOLEAN DEFAULT true
);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
  id SERIAL PRIMARY KEY,
  identifier TEXT NOT NULL,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  request_count INTEGER DEFAULT 1,
  UNIQUE(identifier, window_start)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_route ON tickets(route);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_swarm_actions_ticket_id ON swarm_actions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id);
```

## 🔄 Migrating Existing Tickets

Already have tickets in JSON and want to switch to SQLite or Supabase? Use the migration tool:

### Migrate to SQLite

```bash
# Install SQLite dependency
npm install better-sqlite3

# Run migration
npx swarm-tickets migrate --to sqlite
```

### Migrate to Supabase

```bash
# Install Supabase dependency
npm install @supabase/supabase-js

# Set environment variables
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-anon-key

# Run migration (create tables first - see Supabase setup above)
npx swarm-tickets migrate --to supabase
```

The migration tool:
- Preserves ticket IDs, timestamps, and all data
- Skips tickets that already exist in the target
- Leaves your original `tickets.json` unchanged
- Shows a summary of migrated/skipped/failed tickets

After migration, start using the new storage:
```bash
export SWARM_TICKETS_STORAGE=sqlite  # or supabase
npx swarm-tickets
```

## 🤖 Using with Claude

The package includes a Claude skill that teaches Claude how to:
- Read and update tickets
- Set priorities and track related tickets
- Add swarm actions documenting fixes
- Add comments to discuss issues
- Close and reopen tickets
- Update status as work progresses

Just reference the ticket ID in your prompt:

```
Please investigate and fix ticket TKT-1234567890
```

Claude will:
1. Read the ticket details
2. Investigate the errors
3. Fix the issue
4. Update the ticket with status and actions taken

## 💬 Comments System

Add comments to tickets for human-AI collaboration:

```bash
# Add a human comment
curl -X POST http://localhost:3456/api/tickets/TKT-123/comments \
  -H "Content-Type: application/json" \
  -d '{
    "type": "human",
    "author": "developer",
    "content": "I think this is related to the auth refactor"
  }'

# Add an AI comment
curl -X POST http://localhost:3456/api/tickets/TKT-123/comments \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ai",
    "author": "claude",
    "content": "After analyzing the stack trace, this appears to be a null reference issue",
    "metadata": {"analysisType": "stack-trace", "confidence": "high"}
  }'
```

## 🐛 Bug Report Widget

Let end-users report bugs directly from your application. The widget JavaScript is served automatically by the swarm-tickets server.

### Embed the Widget

```html
<!-- For local development -->
<script src="http://localhost:3456/bug-report-widget.js"
        data-endpoint="http://localhost:3456/api/bug-report"
        data-position="bottom-right"
        data-theme="dark">
</script>

<!-- For production (use your actual server URL) -->
<script src="https://your-server.com/bug-report-widget.js"
        data-endpoint="https://your-server.com/api/bug-report"
        data-api-key="stk_your_api_key"
        data-position="bottom-right"
        data-theme="dark">
</script>
```

### Or Initialize Programmatically

```javascript
SwarmBugReport.init({
  endpoint: 'https://your-server:3456/api/bug-report',
  apiKey: 'stk_your_api_key',  // optional
  position: 'bottom-right',     // bottom-right, bottom-left, top-right, top-left
  theme: 'dark',                // dark or light
  buttonText: 'Report Bug',
  collectErrors: true           // auto-capture console errors
});
```

### Widget Options

| Option | Default | Description |
|--------|---------|-------------|
| `endpoint` | `/api/bug-report` | API endpoint URL |
| `apiKey` | `null` | API key for authentication |
| `position` | `bottom-right` | Widget position |
| `theme` | `dark` | `dark` or `light` |
| `buttonText` | `Report Bug` | Button label |
| `buttonIcon` | `🐛` | Button icon |
| `collectErrors` | `true` | Auto-capture console errors |
| `maxErrors` | `10` | Max errors to collect |

### Generate API Keys (SQLite/Supabase only)

> **Note:** API key management requires SQLite or Supabase storage. JSON storage mode does not persist API keys between server restarts.

```bash
# Create an API key
curl -X POST http://localhost:3456/api/admin/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "Production Widget"}'

# List API keys
curl http://localhost:3456/api/admin/api-keys

# Revoke an API key
curl -X DELETE http://localhost:3456/api/admin/api-keys/stk_xxx
```

### Rate Limiting

- With API key: 1000 requests per hour
- Without API key: 10 requests per hour per IP

## ⚙️ Configuration

### Custom Project Name & Labels

Go to Settings in the web UI to customize:
- Project name
- Field labels (e.g., "Location" instead of "Route/Webpage")
- Error section names
- Quick prompt template

Settings are saved to localStorage and persist across sessions.

### Custom Port

```bash
PORT=4000 npx swarm-tickets
```

Or the server will automatically find the next available port if 3456 is busy.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Server port |
| `SWARM_TICKETS_STORAGE` | `json` | Storage backend: `json`, `sqlite`, `supabase` |
| `SWARM_TICKETS_JSON_PATH` | `./tickets.json` | JSON file path |
| `SWARM_TICKETS_SQLITE_PATH` | `./tickets.db` | SQLite database path |
| `SUPABASE_URL` | - | Supabase project URL |
| `SUPABASE_ANON_KEY` | - | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | - | Supabase service role key (for auto-setup) |

## 📖 API Reference

### Tickets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tickets` | List all tickets (supports `?status=`, `?priority=`, `?route=`) |
| POST | `/api/tickets` | Create new ticket |
| GET | `/api/tickets/:id` | Get single ticket |
| PATCH | `/api/tickets/:id` | Update ticket |
| DELETE | `/api/tickets/:id` | Delete ticket |
| POST | `/api/tickets/:id/close` | Close ticket (with optional reason) |
| POST | `/api/tickets/:id/reopen` | Reopen ticket |
| POST | `/api/tickets/:id/analyze` | Auto-analyze and set priority |
| POST | `/api/tickets/:id/swarm-action` | Add swarm action |

### Comments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tickets/:id/comments` | Get ticket comments |
| POST | `/api/tickets/:id/comments` | Add comment |
| PATCH | `/api/tickets/:id/comments/:commentId` | Update comment |
| DELETE | `/api/tickets/:id/comments/:commentId` | Delete comment |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | Get ticket statistics |
| POST | `/api/bug-report` | Submit bug report (rate limited) |
| GET | `/api/health` | Health check |
| GET | `/api/admin/storage` | Get storage info |
| POST | `/api/admin/api-keys` | Create API key |
| GET | `/api/admin/api-keys` | List API keys |
| DELETE | `/api/admin/api-keys/:key` | Revoke API key |

## 📁 File Structure

After installation:

```
your-project/
├── .claude/
│   └── skills/
│       └── swarm-tickets/
│           └── SKILL.md          # Claude skill documentation
├── ticket-backups/               # Automatic backups (last 10)
├── ticket-tracker.html           # Web UI
├── tickets.json                  # Your tickets (JSON mode)
├── tickets.db                    # Your tickets (SQLite mode)
└── node_modules/
    └── swarm-tickets/
        ├── lib/
        │   └── storage/          # Storage adapters
        ├── bug-report-widget.js  # Embeddable widget
        └── ...
```

## 🔧 Local Development

Testing the package locally before publishing:

```bash
# In your test project
npm install /path/to/swarm-tickets

# If files weren't copied automatically (local install issue)
node node_modules/swarm-tickets/setup.js

# Start the server
npx swarm-tickets
```

## 🗑️ .gitignore

Add to your `.gitignore` if you don't want to commit tickets:

```
tickets.json
tickets.db
ticket-backups/
```

## 📜 License

MIT

## 🤝 Contributing

Built for the Claude community! Issues and PRs welcome.

## 💡 Tips

- Use the **Quick Prompt** button to generate Claude-ready prompts
- Set **priorities** to help Claude focus on critical issues first
- Add **comments** to discuss issues with team and AI
- Add **swarm actions** to document what was fixed and how
- Use **namespaces** to track which files/components were modified
- Link **related tickets** to help Claude understand patterns
- Use **SQLite** for better performance on larger projects
- Use **Supabase** for team collaboration and cloud deployments

## 🐛 Troubleshooting

### Postinstall script didn't run (local install)
```bash
node node_modules/swarm-tickets/setup.js
```

### Port 3456 is busy
The server will automatically find the next available port. Or set a custom port:
```bash
PORT=4000 npx swarm-tickets
```

### Files not showing up
Make sure you're in your project directory when running `npx swarm-tickets`. The server looks for `tickets.json` in the current directory.

### SQLite not working
Install the optional dependency:
```bash
npm install better-sqlite3
```

### Supabase not working
1. Install the optional dependency: `npm install @supabase/supabase-js`
2. Make sure environment variables are set
3. Check if tables exist (run migration SQL if needed)

---

Made with ❤️ for Claude-powered development workflows
