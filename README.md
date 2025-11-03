# Claude-flow Ticket Tracker 🎫

A lightweight ticket tracking system for managing bugs, errors, and issues in your Claude-flow project.

## Features

- 📝 Quick ticket submission with route, F12 errors, and server errors
- 🔍 Filter and search tickets by status, priority, or keyword
- 🤖 Swarm integration ready (priority assignment, related ticket detection)
- 📊 Statistics dashboard
- 🎨 Clean, dark-themed UI
- 💾 JSON file storage (easy to backup, version control, and integrate)

## Quick Start

### Option 1: Standalone HTML (No Server)

Just open `ticket-tracker.html` in your browser. Data is stored in localStorage.

```bash
open ticket-tracker.html
# or
firefox ticket-tracker.html
```

### Option 2: Node.js Server (Recommended)

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open http://localhost:3456/ticket-tracker.html

## Usage

### Web UI

1. **Submit Tab**: Create new tickets with route, errors, and description
2. **View Tab**: See all tickets with filtering and search capabilities

### CLI Tool

Create a ticket from command line:
```bash
npm run ticket
# or
node ticket-cli.js
```

List all tickets:
```bash
node ticket-cli.js list
```

## API Endpoints

If using the Node.js server:

### Get all tickets
```bash
GET http://localhost:3456/api/tickets
```

### Create a ticket
```bash
POST http://localhost:3456/api/tickets
Content-Type: application/json

{
  "route": "/dashboard/users",
  "f12Errors": "TypeError: Cannot read property 'id' of undefined",
  "serverErrors": "Error: Database connection failed",
  "description": "User page crashes on load",
  "status": "open"
}
```

### Update a ticket
```bash
PATCH http://localhost:3456/api/tickets/TKT-1234567890
Content-Type: application/json

{
  "status": "fixed",
  "priority": "high"
}
```

### Add swarm action
```bash
POST http://localhost:3456/api/tickets/TKT-1234567890/swarm-action
Content-Type: application/json

{
  "action": "Applied database migration fix",
  "result": "Issue resolved"
}
```

### Auto-analyze with swarm
```bash
POST http://localhost:3456/api/tickets/TKT-1234567890/analyze
```

This will:
- Assign priority based on error severity and route
- Find related tickets on the same route
- Add a swarm action log entry

### Get statistics
```bash
GET http://localhost:3456/api/stats
```

## Data Structure

Tickets are stored in `tickets.json`:

```json
{
  "tickets": [
    {
      "id": "TKT-1234567890",
      "route": "/dashboard/users",
      "f12Errors": "TypeError: Cannot read property...",
      "serverErrors": "Error: Database connection failed",
      "description": "User page crashes on load",
      "status": "open",
      "priority": "high",
      "relatedTickets": ["TKT-1234567891"],
      "swarmActions": [
        {
          "timestamp": "2025-11-02T10:30:00.000Z",
          "action": "auto-analysis",
          "result": "Priority set to high"
        }
      ],
      "namespace": "user-management",
      "createdAt": "2025-11-02T10:00:00.000Z",
      "updatedAt": "2025-11-02T10:30:00.000Z"
    }
  ]
}
```

## Integration with Claude-flow

### From your app:

```javascript
// Quick ticket submission
async function reportBug(route, f12Errors, serverErrors) {
  await fetch('http://localhost:3456/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route, f12Errors, serverErrors })
  });
}

// In your error handler:
window.onerror = (msg, url, line, col, error) => {
  reportBug(
    window.location.pathname,
    `${msg} at ${url}:${line}:${col}\n${error.stack}`,
    ''
  );
};
```

### Swarm integration:

```javascript
// Let swarm analyze and prioritize tickets
const tickets = await fetch('http://localhost:3456/api/tickets').then(r => r.json());

for (const ticket of tickets.filter(t => !t.priority)) {
  await fetch(`http://localhost:3456/api/tickets/${ticket.id}/analyze`, {
    method: 'POST'
  });
}
```

## Field Descriptions

- **route**: The webpage/route where the error occurred
- **f12Errors**: Browser console errors from DevTools
- **serverErrors**: Server-side console errors
- **description**: Additional context or reproduction steps
- **status**: open | in-progress | fixed | closed
- **priority**: critical | high | medium | low (can be auto-assigned by swarm)
- **relatedTickets**: Array of related ticket IDs
- **swarmActions**: Log of automated actions taken by your swarm
- **namespace**: Categorization for fixes (e.g., "auth", "database", "ui")

## Tips

1. **Use the CLI** for quick ticket creation while debugging
2. **Auto-analyze** tickets to let the swarm assign priorities and find relationships
3. **Track namespaces** to document where fixes were applied
4. **Export tickets.json** regularly for backup or CI/CD integration
5. **Search by error message** to find similar issues quickly

## Swarm Integration

Add this to your swarm prompts when working on Claude-flow:

```
TICKET TRACKER CONTEXT:

You have access to a ticket tracking system at ./tickets.json

Current ticket structure:
- id: unique identifier (TKT-timestamp)
- route: webpage/route where error occurred
- f12Errors: browser console errors
- serverErrors: server-side errors
- description: additional context
- status: open | in-progress | fixed | closed
- priority: critical | high | medium | low (or null)
- relatedTickets: array of related ticket IDs
- swarmActions: array of {timestamp, action, result}
- namespace: where fixes were applied
- createdAt, updatedAt: ISO timestamps

INSTRUCTIONS:
1. Check tickets.json for open tickets before starting work
2. When fixing a ticket, update its status to "in-progress"
3. Add entries to swarmActions documenting what you did
4. Set priority if not already set (critical/high/medium/low)
5. Link related tickets by adding their IDs to relatedTickets array
6. Set namespace to document where fixes were applied (e.g., "auth", "database", "api/users")
7. When done, set status to "fixed" with final swarmAction entry
8. If you can't fix it, add a swarmAction explaining why and set priority

BEFORE modifying tickets.json, ALWAYS create a backup in tickets.backup.json
```

### Example Swarm Workflow

```javascript
// 1. Read tickets
const data = JSON.parse(await fs.readFile('tickets.json', 'utf8'));

// 2. Find open tickets
const openTickets = data.tickets.filter(t => t.status === 'open');

// 3. Work on a ticket
const ticket = openTickets[0];
ticket.status = 'in-progress';
ticket.swarmActions.push({
  timestamp: new Date().toISOString(),
  action: 'Started investigating database connection error',
  result: null
});

// 4. After fixing
ticket.status = 'fixed';
ticket.namespace = 'database/connection';
ticket.swarmActions.push({
  timestamp: new Date().toISOString(),
  action: 'Added connection retry logic and proper error handling',
  result: 'Fixed - tested with 3 connection failures, all recovered successfully'
});
ticket.updatedAt = new Date().toISOString();

// 5. Write back
await fs.writeFile('tickets.json', JSON.stringify(data, null, 2));
```

## Backups

**The Node.js server automatically creates backups before every write!**

Every time tickets.json is modified via the API or server, it:
1. Creates `tickets.backup.json` (latest backup)
2. Creates timestamped backup in `ticket-backups/`
3. Keeps last 20 timestamped backups, deletes older ones

So if the swarm overwrites something, you've got backups.

### Manual Backups

Use the backup script before letting swarm work:

```bash
#!/bin/bash
# backup-tickets.sh
BACKUP_DIR="./ticket-backups"
mkdir -p $BACKUP_DIR
cp tickets.json "$BACKUP_DIR/tickets-$(date +%Y%m%d-%H%M%S).json"

# Keep only last 20 backups
ls -t $BACKUP_DIR/tickets-*.json | tail -n +21 | xargs -r rm
```

Run it as a cron job:
```bash
# Every hour
0 * * * * cd /path/to/ticket-tracker && ./backup-tickets.sh
```

Or manually before letting swarm work:
```bash
cp tickets.json tickets.backup.json
```

### Git-based Backups

Add tickets.json to git and commit after significant changes:

```bash
git add tickets.json
git commit -m "Update tickets: 3 fixed, 2 new"
git push
```

**Important:** Add to `.gitignore` if tickets contain sensitive info:
```
# But DO track the structure
tickets.json

# Keep the example
!tickets.example.json
```

### Recovery

If swarm overwrites everything:
```bash
# From manual backup
cp tickets.backup.json tickets.json

# From timestamped backup
cp ticket-backups/tickets-20251102-143022.json tickets.json

# From git
git checkout HEAD~1 tickets.json
```

## Customization

The system is intentionally minimal. Extend it by:

- Adding more fields to the ticket structure
- Creating custom swarm analysis logic in the `/analyze` endpoint
- Building dashboards or reports from `tickets.json`
- Integrating with GitHub Issues, Jira, etc.

## License

MIT - Use it however you want!
