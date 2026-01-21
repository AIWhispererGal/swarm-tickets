/**
 * JSON File Storage Adapter
 * Backwards-compatible with existing tickets.json format
 */

const fs = require('fs').promises;
const path = require('path');
const BaseAdapter = require('./base-adapter');

class JsonAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.ticketsPath = path.resolve(config.jsonPath || './tickets.json');
    this.backupDir = path.resolve(config.backupDir || './ticket-backups');
    this.data = { tickets: [] };
  }

  async initialize() {
    // Create backup directory
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      // Directory may already exist
    }

    // Load existing data or create new file
    try {
      const content = await fs.readFile(this.ticketsPath, 'utf8');
      this.data = JSON.parse(content);
      // Ensure tickets array exists
      if (!this.data.tickets) {
        this.data.tickets = [];
      }
      // Migrate: add comments array to existing tickets
      this.data.tickets = this.data.tickets.map(ticket => ({
        ...ticket,
        comments: ticket.comments || []
      }));
    } catch (error) {
      // File doesn't exist, create empty structure
      this.data = { tickets: [] };
      await this._save();
    }
  }

  async close() {
    // No connection to close for file-based storage
  }

  async _save() {
    await this.createBackup();
    await fs.writeFile(this.ticketsPath, JSON.stringify(this.data, null, 2));
  }

  async createBackup() {
    try {
      await fs.access(this.ticketsPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `tickets-${timestamp}.json`);
      await fs.copyFile(this.ticketsPath, backupPath);

      // Rotate backups - keep last 10
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(f => f.startsWith('tickets-') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (backupFiles.length > 10) {
        for (let i = 10; i < backupFiles.length; i++) {
          await fs.unlink(path.join(this.backupDir, backupFiles[i]));
        }
      }

      return backupPath;
    } catch (error) {
      return null;
    }
  }

  // ==================== TICKET OPERATIONS ====================

  async getAllTickets(filters = {}) {
    let tickets = [...this.data.tickets];

    if (filters.status) {
      tickets = tickets.filter(t => t.status === filters.status);
    }
    if (filters.excludeStatus) {
      tickets = tickets.filter(t => t.status !== filters.excludeStatus);
    }
    if (filters.priority) {
      tickets = tickets.filter(t => t.priority === filters.priority);
    }
    if (filters.route) {
      tickets = tickets.filter(t => t.route && t.route.includes(filters.route));
    }

    return tickets;
  }

  async getTicket(id) {
    return this.data.tickets.find(t => t.id === id) || null;
  }

  async createTicket(ticketData) {
    const ticket = {
      id: this.generateTicketId(),
      route: ticketData.route || '',
      f12Errors: ticketData.f12Errors || '',
      serverErrors: ticketData.serverErrors || '',
      description: ticketData.description || '',
      status: ticketData.status || 'open',
      priority: ticketData.priority || null,
      relatedTickets: ticketData.relatedTickets || [],
      swarmActions: ticketData.swarmActions || [],
      comments: ticketData.comments || [],
      namespace: ticketData.namespace || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.tickets.push(ticket);
    await this._save();

    return ticket;
  }

  async updateTicket(id, updates) {
    const ticketIndex = this.data.tickets.findIndex(t => t.id === id);
    if (ticketIndex === -1) return null;

    const allowedFields = [
      'status', 'priority', 'relatedTickets', 'swarmActions',
      'namespace', 'description', 'f12Errors', 'serverErrors', 'route', 'comments'
    ];

    const ticket = this.data.tickets[ticketIndex];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        ticket[field] = updates[field];
      }
    });

    ticket.updatedAt = new Date().toISOString();
    await this._save();

    return ticket;
  }

  async deleteTicket(id) {
    const ticketIndex = this.data.tickets.findIndex(t => t.id === id);
    if (ticketIndex === -1) return false;

    this.data.tickets.splice(ticketIndex, 1);
    await this._save();

    return true;
  }

  // ==================== SWARM ACTION OPERATIONS ====================

  async addSwarmAction(ticketId, action) {
    const ticket = await this.getTicket(ticketId);
    if (!ticket) return null;

    const swarmAction = {
      timestamp: new Date().toISOString(),
      action: action.action,
      result: action.result || null
    };

    ticket.swarmActions.push(swarmAction);
    ticket.updatedAt = new Date().toISOString();

    await this._save();
    return ticket;
  }

  // ==================== COMMENT OPERATIONS ====================

  async addComment(ticketId, commentData) {
    const ticket = await this.getTicket(ticketId);
    if (!ticket) return null;

    // Ensure comments array exists
    if (!ticket.comments) {
      ticket.comments = [];
    }

    const comment = {
      id: this.generateCommentId(),
      timestamp: new Date().toISOString(),
      type: commentData.type || 'human', // 'human' or 'ai'
      author: commentData.author || 'anonymous',
      content: commentData.content || '',
      metadata: commentData.metadata || {}
    };

    ticket.comments.push(comment);
    ticket.updatedAt = new Date().toISOString();

    await this._save();
    return comment;
  }

  async getComments(ticketId) {
    const ticket = await this.getTicket(ticketId);
    if (!ticket) return [];
    return ticket.comments || [];
  }

  async updateComment(ticketId, commentId, updates) {
    const ticket = await this.getTicket(ticketId);
    if (!ticket || !ticket.comments) return null;

    const commentIndex = ticket.comments.findIndex(c => c.id === commentId);
    if (commentIndex === -1) return null;

    const comment = ticket.comments[commentIndex];
    if (updates.content !== undefined) comment.content = updates.content;
    if (updates.metadata !== undefined) comment.metadata = { ...comment.metadata, ...updates.metadata };
    comment.editedAt = new Date().toISOString();

    ticket.updatedAt = new Date().toISOString();
    await this._save();

    return comment;
  }

  async deleteComment(ticketId, commentId) {
    const ticket = await this.getTicket(ticketId);
    if (!ticket || !ticket.comments) return false;

    const commentIndex = ticket.comments.findIndex(c => c.id === commentId);
    if (commentIndex === -1) return false;

    ticket.comments.splice(commentIndex, 1);
    ticket.updatedAt = new Date().toISOString();
    await this._save();

    return true;
  }

  // ==================== STATS OPERATIONS ====================

  async getStats() {
    const tickets = this.data.tickets;

    return {
      total: tickets.length,
      byStatus: {
        open: tickets.filter(t => t.status === 'open').length,
        inProgress: tickets.filter(t => t.status === 'in-progress').length,
        fixed: tickets.filter(t => t.status === 'fixed').length,
        closed: tickets.filter(t => t.status === 'closed').length
      },
      byPriority: {
        critical: tickets.filter(t => t.priority === 'critical').length,
        high: tickets.filter(t => t.priority === 'high').length,
        medium: tickets.filter(t => t.priority === 'medium').length,
        low: tickets.filter(t => t.priority === 'low').length
      }
    };
  }

  // ==================== BUG REPORT OPERATIONS ====================

  async createBugReport(reportData, apiKey = null) {
    // For JSON adapter, we don't validate API keys (simple mode)
    // Create a minimal ticket from the bug report
    const ticket = await this.createTicket({
      route: reportData.location || reportData.route || 'unknown',
      f12Errors: reportData.clientError || reportData.f12Errors || '',
      serverErrors: '', // Bug reports don't include server errors
      description: reportData.description || '',
      status: 'open',
      priority: null, // Will be set by triage
      swarmActions: [{
        timestamp: new Date().toISOString(),
        action: 'bug-report-submitted',
        result: `Bug report submitted via widget. User agent: ${reportData.userAgent || 'unknown'}`
      }]
    });

    // Return limited info (don't expose internal ticket structure)
    return {
      id: ticket.id,
      status: 'submitted',
      message: 'Bug report received. Thank you!'
    };
  }
}

module.exports = JsonAdapter;
