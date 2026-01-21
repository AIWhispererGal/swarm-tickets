---
name: Swarm Tickets
description: Track and manage bug tickets for swarm-based development. Use when working with project tickets, bugs, or when asked to check open issues, fix tickets, or update ticket status.
---

# Swarm Tickets Skill

This skill enables you to track and manage bug tickets in the project.

## Overview

The project uses `swarm-tickets` for bug tracking. Tickets can be stored in multiple backends:
- **JSON** (default): `./tickets.json` at the project root
- **SQLite**: `./tickets.db` local database
- **Supabase**: Cloud PostgreSQL database

## Storage Configuration

Set the storage backend via environment variable:

```bash
# JSON (default)
export SWARM_TICKETS_STORAGE=json

# SQLite
export SWARM_TICKETS_STORAGE=sqlite
export SWARM_TICKETS_SQLITE_PATH=./tickets.db

# Supabase
export SWARM_TICKETS_STORAGE=supabase
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-anon-key
```

## Ticket Structure

```json
{
  "id": "TKT-1234567890",
  "route": "/dashboard/users",
  "f12Errors": "Browser console errors",
  "serverErrors": "Server-side errors",
  "description": "Additional context",
  "status": "open|in-progress|fixed|closed",
  "priority": "critical|high|medium|low",
  "relatedTickets": ["TKT-xxx"],
  "swarmActions": [
    {
      "timestamp": "ISO timestamp",
      "action": "What you did",
      "result": "What happened"
    }
  ],
  "comments": [
    {
      "id": "CMT-xxx",
      "timestamp": "ISO timestamp",
      "type": "human|ai",
      "author": "username",
      "content": "Comment text",
      "metadata": {}
    }
  ],
  "namespace": "where/fixes/applied",
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

## Working with Tickets

### Before You Start

Always create a backup before modifying tickets directly:

```javascript
const fs = require('fs').promises;
await fs.copyFile('tickets.json', `tickets.backup.${Date.now()}.json`);
```

### Using the API (Recommended)

```javascript
// Base URL for local server
const API = 'http://localhost:3456/api';

// Get all tickets
const response = await fetch(`${API}/tickets`);
const tickets = await response.json();

// Filter tickets
const openTickets = await fetch(`${API}/tickets?status=open`);
const criticalTickets = await fetch(`${API}/tickets?priority=critical`);

// Get single ticket
const ticket = await fetch(`${API}/tickets/TKT-123`).then(r => r.json());

// Create ticket
const newTicket = await fetch(`${API}/tickets`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    route: '/dashboard',
    description: 'Something is broken',
    f12Errors: 'TypeError: ...',
    serverErrors: ''
  })
}).then(r => r.json());

// Update ticket
await fetch(`${API}/tickets/${ticketId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'in-progress',
    priority: 'high'
  })
});

// Close ticket
await fetch(`${API}/tickets/${ticketId}/close`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ reason: 'Fixed in commit abc123' })
});

// Reopen ticket
await fetch(`${API}/tickets/${ticketId}/reopen`, { method: 'POST' });

// Add swarm action
await fetch(`${API}/tickets/${ticketId}/swarm-action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'Investigating database connection',
    result: 'Found connection pool misconfiguration'
  })
});
```

### Working with Comments

```javascript
// Add a human comment
await fetch(`${API}/tickets/${ticketId}/comments`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'human',
    author: 'developer-name',
    content: 'I think this is related to the auth refactor'
  })
});

// Add an AI comment
await fetch(`${API}/tickets/${ticketId}/comments`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'ai',
    author: 'claude',
    content: 'After analyzing the stack trace, this appears to be a null reference issue in UserList.jsx:45',
    metadata: {
      analysisType: 'stack-trace',
      confidence: 'high'
    }
  })
});

// Get all comments for a ticket
const comments = await fetch(`${API}/tickets/${ticketId}/comments`).then(r => r.json());

// Update a comment
await fetch(`${API}/tickets/${ticketId}/comments/${commentId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: 'Updated comment text'
  })
});

// Delete a comment
await fetch(`${API}/tickets/${ticketId}/comments/${commentId}`, {
  method: 'DELETE'
});
```

### Reading Tickets (Direct File Access - JSON only)

```javascript
const fs = require('fs').promises;
const data = JSON.parse(await fs.readFile('tickets.json', 'utf8'));
const tickets = data.tickets;

// Find open tickets
const openTickets = tickets.filter(t => t.status === 'open');

// Find high priority tickets
const highPriority = tickets.filter(t => t.priority === 'high' || t.priority === 'critical');

// Find tickets for a specific route
const routeTickets = tickets.filter(t => t.route.includes('/dashboard'));
```

### Updating Tickets (Direct File Access - JSON only)

When working on a ticket:

```javascript
// 1. Set status to in-progress
ticket.status = 'in-progress';

// 2. Add a swarm action
ticket.swarmActions.push({
  timestamp: new Date().toISOString(),
  action: 'Investigating database connection error',
  result: null
});

// 3. Update timestamp
ticket.updatedAt = new Date().toISOString();

// 4. Write back
await fs.writeFile('tickets.json', JSON.stringify(data, null, 2));
```

When you fix a ticket:

```javascript
ticket.status = 'fixed';
ticket.namespace = 'database/connection';
ticket.swarmActions.push({
  timestamp: new Date().toISOString(),
  action: 'Added connection retry logic and proper error handling',
  result: 'Fixed - tested with 3 connection failures, all recovered successfully'
});
ticket.updatedAt = new Date().toISOString();

await fs.writeFile('tickets.json', JSON.stringify(data, null, 2));
```

### Setting Priority

Assign priority based on severity:

- **critical**: System down, auth broken, payment failures, data loss
- **high**: Major features broken, uncaught errors, crashes
- **medium**: Minor features broken, non-critical errors
- **low**: UI issues, warnings, optimization opportunities

```javascript
if (!ticket.priority) {
  // Analyze errors and set priority
  if (ticket.route.includes('auth') || ticket.route.includes('payment')) {
    ticket.priority = 'critical';
  } else if (ticket.serverErrors.includes('crash') || ticket.f12Errors.includes('Uncaught')) {
    ticket.priority = 'high';
  } else if (ticket.serverErrors.includes('Error') || ticket.f12Errors.includes('Error')) {
    ticket.priority = 'medium';
  } else {
    ticket.priority = 'low';
  }
}
```

### Setting Namespace

Document where fixes were applied:

```javascript
// Examples:
ticket.namespace = 'auth/login';
ticket.namespace = 'database/connection';
ticket.namespace = 'ui/dashboard';
ticket.namespace = 'api/users';
```

## Best Practices

1. **Always backup before modifying** - Copy tickets.json before changes
2. **Update timestamps** - Set `updatedAt` when changing tickets
3. **Log your actions** - Add entries to `swarmActions` for everything you do
4. **Add comments** - Use the comments system for discussion and notes
5. **Set priorities** - Help triage by assigning priority levels
6. **Link related tickets** - Connect tickets that affect the same area
7. **Document namespaces** - Record where fixes were applied
8. **Be specific** - In swarm actions, explain what you did and why

## Workflow Example

```javascript
const fs = require('fs').promises;

// 1. Backup
await fs.copyFile('tickets.json', `tickets.backup.${Date.now()}.json`);

// 2. Read tickets
const data = JSON.parse(await fs.readFile('tickets.json', 'utf8'));

// 3. Find open tickets
const openTickets = data.tickets.filter(t => t.status === 'open');

// 4. Work on highest priority first
openTickets.sort((a, b) => {
  const priority = { critical: 4, high: 3, medium: 2, low: 1 };
  return (priority[b.priority] || 0) - (priority[a.priority] || 0);
});

// 5. Update ticket as you work
const ticket = openTickets[0];
ticket.status = 'in-progress';
ticket.swarmActions.push({
  timestamp: new Date().toISOString(),
  action: 'Started fixing database column issue',
  result: null
});
ticket.updatedAt = new Date().toISOString();

// 6. Write back after each change
await fs.writeFile('tickets.json', JSON.stringify(data, null, 2));

// ... do the fix ...

// 7. Mark as fixed
ticket.status = 'fixed';
ticket.namespace = 'database/schema';
ticket.swarmActions.push({
  timestamp: new Date().toISOString(),
  action: 'Added missing org_id column to committees table',
  result: 'Fixed - column added via migration, tested successfully'
});
ticket.updatedAt = new Date().toISOString();

await fs.writeFile('tickets.json', JSON.stringify(data, null, 2));
```

## API Endpoints Reference

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
| GET | `/api/tickets/:id/comments` | Get ticket comments |
| POST | `/api/tickets/:id/comments` | Add comment |
| PATCH | `/api/tickets/:id/comments/:commentId` | Update comment |
| DELETE | `/api/tickets/:id/comments/:commentId` | Delete comment |
| GET | `/api/stats` | Get ticket statistics |
| POST | `/api/bug-report` | Submit bug report (rate limited) |
| GET | `/api/health` | Health check |

## UI Access

Users can view and create tickets via the web UI:

- Start server: `npm start` (in project root or `npx swarm-tickets`)
- Open: http://localhost:3456/ticket-tracker.html

The UI allows users to:
- Create new tickets with F12 and server errors
- View all tickets with filtering and search
- See ticket status, priority, and swarm actions
- Add comments to tickets
- Close/reopen tickets

## Bug Report Widget

For end-user bug reporting, embed the widget in your application. The widget is served automatically by the swarm-tickets server.

```html
<!-- Local development -->
<script src="http://localhost:3456/bug-report-widget.js"
        data-endpoint="http://localhost:3456/api/bug-report"
        data-position="bottom-right"
        data-theme="dark">
</script>

<!-- Production (use your actual server URL) -->
<script src="https://your-server.com/bug-report-widget.js"
        data-endpoint="https://your-server.com/api/bug-report"
        data-api-key="stk_your_api_key"
        data-position="bottom-right"
        data-theme="dark">
</script>
```

### Widget Options

| Option | Default | Description |
|--------|---------|-------------|
| `data-endpoint` | `/api/bug-report` | API endpoint URL |
| `data-api-key` | none | API key for authentication |
| `data-position` | `bottom-right` | `bottom-right`, `bottom-left`, `top-right`, `top-left` |
| `data-theme` | `dark` | `dark` or `light` |

See the main README.md for complete widget configuration and API key management.

## Notes

- Tickets persist based on configured storage (JSON, SQLite, or Supabase)
- The server auto-backs up to `ticket-backups/` before writes (JSON mode)
- Manual backups recommended: Copy tickets.json before major changes
- Recovery: Restore from `ticket-backups/` folder (keeps last 10)
- The UI and the swarm both work with the same ticket storage
- Comments support both human and AI authors for collaborative debugging
