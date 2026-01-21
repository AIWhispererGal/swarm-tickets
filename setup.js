#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

console.log('\n🎫 Setting up Swarm Tickets...\n');

// Get the project root - use INIT_CWD during npm install, fallback to cwd for manual runs
const projectRoot = process.env.INIT_CWD || process.cwd();

// Create .claude/skills/swarm-tickets directory
const skillsDir = path.join(projectRoot, '.claude', 'skills', 'swarm-tickets');

try {
  // Create directories
  fs.mkdirSync(skillsDir, { recursive: true });
  console.log('✅ Created .claude/skills/swarm-tickets/');
  
  // Copy SKILL.md to the skills directory
  const skillSource = path.join(__dirname, 'SKILL.md');
  const skillDest = path.join(skillsDir, 'SKILL.md');
  
  if (fs.existsSync(skillSource)) {
    fs.copyFileSync(skillSource, skillDest);
    console.log('✅ Installed swarm skill');
  }
  
  // Copy ticket-tracker.html to project root (always update to get latest features)
  const htmlSource = path.join(__dirname, 'ticket-tracker.html');
  const htmlDest = path.join(projectRoot, 'ticket-tracker.html');

  const htmlExists = fs.existsSync(htmlDest);
  fs.copyFileSync(htmlSource, htmlDest);
  console.log(htmlExists
    ? '✅ Updated ticket-tracker.html to latest version'
    : '✅ Copied ticket-tracker.html to project root');
  
  // Create tickets.json if it doesn't exist
  const ticketsFile = path.join(projectRoot, 'tickets.json');
  
  if (!fs.existsSync(ticketsFile)) {
    fs.writeFileSync(ticketsFile, JSON.stringify({ tickets: [] }, null, 2));
    console.log('✅ Created tickets.json');
  }
  
  console.log('\n🎉 Setup complete!\n');
  console.log('To start the ticket tracker:');
  console.log('  npx swarm-tickets\n');
  console.log('Then open: http://localhost:3456/ticket-tracker.html\n');
  console.log('The swarm can now access tickets via ./tickets.json');
  console.log('Skill documentation: .claude/skills/swarm-tickets/SKILL.md\n');
  console.log('📝 Note: Add these to your .gitignore if you don\'t want to commit tickets:');
  console.log('  tickets.json');
  console.log('  ticket-backups/\n');
} catch (error) {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
}
