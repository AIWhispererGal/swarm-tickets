#!/usr/bin/env node
/**
 * Migration tool for swarm-tickets
 * Migrates tickets from JSON to SQLite or Supabase
 */

const fs = require('fs');
const path = require('path');

async function migrate(targetStorage, options = {}) {
  const projectRoot = process.cwd();
  const jsonPath = options.jsonPath || path.join(projectRoot, 'tickets.json');

  console.log('\n🔄 Swarm Tickets Migration Tool\n');

  // Validate target
  if (!['sqlite', 'supabase'].includes(targetStorage)) {
    console.error('❌ Invalid target. Use: sqlite or supabase');
    process.exit(1);
  }

  // Check JSON source exists
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Source file not found: ${jsonPath}`);
    console.error('   Make sure you have a tickets.json file to migrate from.');
    process.exit(1);
  }

  // Read source JSON
  console.log(`📖 Reading from: ${jsonPath}`);
  let sourceData;
  try {
    sourceData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (error) {
    console.error(`❌ Failed to read JSON: ${error.message}`);
    process.exit(1);
  }

  const tickets = sourceData.tickets || [];
  if (tickets.length === 0) {
    console.log('ℹ️  No tickets to migrate.');
    return;
  }

  console.log(`📋 Found ${tickets.length} tickets to migrate\n`);

  // Set up target storage
  const { createStorageAdapter } = require('./storage');

  // Override config for target
  const targetConfig = {
    type: targetStorage,
    sqlitePath: options.sqlitePath || path.join(projectRoot, 'tickets.db'),
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  };

  // Validate Supabase config
  if (targetStorage === 'supabase') {
    if (!targetConfig.supabaseUrl || !targetConfig.supabaseKey) {
      console.error('❌ Supabase migration requires environment variables:');
      console.error('   SUPABASE_URL=https://your-project.supabase.co');
      console.error('   SUPABASE_ANON_KEY=your-anon-key');
      console.error('   SUPABASE_SERVICE_ROLE_KEY=your-service-key (optional, for auto table creation)');
      process.exit(1);
    }
  }

  let targetAdapter;
  try {
    console.log(`🎯 Connecting to ${targetStorage}...`);
    targetAdapter = await createStorageAdapter(targetConfig);
    console.log(`✅ Connected to ${targetStorage}\n`);
  } catch (error) {
    console.error(`❌ Failed to connect to ${targetStorage}: ${error.message}`);
    if (targetStorage === 'sqlite') {
      console.error('   Make sure better-sqlite3 is installed: npm install better-sqlite3');
    } else {
      console.error('   Make sure @supabase/supabase-js is installed: npm install @supabase/supabase-js');
      console.error('   And that your environment variables are set correctly.');
    }
    process.exit(1);
  }

  // Migrate tickets
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const ticket of tickets) {
    process.stdout.write(`  Migrating ${ticket.id}... `);

    try {
      // Check if ticket already exists
      const existing = await targetAdapter.getTicket(ticket.id);
      if (existing) {
        console.log('⏭️  already exists, skipping');
        skipped++;
        continue;
      }

      // Create the ticket with original ID and timestamps
      await targetAdapter.createTicket({
        id: ticket.id,
        route: ticket.route || '',
        f12Errors: ticket.f12Errors || '',
        serverErrors: ticket.serverErrors || '',
        description: ticket.description || '',
        status: ticket.status || 'open',
        priority: ticket.priority || null,
        namespace: ticket.namespace || null,
        relatedTickets: ticket.relatedTickets || [],
        swarmActions: (ticket.swarmActions || []).map(a => {
          if (typeof a === 'string') {
            return { action: a, result: null, timestamp: ticket.createdAt };
          }
          return {
            action: a.action,
            result: a.result || null,
            timestamp: a.timestamp || ticket.createdAt
          };
        }),
        comments: (ticket.comments || []).map(c => ({
          id: c.id,
          type: c.type || 'human',
          author: c.author || 'anonymous',
          content: c.content || '',
          metadata: c.metadata || {},
          timestamp: c.timestamp
        })),
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      });

      console.log('✅');
      migrated++;
    } catch (error) {
      console.log(`❌ ${error.message}`);
      failed++;
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(40));
  console.log('📊 Migration Summary:');
  console.log(`   ✅ Migrated: ${migrated}`);
  console.log(`   ⏭️  Skipped:  ${skipped}`);
  console.log(`   ❌ Failed:   ${failed}`);
  console.log('─'.repeat(40));

  if (migrated > 0) {
    console.log(`\n🎉 Migration complete!`);
    console.log(`\nTo use ${targetStorage} storage, start the server with:`);
    if (targetStorage === 'sqlite') {
      console.log('   export SWARM_TICKETS_STORAGE=sqlite');
      console.log('   npx swarm-tickets');
    } else {
      console.log('   export SWARM_TICKETS_STORAGE=supabase');
      console.log('   npx swarm-tickets');
    }
  }

  console.log(`\n💡 Tip: Your original tickets.json is unchanged.`);
  console.log(`   You can rename it to tickets.json.backup once migration looks good.`);
  console.log('');
}

module.exports = { migrate };
