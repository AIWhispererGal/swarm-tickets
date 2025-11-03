#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');

const TICKETS_FILE = path.join(__dirname, 'tickets.json');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function readTickets() {
    try {
        const data = await fs.readFile(TICKETS_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return { tickets: [] };
    }
}

async function writeTickets(data) {
    await fs.writeFile(TICKETS_FILE, JSON.stringify(data, null, 2));
}

async function createTicket() {
    console.log('\n🎫 Create New Ticket\n');
    
    const route = await question('Route/Webpage: ');
    
    console.log('\nPaste F12 Console Errors (press Enter twice when done):');
    let f12Errors = '';
    let line;
    while ((line = await question('')) !== '') {
        f12Errors += line + '\n';
    }
    
    console.log('\nPaste Server Console Errors (press Enter twice when done):');
    let serverErrors = '';
    while ((line = await question('')) !== '') {
        serverErrors += line + '\n';
    }
    
    const description = await question('\nDescription (optional): ');
    
    const ticket = {
        id: 'TKT-' + Date.now(),
        route: route,
        f12Errors: f12Errors.trim(),
        serverErrors: serverErrors.trim(),
        description: description,
        status: 'open',
        priority: null,
        relatedTickets: [],
        swarmActions: [],
        namespace: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    const data = await readTickets();
    data.tickets.push(ticket);
    await writeTickets(data);
    
    console.log(`\n✅ Ticket created: ${ticket.id}\n`);
    rl.close();
}

async function listTickets() {
    const data = await readTickets();
    
    if (data.tickets.length === 0) {
        console.log('No tickets found.');
        rl.close();
        return;
    }
    
    console.log(`\n📋 Total Tickets: ${data.tickets.length}\n`);
    
    data.tickets
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .forEach(ticket => {
            console.log(`${ticket.id} - ${ticket.status.toUpperCase()}`);
            console.log(`  Route: ${ticket.route}`);
            if (ticket.priority) console.log(`  Priority: ${ticket.priority}`);
            console.log(`  Created: ${new Date(ticket.createdAt).toLocaleString()}`);
            console.log('');
        });
    
    rl.close();
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args[0] === 'list' || args[0] === 'ls') {
        await listTickets();
    } else if (args[0] === 'create' || args[0] === 'new' || args.length === 0) {
        await createTicket();
    } else {
        console.log('Usage:');
        console.log('  node ticket-cli.js          - Create a new ticket');
        console.log('  node ticket-cli.js create   - Create a new ticket');
        console.log('  node ticket-cli.js list     - List all tickets');
        rl.close();
    }
}

main().catch(error => {
    console.error('Error:', error);
    rl.close();
    process.exit(1);
});
