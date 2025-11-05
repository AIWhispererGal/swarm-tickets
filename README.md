# 🎫 Swarm Tickets

Lightweight ticket tracking system designed for AI-powered bug fixing workflows with Claude-flow/Claude Code.

Track bugs, errors, and issues in a simple JSON file that both humans and AI agents can read and update. Perfect for projects where you want Claude to autonomously fix tickets.

## ✨ Features

- 📝 **Simple JSON-based storage** - No database required
- 🤖 **AI-friendly format** - Designed for Claude swarm workflows
- 🎨 **Beautiful web UI** - View and manage tickets in your browser
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

## 🤖 Using with Claude

The package includes a Claude skill that teaches Claude how to:
- Read and update tickets from `tickets.json`
- Set priorities and track related tickets
- Add swarm actions documenting fixes
- Update status as work progresses

Just reference the ticket ID in your prompt:

```
Please investigate and fix ticket TKT-1234567890
```

Claude will:
1. Read the ticket details from `tickets.json`
2. Investigate the errors
3. Fix the issue
4. Update the ticket with status and actions taken

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

## 📖 API Reference

### Get all tickets
```
GET /api/tickets
```

### Get single ticket
```
GET /api/tickets/:id
```

### Create ticket
```
POST /api/tickets
Content-Type: application/json

{
  "route": "/page/path",
  "f12Errors": "Browser console errors",
  "serverErrors": "Server console errors", 
  "description": "Optional description",
  "status": "open|in-progress|fixed|closed"
}
```

### Update ticket
```
PATCH /api/tickets/:id
Content-Type: application/json

{
  "status": "fixed",
  "priority": "high",
  "namespace": "components/UserList",
  "swarmActions": [...]
}
```

### Add swarm action
```
POST /api/tickets/:id/swarm-action
Content-Type: application/json

{
  "action": "Fixed null reference in UserList component",
  "result": "Tested and verified working"
}
```

### Delete ticket
```
DELETE /api/tickets/:id
```

### Get stats
```
GET /api/stats
```

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
├── tickets.json                  # Your tickets
└── node_modules/
    └── swarm-tickets/
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
ticket-backups/
```

## 📜 License

MIT

## 🤝 Contributing

Built for the Claude community! Issues and PRs welcome.

## 💡 Tips

- Use the **Quick Prompt** button to generate Claude-ready prompts
- Set **priorities** to help Claude focus on critical issues first
- Add **swarm actions** to document what was fixed and how
- Use **namespaces** to track which files/components were modified
- Link **related tickets** to help Claude understand patterns

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

---

Made with ❤️ for Claude-powered development workflows
