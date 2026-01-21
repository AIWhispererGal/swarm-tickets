/**
 * Base Storage Adapter
 * Abstract class defining the interface for all storage backends
 */

class BaseAdapter {
  constructor(config) {
    this.config = config;
    if (new.target === BaseAdapter) {
      throw new Error('BaseAdapter is abstract and cannot be instantiated directly');
    }
  }

  /**
   * Initialize the storage (create tables, files, etc.)
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('initialize() must be implemented');
  }

  /**
   * Close the storage connection
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('close() must be implemented');
  }

  // ==================== TICKET OPERATIONS ====================

  /**
   * Get all tickets
   * @param {Object} filters - Optional filters (status, priority, route)
   * @returns {Promise<Array>} Array of tickets
   */
  async getAllTickets(filters = {}) {
    throw new Error('getAllTickets() must be implemented');
  }

  /**
   * Get a single ticket by ID
   * @param {string} id - Ticket ID
   * @returns {Promise<Object|null>} Ticket or null if not found
   */
  async getTicket(id) {
    throw new Error('getTicket() must be implemented');
  }

  /**
   * Create a new ticket
   * @param {Object} ticketData - Ticket data
   * @returns {Promise<Object>} Created ticket with ID
   */
  async createTicket(ticketData) {
    throw new Error('createTicket() must be implemented');
  }

  /**
   * Update a ticket
   * @param {string} id - Ticket ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated ticket or null if not found
   */
  async updateTicket(id, updates) {
    throw new Error('updateTicket() must be implemented');
  }

  /**
   * Delete a ticket
   * @param {string} id - Ticket ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteTicket(id) {
    throw new Error('deleteTicket() must be implemented');
  }

  // ==================== SWARM ACTION OPERATIONS ====================

  /**
   * Add a swarm action to a ticket
   * @param {string} ticketId - Ticket ID
   * @param {Object} action - Action data (action, result)
   * @returns {Promise<Object>} Updated ticket
   */
  async addSwarmAction(ticketId, action) {
    throw new Error('addSwarmAction() must be implemented');
  }

  // ==================== COMMENT OPERATIONS ====================

  /**
   * Add a comment to a ticket
   * @param {string} ticketId - Ticket ID
   * @param {Object} comment - Comment data (author, content, type)
   * @returns {Promise<Object>} Created comment
   */
  async addComment(ticketId, comment) {
    throw new Error('addComment() must be implemented');
  }

  /**
   * Get all comments for a ticket
   * @param {string} ticketId - Ticket ID
   * @returns {Promise<Array>} Array of comments
   */
  async getComments(ticketId) {
    throw new Error('getComments() must be implemented');
  }

  /**
   * Update a comment
   * @param {string} ticketId - Ticket ID
   * @param {string} commentId - Comment ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated comment or null
   */
  async updateComment(ticketId, commentId, updates) {
    throw new Error('updateComment() must be implemented');
  }

  /**
   * Delete a comment
   * @param {string} ticketId - Ticket ID
   * @param {string} commentId - Comment ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteComment(ticketId, commentId) {
    throw new Error('deleteComment() must be implemented');
  }

  // ==================== STATS OPERATIONS ====================

  /**
   * Get ticket statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getStats() {
    throw new Error('getStats() must be implemented');
  }

  // ==================== BUG REPORT OPERATIONS ====================

  /**
   * Create a bug report (limited access endpoint)
   * @param {Object} reportData - Bug report data
   * @param {string} apiKey - Optional API key for validation
   * @returns {Promise<Object>} Created ticket (limited info)
   */
  async createBugReport(reportData, apiKey = null) {
    throw new Error('createBugReport() must be implemented');
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Generate a unique ticket ID
   * @returns {string} Ticket ID
   */
  generateTicketId() {
    return 'TKT-' + Date.now();
  }

  /**
   * Generate a unique comment ID
   * @returns {string} Comment ID
   */
  generateCommentId() {
    return 'CMT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Validate ticket status
   * @param {string} status - Status to validate
   * @returns {boolean} True if valid
   */
  isValidStatus(status) {
    return ['open', 'in-progress', 'fixed', 'closed'].includes(status);
  }

  /**
   * Validate ticket priority
   * @param {string} priority - Priority to validate
   * @returns {boolean} True if valid
   */
  isValidPriority(priority) {
    return ['critical', 'high', 'medium', 'low'].includes(priority);
  }

  /**
   * Create a backup (if supported)
   * @returns {Promise<string|null>} Backup path or null
   */
  async createBackup() {
    // Default: no backup support
    return null;
  }
}

module.exports = BaseAdapter;
