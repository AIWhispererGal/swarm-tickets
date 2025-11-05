#!/usr/bin/env node

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3456;

// When installed as package, look for tickets.json in the project root (cwd)
// When run standalone, look in the same directory as the script
const projectRoot = process.cwd();
const TICKETS_FILE = path.join(projectRoot, 'tickets.json');
const BACKUP_DIR = path.join(projectRoot, 'ticket-backups');

// Serve static files from the package directory (where ticket-tracker.html is)
const packageDir = __dirname;

app.use(cors());
app.use(express.json());
app.use(express.static(projectRoot)); // Serve from project root first
app.use(express.static(packageDir));  // Fall back to package directory

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

// Initialize tickets file if it doesn't exist
async function initTicketsFile() {
    try {
        await fs.access(TICKETS_FILE);
    } catch {
        await fs.writeFile(TICKETS_FILE, JSON.stringify({ tickets: [] }, null, 2));
    }
    
    // Create backup directory
    try {
        await fs.mkdir(BACKUP_DIR, { recursive: true });
    } catch (error) {
        // Directory already exists, that's fine
    }
}

// Read tickets
async function readTickets() {
    try {
        const data = await fs.readFile(TICKETS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { tickets: [] };
    }
}

// Create backup before writing
async function createBackup() {
    try {
        // Check if tickets.json exists
        await fs.access(TICKETS_FILE);
        
        // Create timestamped backup in folder
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const timestampedBackup = path.join(BACKUP_DIR, `tickets-${timestamp}.json`);
        await fs.copyFile(TICKETS_FILE, timestampedBackup);
        
        // Rotate backups - keep last 10
        const files = await fs.readdir(BACKUP_DIR);
        const backupFiles = files
            .filter(f => f.startsWith('tickets-') && f.endsWith('.json'))
            .sort()
            .reverse();
        
        if (backupFiles.length > 10) {
            for (let i = 10; i < backupFiles.length; i++) {
                await fs.unlink(path.join(BACKUP_DIR, backupFiles[i]));
            }
        }
        
        console.log(`✅ Backup created: ${timestampedBackup}`);
    } catch (error) {
        console.warn('⚠️  Backup failed:', error.message);
    }
}

// Write tickets (with automatic backup)
async function writeTickets(data) {
    await createBackup();
    await fs.writeFile(TICKETS_FILE, JSON.stringify(data, null, 2));
}

// GET all tickets
app.get('/api/tickets', async (req, res) => {
    try {
        const data = await readTickets();
        res.json(data.tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET single ticket
app.get('/api/tickets/:id', async (req, res) => {
    try {
        const data = await readTickets();
        const ticket = data.tickets.find(t => t.id === req.params.id);
        if (ticket) {
            res.json(ticket);
        } else {
            res.status(404).json({ error: 'Ticket not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST new ticket
app.post('/api/tickets', async (req, res) => {
    try {
        const data = await readTickets();
        
        const ticket = {
            id: 'TKT-' + Date.now(),
            route: req.body.route,
            f12Errors: req.body.f12Errors || '',
            serverErrors: req.body.serverErrors || '',
            description: req.body.description || '',
            status: req.body.status || 'open',
            priority: req.body.priority || null,
            relatedTickets: req.body.relatedTickets || [],
            swarmActions: req.body.swarmActions || [],
            namespace: req.body.namespace || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        data.tickets.push(ticket);
        await writeTickets(data);
        
        res.status(201).json(ticket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PATCH update ticket
app.patch('/api/tickets/:id', async (req, res) => {
    try {
        const data = await readTickets();
        const ticketIndex = data.tickets.findIndex(t => t.id === req.params.id);
        
        if (ticketIndex === -1) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        // Update allowed fields
        const allowedFields = [
            'status', 'priority', 'relatedTickets', 'swarmActions', 
            'namespace', 'description', 'f12Errors', 'serverErrors'
        ];
        
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                data.tickets[ticketIndex][field] = req.body[field];
            }
        });
        
        data.tickets[ticketIndex].updatedAt = new Date().toISOString();
        
        await writeTickets(data);
        res.json(data.tickets[ticketIndex]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST add swarm action to ticket
app.post('/api/tickets/:id/swarm-action', async (req, res) => {
    try {
        const data = await readTickets();
        const ticket = data.tickets.find(t => t.id === req.params.id);
        
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        const action = {
            timestamp: new Date().toISOString(),
            action: req.body.action,
            result: req.body.result || null
        };
        
        ticket.swarmActions.push(action);
        ticket.updatedAt = new Date().toISOString();
        
        await writeTickets(data);
        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST analyze ticket with swarm (placeholder for swarm integration)
app.post('/api/tickets/:id/analyze', async (req, res) => {
    try {
        const data = await readTickets();
        const ticket = data.tickets.find(t => t.id === req.params.id);
        
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        // This is where you'd integrate with your swarm to analyze the ticket
        // For now, we'll do a simple analysis
        
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
        
        // Find related tickets (simple route-based matching)
        const relatedTickets = data.tickets
            .filter(t => t.id !== ticket.id && t.route === ticket.route)
            .map(t => t.id)
            .slice(0, 3);
        
        ticket.priority = priority;
        ticket.relatedTickets = relatedTickets;
        ticket.swarmActions.push({
            timestamp: new Date().toISOString(),
            action: 'auto-analysis',
            result: `Priority set to ${priority}, found ${relatedTickets.length} related tickets`
        });
        ticket.updatedAt = new Date().toISOString();
        
        await writeTickets(data);
        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE ticket
app.delete('/api/tickets/:id', async (req, res) => {
    try {
        const data = await readTickets();
        const ticketIndex = data.tickets.findIndex(t => t.id === req.params.id);
        
        if (ticketIndex === -1) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        data.tickets.splice(ticketIndex, 1);
        await writeTickets(data);
        
        res.json({ message: 'Ticket deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET stats
app.get('/api/stats', async (req, res) => {
    try {
        const data = await readTickets();
        const tickets = data.tickets;
        
        const stats = {
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
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Initialize and start server
initTicketsFile().then(async () => {
    const availablePort = await findAvailablePort(PORT);
    
    app.listen(availablePort, () => {
        console.log(`🎫 Ticket Tracker API running on http://localhost:${availablePort}`);
        console.log(`📊 Open http://localhost:${availablePort}/ticket-tracker.html to view the UI`);
        console.log(`📁 Tickets stored at: ${TICKETS_FILE}`);
        
        if (availablePort !== PORT) {
            console.log(`⚠️  Port ${PORT} was busy, using port ${availablePort} instead`);
        }
    });
});
