#!/bin/bash

# Ticket tracker backup script
# Keeps last 20 backups, rotates automatically

BACKUP_DIR="./ticket-backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if tickets.json exists
if [ ! -f "tickets.json" ]; then
    echo "❌ tickets.json not found"
    exit 1
fi

# Create backup
cp tickets.json "$BACKUP_DIR/tickets-$TIMESTAMP.json"

if [ $? -eq 0 ]; then
    echo "✅ Backup created: $BACKUP_DIR/tickets-$TIMESTAMP.json"
else
    echo "❌ Backup failed"
    exit 1
fi

# Keep only last 20 backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/tickets-*.json 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -gt 20 ]; then
    REMOVE_COUNT=$((BACKUP_COUNT - 20))
    ls -t "$BACKUP_DIR"/tickets-*.json | tail -n "$REMOVE_COUNT" | xargs rm
    echo "🗑️  Removed $REMOVE_COUNT old backup(s)"
fi

# Show backup count
FINAL_COUNT=$(ls -1 "$BACKUP_DIR"/tickets-*.json 2>/dev/null | wc -l)
echo "📦 Total backups: $FINAL_COUNT"
