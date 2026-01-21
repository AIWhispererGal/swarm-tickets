#!/usr/bin/env node

/**
 * Swarm Tickets Server
 * REST API for ticket management with SQL and JSON storage backends
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const { createStorageAdapter, getStorageConfig } = require('./lib/storage');

const app = express();
const PORT = process.env.PORT || 3456;

// Storage adapter instance
let storage = null;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the project root and package directory
const projectRoot = process.cwd();
const packageDir = __dirname;
app.use(express.static(projectRoot));
app.use(express.static(packageDir));

// Auto-find available port
async function findAvailablePort(startPort) {
  const net = require('net');

  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1));
    });
    server.listen(startPort, () => {
      const { port } = server.address();
      server.close(() => {
        resolve(port);
      });
    });
  });
}

// ==================== TICKET ENDPOINTS ====================

// GET all tickets
app.get('/api/tickets', async (req, res) => {
  try {
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.priority) filters.priority = req.query.priority;
    if (req.query.route) filters.route = req.query.route;

    const tickets = await storage.getAllTickets(filters);
    res.json(tickets);
  } catch (error) {
    console.error('Error getting tickets:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET single ticket
app.get('/api/tickets/:id', async (req, res) => {
  try {
    const ticket = await storage.getTicket(req.params.id);
    if (ticket) {
      res.json(ticket);
    } else {
      res.status(404).json({ error: 'Ticket not found' });
    }
  } catch (error) {
    console.error('Error getting ticket:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST new ticket
app.post('/api/tickets', async (req, res) => {
  try {
    const ticket = await storage.createTicket(req.body);
    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH update ticket
app.patch('/api/tickets/:id', async (req, res) => {
  try {
    const ticket = await storage.updateTicket(req.params.id, req.body);
    if (ticket) {
      res.json(ticket);
    } else {
      res.status(404).json({ error: 'Ticket not found' });
    }
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE ticket
app.delete('/api/tickets/:id', async (req, res) => {
  try {
    const deleted = await storage.deleteTicket(req.params.id);
    if (deleted) {
      res.json({ message: 'Ticket deleted' });
    } else {
      res.status(404).json({ error: 'Ticket not found' });
    }
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== TICKET STATUS SHORTCUTS ====================

// POST close ticket
app.post('/api/tickets/:id/close', async (req, res) => {
  try {
    const ticket = await storage.getTicket(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Add a swarm action documenting the close
    await storage.addSwarmAction(req.params.id, {
      action: 'status-change',
      result: `Status changed from "${ticket.status}" to "closed"${req.body.reason ? `. Reason: ${req.body.reason}` : ''}`
    });

    // Update status
    const updated = await storage.updateTicket(req.params.id, { status: 'closed' });
    res.json(updated);
  } catch (error) {
    console.error('Error closing ticket:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST reopen ticket
app.post('/api/tickets/:id/reopen', async (req, res) => {
  try {
    const ticket = await storage.getTicket(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    await storage.addSwarmAction(req.params.id, {
      action: 'status-change',
      result: `Status changed from "${ticket.status}" to "open"${req.body.reason ? `. Reason: ${req.body.reason}` : ''}`
    });

    const updated = await storage.updateTicket(req.params.id, { status: 'open' });
    res.json(updated);
  } catch (error) {
    console.error('Error reopening ticket:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SWARM ACTION ENDPOINTS ====================

// POST add swarm action to ticket
app.post('/api/tickets/:id/swarm-action', async (req, res) => {
  try {
    const ticket = await storage.addSwarmAction(req.params.id, req.body);
    if (ticket) {
      res.json(ticket);
    } else {
      res.status(404).json({ error: 'Ticket not found' });
    }
  } catch (error) {
    console.error('Error adding swarm action:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST analyze ticket (simple auto-analysis)
app.post('/api/tickets/:id/analyze', async (req, res) => {
  try {
    const ticket = await storage.getTicket(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Determine priority based on errors
    let priority = 'low';
    if (ticket.f12Errors.toLowerCase().includes('error') ||
        ticket.serverErrors.toLowerCase().includes('error')) {
      priority = 'medium';
    }
    if (ticket.f12Errors.toLowerCase().includes('uncaught') ||
        ticket.serverErrors.toLowerCase().includes('fatal') ||
        ticket.serverErrors.toLowerCase().includes('crash')) {
      priority = 'high';
    }
    if (ticket.route.includes('auth') || ticket.route.includes('payment')) {
      priority = 'critical';
    }

    // Find related tickets
    const allTickets = await storage.getAllTickets();
    const relatedTickets = allTickets
      .filter(t => t.id !== ticket.id && t.route === ticket.route)
      .map(t => t.id)
      .slice(0, 3);

    // Update ticket
    await storage.addSwarmAction(req.params.id, {
      action: 'auto-analysis',
      result: `Priority set to ${priority}, found ${relatedTickets.length} related tickets`
    });

    const updated = await storage.updateTicket(req.params.id, {
      priority,
      relatedTickets
    });

    res.json(updated);
  } catch (error) {
    console.error('Error analyzing ticket:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== COMMENT ENDPOINTS ====================

// GET all comments for a ticket
app.get('/api/tickets/:id/comments', async (req, res) => {
  try {
    const comments = await storage.getComments(req.params.id);
    res.json(comments);
  } catch (error) {
    console.error('Error getting comments:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST add comment to ticket
app.post('/api/tickets/:id/comments', async (req, res) => {
  try {
    const comment = await storage.addComment(req.params.id, {
      type: req.body.type || 'human',
      author: req.body.author || 'anonymous',
      content: req.body.content || '',
      metadata: req.body.metadata || {}
    });

    if (comment) {
      res.status(201).json(comment);
    } else {
      res.status(404).json({ error: 'Ticket not found' });
    }
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH update comment
app.patch('/api/tickets/:ticketId/comments/:commentId', async (req, res) => {
  try {
    const comment = await storage.updateComment(
      req.params.ticketId,
      req.params.commentId,
      {
        content: req.body.content,
        metadata: req.body.metadata
      }
    );

    if (comment) {
      res.json(comment);
    } else {
      res.status(404).json({ error: 'Comment not found' });
    }
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE comment
app.delete('/api/tickets/:ticketId/comments/:commentId', async (req, res) => {
  try {
    const deleted = await storage.deleteComment(
      req.params.ticketId,
      req.params.commentId
    );

    if (deleted) {
      res.json({ message: 'Comment deleted' });
    } else {
      res.status(404).json({ error: 'Comment not found' });
    }
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== STATS ENDPOINTS ====================

// GET stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await storage.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== BUG REPORT ENDPOINTS ====================

// POST bug report (limited access - for end users)
app.post('/api/bug-report', async (req, res) => {
  try {
    // Extract API key from header or body
    const apiKey = req.headers['x-api-key'] || req.body.apiKey;

    // Get client IP for rate limiting
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    const result = await storage.createBugReport({
      ...req.body,
      ip,
      userAgent: req.headers['user-agent']
    }, apiKey);

    res.status(201).json(result);
  } catch (error) {
    if (error.message.includes('Rate limit')) {
      res.status(429).json({ error: error.message });
    } else if (error.message.includes('Invalid API key')) {
      res.status(401).json({ error: error.message });
    } else {
      console.error('Error creating bug report:', error);
      res.status(500).json({ error: 'Failed to submit bug report' });
    }
  }
});

// ==================== ADMIN ENDPOINTS ====================

// GET storage info
app.get('/api/admin/storage', (req, res) => {
  const config = getStorageConfig();
  res.json({
    type: config.type,
    // Don't expose sensitive info
    configured: true
  });
});

// POST create API key (for bug report widget)
app.post('/api/admin/api-keys', async (req, res) => {
  try {
    if (typeof storage.createApiKey !== 'function') {
      return res.status(501).json({ error: 'API key management not supported for this storage backend' });
    }
    const apiKey = await storage.createApiKey(req.body.name);
    res.status(201).json(apiKey);
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET list API keys
app.get('/api/admin/api-keys', async (req, res) => {
  try {
    if (typeof storage.listApiKeys !== 'function') {
      return res.status(501).json({ error: 'API key management not supported for this storage backend' });
    }
    const keys = await storage.listApiKeys();
    res.json(keys);
  } catch (error) {
    console.error('Error listing API keys:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE revoke API key
app.delete('/api/admin/api-keys/:key', async (req, res) => {
  try {
    if (typeof storage.revokeApiKey !== 'function') {
      return res.status(501).json({ error: 'API key management not supported for this storage backend' });
    }
    const revoked = await storage.revokeApiKey(req.params.key);
    if (revoked) {
      res.json({ message: 'API key revoked' });
    } else {
      res.status(404).json({ error: 'API key not found' });
    }
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    storage: getStorageConfig().type,
    version: require('./package.json').version
  });
});

// ==================== INITIALIZE AND START ====================

async function start() {
  try {
    // Initialize storage adapter
    const config = getStorageConfig();
    console.log(`📦 Initializing ${config.type} storage...`);

    storage = await createStorageAdapter();
    console.log(`✅ Storage initialized: ${config.type}`);

    // Find available port and start server
    const availablePort = await findAvailablePort(PORT);

    app.listen(availablePort, () => {
      console.log(`\n🎫 Swarm Tickets API running on http://localhost:${availablePort}`);
      console.log(`📊 Open http://localhost:${availablePort}/ticket-tracker.html to view the UI`);

      if (config.type === 'json') {
        console.log(`📁 Tickets stored at: ${config.jsonPath}`);
      } else if (config.type === 'sqlite') {
        console.log(`📁 Database: ${config.sqlitePath}`);
      } else if (config.type === 'supabase') {
        console.log(`☁️  Connected to Supabase`);
      }

      if (availablePort !== PORT) {
        console.log(`⚠️  Port ${PORT} was busy, using port ${availablePort} instead`);
      }

      console.log(`\n📡 API Endpoints:`);
      console.log(`   GET    /api/tickets         - List all tickets`);
      console.log(`   POST   /api/tickets         - Create ticket`);
      console.log(`   GET    /api/tickets/:id     - Get ticket`);
      console.log(`   PATCH  /api/tickets/:id     - Update ticket`);
      console.log(`   DELETE /api/tickets/:id     - Delete ticket`);
      console.log(`   POST   /api/tickets/:id/close   - Close ticket`);
      console.log(`   POST   /api/tickets/:id/comments - Add comment`);
      console.log(`   POST   /api/bug-report      - Submit bug report (rate limited)`);
      console.log(`   GET    /api/stats           - Get statistics\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (storage) {
    await storage.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (storage) {
    await storage.close();
  }
  process.exit(0);
});

start();
