/**
 * Supabase Storage Adapter
 * Uses Supabase client for cloud PostgreSQL storage
 */

const BaseAdapter = require('./base-adapter');

class SupabaseAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.supabaseUrl = config.supabaseUrl;
    this.supabaseKey = config.supabaseKey;
    this.supabaseServiceKey = config.supabaseServiceKey;
    this.client = null;
    this.adminClient = null;
  }

  async initialize() {
    // Dynamic import to make supabase optional
    let createClient;
    try {
      const supabase = require('@supabase/supabase-js');
      createClient = supabase.createClient;
    } catch (error) {
      throw new Error(
        'Supabase adapter requires @supabase/supabase-js. Install it with: npm install @supabase/supabase-js'
      );
    }

    this.client = createClient(this.supabaseUrl, this.supabaseKey);

    // Create admin client if service key is provided (for table creation)
    if (this.supabaseServiceKey) {
      this.adminClient = createClient(this.supabaseUrl, this.supabaseServiceKey);
    }

    // Try to create tables if we have admin access
    await this._ensureTables();
  }

  async _ensureTables() {
    // Check if tables exist by trying to query them
    const { error } = await this.client.from('tickets').select('id').limit(1);

    if (error && error.code === '42P01') {
      // Table doesn't exist
      if (this.adminClient) {
        console.log('Creating Supabase tables...');
        await this._createTables();
      } else {
        throw new Error(
          'Supabase tables do not exist. Either:\n' +
          '1. Set SUPABASE_SERVICE_ROLE_KEY for auto-creation, or\n' +
          '2. Run the migration script manually. See README for SQL.'
        );
      }
    }
  }

  async _createTables() {
    // Execute table creation via Supabase SQL
    const { error } = await this.adminClient.rpc('exec_sql', {
      sql: this._getCreateTablesSql()
    });

    if (error) {
      // RPC might not exist, try alternative approach
      console.warn('Could not auto-create tables via RPC. Please create them manually.');
      console.log('SQL Schema:\n', this._getCreateTablesSql());
    }
  }

  _getCreateTablesSql() {
    return `
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

      -- Enable Row Level Security (optional)
      ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
      ALTER TABLE swarm_actions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

      -- Create policies for anonymous access (adjust as needed)
      CREATE POLICY IF NOT EXISTS "Allow all for now" ON tickets FOR ALL USING (true);
      CREATE POLICY IF NOT EXISTS "Allow all for now" ON swarm_actions FOR ALL USING (true);
      CREATE POLICY IF NOT EXISTS "Allow all for now" ON comments FOR ALL USING (true);
    `;
  }

  async close() {
    // Supabase client doesn't need explicit closing
    this.client = null;
    this.adminClient = null;
  }

  // Helper to convert DB row to ticket format
  _rowToTicket(row, swarmActions = [], comments = [], relatedTickets = []) {
    return {
      id: row.id,
      route: row.route,
      f12Errors: row.f12_errors,
      serverErrors: row.server_errors,
      description: row.description,
      status: row.status,
      priority: row.priority,
      namespace: row.namespace,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
        metadata: c.metadata || {},
        editedAt: c.edited_at
      })),
      relatedTickets: relatedTickets.map(r => r.related_ticket_id)
    };
  }

  async _getFullTicket(id) {
    const [ticketResult, actionsResult, commentsResult, relationsResult] = await Promise.all([
      this.client.from('tickets').select('*').eq('id', id).single(),
      this.client.from('swarm_actions').select('*').eq('ticket_id', id).order('timestamp'),
      this.client.from('comments').select('*').eq('ticket_id', id).order('timestamp'),
      this.client.from('ticket_relations').select('related_ticket_id').eq('ticket_id', id)
    ]);

    if (ticketResult.error || !ticketResult.data) return null;

    return this._rowToTicket(
      ticketResult.data,
      actionsResult.data || [],
      commentsResult.data || [],
      relationsResult.data || []
    );
  }

  // ==================== TICKET OPERATIONS ====================

  async getAllTickets(filters = {}) {
    let query = this.client.from('tickets').select('*');

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.excludeStatus) {
      query = query.neq('status', filters.excludeStatus);
    }
    if (filters.priority) {
      query = query.eq('priority', filters.priority);
    }
    if (filters.route) {
      query = query.ilike('route', `%${filters.route}%`);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    // Get all related data for each ticket
    const tickets = await Promise.all(
      (data || []).map(row => this._getFullTicket(row.id))
    );

    return tickets.filter(t => t !== null);
  }

  async getTicket(id) {
    return this._getFullTicket(id);
  }

  async createTicket(ticketData) {
    const now = new Date().toISOString();
    const id = ticketData.id || this.generateTicketId();  // Allow custom ID for migration

    const ticket = {
      id,
      route: ticketData.route || '',
      f12_errors: ticketData.f12Errors || '',
      server_errors: ticketData.serverErrors || '',
      description: ticketData.description || '',
      status: ticketData.status || 'open',
      priority: ticketData.priority || null,
      namespace: ticketData.namespace || null,
      created_at: ticketData.createdAt || now,  // Allow custom timestamps for migration
      updated_at: ticketData.updatedAt || now
    };

    const { error } = await this.client.from('tickets').insert(ticket);
    if (error) throw error;

    // Insert related tickets
    if (ticketData.relatedTickets && ticketData.relatedTickets.length > 0) {
      const relations = ticketData.relatedTickets.map(relatedId => ({
        ticket_id: id,
        related_ticket_id: relatedId
      }));
      await this.client.from('ticket_relations').insert(relations);
    }

    // Insert swarm actions
    if (ticketData.swarmActions && ticketData.swarmActions.length > 0) {
      const actions = ticketData.swarmActions.map(action => ({
        ticket_id: id,
        timestamp: action.timestamp || now,
        action: action.action,
        result: action.result || null
      }));
      await this.client.from('swarm_actions').insert(actions);
    }

    // Insert comments
    if (ticketData.comments && ticketData.comments.length > 0) {
      const comments = ticketData.comments.map(comment => ({
        id: comment.id || this.generateCommentId(),
        ticket_id: id,
        timestamp: comment.timestamp || now,
        type: comment.type || 'human',
        author: comment.author || 'anonymous',
        content: comment.content || '',
        metadata: comment.metadata || {}
      }));
      await this.client.from('comments').insert(comments);
    }

    return this.getTicket(id);
  }

  async updateTicket(id, updates) {
    const existing = await this.getTicket(id);
    if (!existing) return null;

    const now = new Date().toISOString();

    const updateData = { updated_at: now };
    if (updates.route !== undefined) updateData.route = updates.route;
    if (updates.f12Errors !== undefined) updateData.f12_errors = updates.f12Errors;
    if (updates.serverErrors !== undefined) updateData.server_errors = updates.serverErrors;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.namespace !== undefined) updateData.namespace = updates.namespace;

    const { error } = await this.client.from('tickets').update(updateData).eq('id', id);
    if (error) throw error;

    // Update related tickets if provided
    if (updates.relatedTickets !== undefined) {
      await this.client.from('ticket_relations').delete().eq('ticket_id', id);
      if (updates.relatedTickets.length > 0) {
        const relations = updates.relatedTickets.map(relatedId => ({
          ticket_id: id,
          related_ticket_id: relatedId
        }));
        await this.client.from('ticket_relations').insert(relations);
      }
    }

    return this.getTicket(id);
  }

  async deleteTicket(id) {
    const { error, count } = await this.client.from('tickets').delete().eq('id', id);
    if (error) throw error;
    return count > 0;
  }

  // ==================== SWARM ACTION OPERATIONS ====================

  async addSwarmAction(ticketId, action) {
    const ticket = await this.getTicket(ticketId);
    if (!ticket) return null;

    const now = new Date().toISOString();

    const { error } = await this.client.from('swarm_actions').insert({
      ticket_id: ticketId,
      timestamp: now,
      action: action.action,
      result: action.result || null
    });
    if (error) throw error;

    await this.client.from('tickets').update({ updated_at: now }).eq('id', ticketId);

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
      metadata: commentData.metadata || {}
    };

    const { error } = await this.client.from('comments').insert(comment);
    if (error) throw error;

    await this.client.from('tickets').update({ updated_at: now }).eq('id', ticketId);

    return {
      id: commentId,
      timestamp: now,
      type: comment.type,
      author: comment.author,
      content: comment.content,
      metadata: comment.metadata
    };
  }

  async getComments(ticketId) {
    const { data, error } = await this.client
      .from('comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('timestamp');

    if (error) throw error;

    return (data || []).map(c => ({
      id: c.id,
      timestamp: c.timestamp,
      type: c.type,
      author: c.author,
      content: c.content,
      metadata: c.metadata || {},
      editedAt: c.edited_at
    }));
  }

  async updateComment(ticketId, commentId, updates) {
    const { data: existing } = await this.client
      .from('comments')
      .select('*')
      .eq('id', commentId)
      .eq('ticket_id', ticketId)
      .single();

    if (!existing) return null;

    const now = new Date().toISOString();

    const updateData = { edited_at: now };
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.metadata !== undefined) updateData.metadata = { ...existing.metadata, ...updates.metadata };

    const { error } = await this.client
      .from('comments')
      .update(updateData)
      .eq('id', commentId)
      .eq('ticket_id', ticketId);

    if (error) throw error;

    await this.client.from('tickets').update({ updated_at: now }).eq('id', ticketId);

    const { data: updated } = await this.client
      .from('comments')
      .select('*')
      .eq('id', commentId)
      .single();

    return {
      id: updated.id,
      timestamp: updated.timestamp,
      type: updated.type,
      author: updated.author,
      content: updated.content,
      metadata: updated.metadata || {},
      editedAt: updated.edited_at
    };
  }

  async deleteComment(ticketId, commentId) {
    const { count, error } = await this.client
      .from('comments')
      .delete()
      .eq('id', commentId)
      .eq('ticket_id', ticketId);

    if (error) throw error;

    if (count > 0) {
      await this.client.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId);
      return true;
    }
    return false;
  }

  // ==================== STATS OPERATIONS ====================

  async getStats() {
    const { data: tickets, error } = await this.client.from('tickets').select('status, priority');
    if (error) throw error;

    const byStatus = { open: 0, inProgress: 0, fixed: 0, closed: 0 };
    const byPriority = { critical: 0, high: 0, medium: 0, low: 0 };

    (tickets || []).forEach(t => {
      if (t.status === 'in-progress') byStatus.inProgress++;
      else if (byStatus[t.status] !== undefined) byStatus[t.status]++;

      if (t.priority && byPriority[t.priority] !== undefined) {
        byPriority[t.priority]++;
      }
    });

    return {
      total: (tickets || []).length,
      byStatus,
      byPriority
    };
  }

  // ==================== BUG REPORT OPERATIONS ====================

  async createBugReport(reportData, apiKey = null) {
    // Validate API key if provided
    if (apiKey) {
      const { data: keyRecord } = await this.client
        .from('api_keys')
        .select('*')
        .eq('key', apiKey)
        .eq('enabled', true)
        .single();

      if (!keyRecord) {
        throw new Error('Invalid API key');
      }

      // Update last used
      await this.client.from('api_keys').update({ last_used: new Date().toISOString() }).eq('key', apiKey);
    }

    // Rate limiting
    const identifier = apiKey || reportData.ip || 'anonymous';
    const windowStart = new Date();
    windowStart.setMinutes(0, 0, 0);
    const windowKey = windowStart.toISOString();

    // Check current count
    const { data: rateLimit } = await this.client
      .from('rate_limits')
      .select('request_count')
      .eq('identifier', identifier)
      .eq('window_start', windowKey)
      .single();

    const limit = apiKey ? 1000 : 10;
    if (rateLimit && rateLimit.request_count >= limit) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    // Increment rate limit
    if (rateLimit) {
      await this.client
        .from('rate_limits')
        .update({ request_count: rateLimit.request_count + 1 })
        .eq('identifier', identifier)
        .eq('window_start', windowKey);
    } else {
      await this.client.from('rate_limits').insert({
        identifier,
        window_start: windowKey,
        request_count: 1
      });
    }

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
    const crypto = require('crypto');
    const key = 'stk_' + crypto.randomBytes(24).toString('hex');
    const now = new Date().toISOString();

    const { error } = await this.client.from('api_keys').insert({
      key,
      name,
      created_at: now
    });

    if (error) throw error;

    return { key, name, createdAt: now };
  }

  async listApiKeys() {
    const { data, error } = await this.client
      .from('api_keys')
      .select('id, name, created_at, last_used, enabled');

    if (error) throw error;
    return data || [];
  }

  async revokeApiKey(key) {
    const { count, error } = await this.client
      .from('api_keys')
      .update({ enabled: false })
      .eq('key', key);

    if (error) throw error;
    return count > 0;
  }
}

module.exports = SupabaseAdapter;
