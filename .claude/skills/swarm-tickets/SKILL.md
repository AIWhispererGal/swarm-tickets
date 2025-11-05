---
name: Swarm Tickets
description: Track and manage bug tickets for swarm-based development. Use when working with project tickets, bugs, or when asked to check open issues, fix tickets, or update ticket status.
---

# Swarm Tickets Skill

This skill enables you to track and manage bug tickets in the project.

## Overview

The project uses `swarm-tickets` for bug tracking. Tickets are stored in `./tickets.json` at the project root.

## Ticket Structure

```json
{
  "tickets": [
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
      "namespace": "where/fixes/applied",
      "createdAt": "ISO timestamp",
      "updatedAt": "ISO timestamp"
    }
  ]
}
```

## Working with Tickets

### Before You Start

Always create a backup before modifying tickets.json:

```javascript
const fs = require('fs').promises;
await fs.copyFile('tickets.json', `tickets.backup.${Date.now()}.json`);
```

### Reading Tickets

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

### Updating Tickets

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

### Linking Related Tickets

Find and link related tickets:

```javascript
// Find tickets on the same route
const related = tickets
  .filter(t => t.id !== ticket.id && t.route === ticket.route)
  .map(t => t.id);

if (related.length > 0) {
  ticket.relatedTickets = related;
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
4. **Set priorities** - Help triage by assigning priority levels
5. **Link related tickets** - Connect tickets that affect the same area
6. **Document namespaces** - Record where fixes were applied
7. **Be specific** - In swarm actions, explain what you did and why

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

## UI Access

Users can view and create tickets via the web UI:

- Start server: `npm start` (in project root or `npx swarm-tickets`)
- Open: http://localhost:3456/ticket-tracker.html

The UI allows users to:
- Create new tickets with F12 and server errors
- View all tickets with filtering and search
- See ticket status, priority, and swarm actions

## Notes

- Tickets persist in `tickets.json` at project root
- The server auto-backs up to `ticket-backups/` before writes (if running)
- Manual backups recommended: Copy tickets.json before major changes
- Recovery: Restore from `ticket-backups/` folder (keeps last 10)
- The UI and the swarm both work with the same `tickets.json` file
