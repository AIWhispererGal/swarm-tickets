/**
 * Storage Adapter Factory
 * Supports JSON, SQLite, and Supabase backends
 */

const JsonAdapter = require('./json-adapter');
const SqliteAdapter = require('./sqlite-adapter');
const SupabaseAdapter = require('./supabase-adapter');

/**
 * Get storage configuration from environment or config file
 */
function getStorageConfig() {
  // Check environment variables first
  const storageType = process.env.SWARM_TICKETS_STORAGE || 'json';

  const config = {
    type: storageType,
    // JSON options
    jsonPath: process.env.SWARM_TICKETS_JSON_PATH || './tickets.json',
    backupDir: process.env.SWARM_TICKETS_BACKUP_DIR || './ticket-backups',

    // SQLite options
    sqlitePath: process.env.SWARM_TICKETS_SQLITE_PATH || './tickets.db',

    // Supabase options
    supabaseUrl: process.env.SUPABASE_URL || process.env.SWARM_TICKETS_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_ANON_KEY || process.env.SWARM_TICKETS_SUPABASE_KEY,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SWARM_TICKETS_SUPABASE_SERVICE_KEY,
  };

  return config;
}

/**
 * Create storage adapter based on configuration
 * @param {Object} overrideConfig - Optional config override
 * @returns {Promise<BaseAdapter>} Storage adapter instance
 */
async function createStorageAdapter(overrideConfig = null) {
  const config = overrideConfig || getStorageConfig();

  let adapter;

  switch (config.type.toLowerCase()) {
    case 'sqlite':
      adapter = new SqliteAdapter(config);
      break;

    case 'supabase':
      if (!config.supabaseUrl || !config.supabaseKey) {
        throw new Error(
          'Supabase configuration missing. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.'
        );
      }
      adapter = new SupabaseAdapter(config);
      break;

    case 'json':
    default:
      adapter = new JsonAdapter(config);
      break;
  }

  // Initialize the adapter (create tables, etc.)
  await adapter.initialize();

  return adapter;
}

/**
 * Storage type constants
 */
const StorageType = {
  JSON: 'json',
  SQLITE: 'sqlite',
  SUPABASE: 'supabase'
};

module.exports = {
  createStorageAdapter,
  getStorageConfig,
  StorageType,
  JsonAdapter,
  SqliteAdapter,
  SupabaseAdapter
};
