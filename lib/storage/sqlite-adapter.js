/**
 * SQLite Storage Adapter
 * Uses better-sqlite3 for synchronous, high-performance SQLite operations
 */

const path = require('path');
const BaseAdapter = require('./base-adapter');

class SqliteAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.dbPath = path.resolve(config.sqlitePath || './tickets.db');
    this.db = null;
  }

  async initialize() {
    // Dynamic import to make sqlite optional
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch (error) {
      throw new Error(
        'SQLite adapter requires better-sqlite3. Install it with: npm install better-sqlite3'
      );
    }

    this.db = new Database(this.dbPath);

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Create tables
    this.db.exec(`
      -- Main tickets table
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        route TEXT NOT NULL,
        f12Errors TEXT DEFAULT '',
        serverErrors TEXT DEFAULT '',
        description TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in-progress', 'fixed', 'closed')),
        priority TEXT CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low')),
        namespace TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      -- Related tickets junction table
      CREATE TABLE IF NOT EXISTS ticket_relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        related_ticket_id TEXT NOT NULL,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (related_ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        UNIQUE(ticket_id, related_ticket_id)
      );

      -- Swarm actions log
      CREATE TABLE IF NOT EXISTS swarm_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        result TEXT,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      );

      -- Comments table
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'human' CHECK (type IN ('human', 'ai')),
        author TEXT DEFAULT 'anonymous',
        content TEXT DEFAULT '',
        metadata TEXT DEFAULT '{}',
        editedAt TEXT,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      );

      -- API Keys for bug report widget
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        name TEXT,
        created_at TEXT NOT NULL,
        last_used TEXT,
        rate_limit INTEGER DEFAULT 100,
        enabled INTEGER DEFAULT 1
      );

      -- Rate limiting table
      CREATE TABLE IF NOT EXISTS rate_limits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identifier TEXT NOT NULL,
        window_start TEXT NOT NULL,
        request_count INTEGER DEFAULT 1,
        UNIQUE(identifier, window_start)
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
      CREATE INDEX IF NOT EXISTS idx_tickets_route ON tickets(route);
      CREATE INDEX IF NOT EXISTS idx_tickets_createdAt ON tickets(createdAt);
      CREATE INDEX IF NOT EXISTS idx_swarm_actions_ticket_id ON swarm_actions(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier);
    `);

    // Prepare commonly used statements
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      getAllTickets: this.db.prepare('SELECT * FROM tickets ORDER BY createdAt DESC'),
      getTicket: this.db.prepare('SELECT * FROM tickets WHERE id = ?'),
      insertTicket: this.db.prepare(`
        INSERT INTO tickets (id, route, f12Errors, serverErrors, description, status, priority, namespace, createdAt, updatedAt)
        VALUES (@id, @route, @f12Errors, @serverErrors, @description, @status, @priority, @namespace, @createdAt, @updatedAt)
      `),
      updateTicket: this.db.prepare(`
        UPDATE tickets SET
          route = COALESCE(@route, route),
          f12Errors = COALESCE(@f12Errors, f12Errors),
          serverErrors = COALESCE(@serverErrors, serverErrors),
          description = COALESCE(@description, description),
          status = COALESCE(@status, status),
          priority = @priority,
          namespace = @namespace,
          updatedAt = @updatedAt
        WHERE id = @id
      `),
      deleteTicket: this.db.prepare('DELETE FROM tickets WHERE id = ?'),

      // Relations
      getRelatedTickets: this.db.prepare('SELECT related_ticket_id FROM ticket_relations WHERE ticket_id = ?'),
      insertRelation: this.db.prepare('INSERT OR IGNORE INTO ticket_relations (ticket_id, related_ticket_id) VALUES (?, ?)'),
      deleteRelations: this.db.prepare('DELETE FROM ticket_relations WHERE ticket_id = ?'),

      // Swarm actions
      getSwarmActions: this.db.prepare('SELECT * FROM swarm_actions WHERE ticket_id = ? ORDER BY timestamp ASC'),
      insertSwarmAction: this.db.prepare(`
        INSERT INTO swarm_actions (ticket_id, timestamp, action, result)
        VALUES (@ticket_id, @timestamp, @action, @result)
      `),

      // Comments
      getComments: this.db.prepare('SELECT * FROM comments WHERE ticket_id = ? ORDER BY timestamp ASC'),
      getComment: this.db.prepare('SELECT * FROM comments WHERE id = ? AND ticket_id = ?'),
      insertComment: this.db.prepare(`
        INSERT INTO comments (id, ticket_id, timestamp, type, author, content, metadata)
        VALUES (@id, @ticket_id, @timestamp, @type, @author, @content, @metadata)
      `),
      updateComment: this.db.prepare(`
        UPDATE comments SET content = @content, metadata = @metadata, editedAt = @editedAt
        WHERE id = @id AND ticket_id = @ticket_id
      `),
      deleteComment: this.db.prepare('DELETE FROM comments WHERE id = ? AND ticket_id = ?'),

      // Stats
      countByStatus: this.db.prepare('SELECT status, COUNT(*) as count FROM tickets GROUP BY status'),
      countByPriority: this.db.prepare('SELECT priority, COUNT(*) as count FROM tickets GROUP BY priority'),

      // API Keys
      getApiKey: this.db.prepare('SELECT * FROM api_keys WHERE key = ? AND enabled = 1'),
      updateApiKeyUsage: this.db.prepare('UPDATE api_keys SET last_used = ? WHERE key = ?'),

      // Rate limiting
      getRateLimit: this.db.prepare('SELECT * FROM rate_limits WHERE identifier = ? AND window_start = ?'),
      upsertRateLimit: this.db.prepare(`
        INSERT INTO rate_limits (identifier, window_start, request_count)
        VALUES (@identifier, @window_start, 1)
        ON CONFLICT(identifier, window_start) DO UPDATE SET request_count = request_count + 1
      `),
      cleanOldRateLimits: this.db.prepare('DELETE FROM rate_limits WHERE window_start < ?')
    };
  }

  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // Helper to build full ticket object with relations and actions
  _buildFullTicket(row) {
    if (!row) return null;

    const relatedRows = this.stmts.getRelatedTickets.all(row.id);
    const swarmActions = this.stmts.getSwarmActions.all(row.id);
    const comments = this.stmts.getComments.all(row.id);

    return {
      ...row,
      relatedTickets: relatedRows.map(r => r.related_ticket_id),
      swarmActions: swarmActions.map(a => ({
        timestamp: a.timestamp,
        action: a.action,
        result: a.result
      })),
      comments: comments.map(c => ({
        id: c.id,
        timestamp: c.timestamp,
        type: c.type,
        author: c.author,
        content: c.content,
        metadata: JSON.parse(c.metadata || '{}'),
        editedAt: c.editedAt
      }))
    };
  }

  // ==================== TICKET OPERATIONS ====================

  async getAllTickets(filters = {}) {
    let query = 'SELECT * FROM tickets WHERE 1=1';
    const params = [];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.excludeStatus) {
      query += ' AND status != ?';
      params.push(filters.excludeStatus);
    }
    if (filters.priority) {
      query += ' AND priority = ?';
      params.push(filters.priority);
    }
    if (filters.route) {
      query += ' AND route LIKE ?';
      params.push(`%${filters.route}%`);
    }

    query += ' ORDER BY createdAt DESC';

    const rows = this.db.prepare(query).all(...params);
    return rows.map(row => this._buildFullTicket(row));
  }

  async getTicket(id) {
    const row = this.stmts.getTicket.get(id);
    return this._buildFullTicket(row);
  }

  async createTicket(ticketData) {
    const now = new Date().toISOString();
    const id = ticketData.id || this.generateTicketId();  // Allow custom ID for migration

    const ticket = {
      id,
      route: ticketData.route || '',
      f12Errors: ticketData.f12Errors || '',
      serverErrors: ticketData.serverErrors || '',
      description: ticketData.description || '',
      status: ticketData.status || 'open',
      priority: ticketData.priority || null,
      namespace: ticketData.namespace || null,
      createdAt: ticketData.createdAt || now,  // Allow custom timestamps for migration
      updatedAt: ticketData.updatedAt || now
    };

    const transaction = this.db.transaction(() => {
      this.stmts.insertTicket.run(ticket);

      // Insert related tickets
      if (ticketData.relatedTickets && ticketData.relatedTickets.length > 0) {
        for (const relatedId of ticketData.relatedTickets) {
          this.stmts.insertRelation.run(id, relatedId);
        }
      }

      // Insert swarm actions
      if (ticketData.swarmActions && ticketData.swarmActions.length > 0) {
        for (const action of ticketData.swarmActions) {
          this.stmts.insertSwarmAction.run({
            ticket_id: id,
            timestamp: action.timestamp || now,
            action: action.action,
            result: action.result || null
          });
        }
      }

      // Insert comments
      if (ticketData.comments && ticketData.comments.length > 0) {
        for (const comment of ticketData.comments) {
          this.stmts.insertComment.run({
            id: comment.id || this.generateCommentId(),
            ticket_id: id,
            timestamp: comment.timestamp || now,
            type: comment.type || 'human',
            author: comment.author || 'anonymous',
            content: comment.content || '',
            metadata: JSON.stringify(comment.metadata || {})
          });
        }
      }
    });

    transaction();
    return this.getTicket(id);
  }

  async updateTicket(id, updates) {
    const existing = await this.getTicket(id);
    if (!existing) return null;

    const now = new Date().toISOString();

    const transaction = this.db.transaction(() => {
      this.stmts.updateTicket.run({
        id,
        route: updates.route,
        f12Errors: updates.f12Errors,
        serverErrors: updates.serverErrors,
        description: updates.description,
        status: updates.status,
        priority: updates.priority !== undefined ? updates.priority : existing.priority,
        namespace: updates.namespace !== undefined ? updates.namespace : existing.namespace,
        updatedAt: now
      });

      // Update related tickets if provided
      if (updates.relatedTickets !== undefined) {
        this.stmts.deleteRelations.run(id);
        for (const relatedId of updates.relatedTickets) {
          this.stmts.insertRelation.run(id, relatedId);
        }
      }
    });

    transaction();
    return this.getTicket(id);
  }

  async deleteTicket(id) {
    const result = this.stmts.deleteTicket.run(id);
    return result.changes > 0;
  }

  // ==================== SWARM ACTION OPERATIONS ====================

  async addSwarmAction(ticketId, action) {
    const ticket = await this.getTicket(ticketId);
    if (!ticket) return null;

    const now = new Date().toISOString();

    this.stmts.insertSwarmAction.run({
      ticket_id: ticketId,
      timestamp: now,
      action: action.action,
      result: action.result || null
    });

    this.db.prepare('UPDATE tickets SET updatedAt = ? WHERE id = ?').run(now, ticketId);

    return this.getTicket(ticketId);
  }

  // ==================== COMMENT OPERATIONS ====================

  async addComment(ticketId, commentData) {
    const ticket = await this.getTicket(ticketId);
    if (!ticket) return null;

    const now = new Date().toISOString();
    const commentId = this.generateCommentId();

    const comment = {
      id: commentId,
      ticket_id: ticketId,
      timestamp: now,
      type: commentData.type || 'human',
      author: commentData.author || 'anonymous',
      content: commentData.content || '',
      metadata: JSON.stringify(commentData.metadata || {})
    };

    this.stmts.insertComment.run(comment);
    this.db.prepare('UPDATE tickets SET updatedAt = ? WHERE id = ?').run(now, ticketId);

    return {
      id: commentId,
      timestamp: now,
      type: comment.type,
      author: comment.author,
      content: comment.content,
      metadata: commentData.metadata || {}
    };
  }

  async getComments(ticketId) {
    const rows = this.stmts.getComments.all(ticketId);
    return rows.map(c => ({
      id: c.id,
      timestamp: c.timestamp,
      type: c.type,
      author: c.author,
      content: c.content,
      metadata: JSON.parse(c.metadata || '{}'),
      editedAt: c.editedAt
    }));
  }

  async updateComment(ticketId, commentId, updates) {
    const existing = this.stmts.getComment.get(commentId, ticketId);
    if (!existing) return null;

    const now = new Date().toISOString();

    this.stmts.updateComment.run({
      id: commentId,
      ticket_id: ticketId,
      content: updates.content !== undefined ? updates.content : existing.content,
      metadata: JSON.stringify(updates.metadata || JSON.parse(existing.metadata || '{}')),
      editedAt: now
    });

    this.db.prepare('UPDATE tickets SET updatedAt = ? WHERE id = ?').run(now, ticketId);

    const updated = this.stmts.getComment.get(commentId, ticketId);
    return {
      id: updated.id,
      timestamp: updated.timestamp,
      type: updated.type,
      author: updated.author,
      content: updated.content,
      metadata: JSON.parse(updated.metadata || '{}'),
      editedAt: updated.editedAt
    };
  }

  async deleteComment(ticketId, commentId) {
    const result = this.stmts.deleteComment.run(commentId, ticketId);
    if (result.changes > 0) {
      const now = new Date().toISOString();
      this.db.prepare('UPDATE tickets SET updatedAt = ? WHERE id = ?').run(now, ticketId);
      return true;
    }
    return false;
  }

  // ==================== STATS OPERATIONS ====================

  async getStats() {
    const totalRow = this.db.prepare('SELECT COUNT(*) as total FROM tickets').get();
    const statusRows = this.stmts.countByStatus.all();
    const priorityRows = this.stmts.countByPriority.all();

    const byStatus = { open: 0, inProgress: 0, fixed: 0, closed: 0 };
    const byPriority = { critical: 0, high: 0, medium: 0, low: 0 };

    statusRows.forEach(row => {
      if (row.status === 'in-progress') byStatus.inProgress = row.count;
      else if (byStatus[row.status] !== undefined) byStatus[row.status] = row.count;
    });

    priorityRows.forEach(row => {
      if (row.priority && byPriority[row.priority] !== undefined) {
        byPriority[row.priority] = row.count;
      }
    });

    return {
      total: totalRow.total,
      byStatus,
      byPriority
    };
  }

  // ==================== BUG REPORT OPERATIONS ====================

  async createBugReport(reportData, apiKey = null) {
    // Validate API key if provided
    if (apiKey) {
      const keyRecord = this.stmts.getApiKey.get(apiKey);
      if (!keyRecord) {
        throw new Error('Invalid API key');
      }
      // Update last used
      this.stmts.updateApiKeyUsage.run(new Date().toISOString(), apiKey);
    }

    // Check rate limit (IP-based if no API key)
    const identifier = apiKey || reportData.ip || 'anonymous';
    const windowStart = new Date();
    windowStart.setMinutes(0, 0, 0); // Hour window
    const windowKey = windowStart.toISOString();

    // Clean old rate limit records
    const oldWindow = new Date(Date.now() - 3600000).toISOString();
    this.stmts.cleanOldRateLimits.run(oldWindow);

    // Check current count
    const rateLimit = this.stmts.getRateLimit.get(identifier, windowKey);
    const limit = apiKey ? 1000 : 10; // Higher limit for API key users

    if (rateLimit && rateLimit.request_count >= limit) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    // Increment rate limit
    this.stmts.upsertRateLimit.run({ identifier, window_start: windowKey });

    // Create the ticket
    const ticket = await this.createTicket({
      route: reportData.location || reportData.route || 'unknown',
      f12Errors: reportData.clientError || reportData.f12Errors || '',
      serverErrors: '',
      description: reportData.description || '',
      status: 'open',
      priority: null,
      swarmActions: [{
        timestamp: new Date().toISOString(),
        action: 'bug-report-submitted',
        result: `Bug report submitted via widget. User agent: ${reportData.userAgent || 'unknown'}`
      }]
    });

    return {
      id: ticket.id,
      status: 'submitted',
      message: 'Bug report received. Thank you!'
    };
  }

  // ==================== API KEY MANAGEMENT ====================

  async createApiKey(name = null) {
    const key = 'stk_' + require('crypto').randomBytes(24).toString('hex');
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO api_keys (key, name, created_at) VALUES (?, ?, ?)
    `).run(key, name, now);

    return { key, name, createdAt: now };
  }

  async listApiKeys() {
    return this.db.prepare('SELECT id, name, created_at, last_used, enabled FROM api_keys').all();
  }

  async revokeApiKey(key) {
    const result = this.db.prepare('UPDATE api_keys SET enabled = 0 WHERE key = ?').run(key);
    return result.changes > 0;
  }
}

module.exports = SqliteAdapter;
