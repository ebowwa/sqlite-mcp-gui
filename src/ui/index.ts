#!/usr/bin/env node
/**
 * Simple Web UI Server for SQLite
 * Basic Express server serving a single-page HTML interface
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

// Simple connection store (in-memory, single DB)
let db: Database.Database | null = null;
let currentDbPath: string | null = null;

// API: Connect to database
app.post('/api/connect', (req, res) => {
  try {
    const { dbPath } = req.body;
    if (!dbPath) {
      return res.status(400).json({ error: 'dbPath is required' });
    }

    // Close existing connection
    if (db) {
      db.close();
    }

    // Open new database
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    currentDbPath = dbPath;

    // Get table count
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all();

    res.json({
      success: true,
      database: dbPath,
      tables: tables.length,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// API: List tables
app.get('/api/tables', (req, res) => {
  try {
    if (!db) {
      return res.status(400).json({ error: 'Not connected to database' });
    }

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[];

    res.json({
      success: true,
      tables: tables.map((t) => t.name),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// API: Get table schema
app.get('/api/schema/:table', (req, res) => {
  try {
    if (!db) {
      return res.status(400).json({ error: 'Not connected to database' });
    }

    const tableName = req.params.table;
    const pragma = db.pragma(`table_info(${tableName})`) as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: unknown;
      pk: number;
    }>;

    res.json({
      success: true,
      table: tableName,
      columns: pragma.map((col) => ({
        name: col.name,
        type: col.type,
        nullable: col.notnull === 0,
        primaryKey: col.pk > 0,
        defaultValue: col.dflt_value,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// API: Execute query
app.post('/api/query', (req, res) => {
  try {
    if (!db) {
      return res.status(400).json({ error: 'Not connected to database' });
    }

    const { sql } = req.body;
    if (!sql) {
      return res.status(400).json({ error: 'sql is required' });
    }

    const trimmedSql = sql.trim().toUpperCase();
    const isSelect = trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA');

    const startTime = Date.now();

    if (isSelect) {
      const results = db.prepare(sql).all() as Record<string, unknown>[];
      const duration = Date.now() - startTime;

      res.json({
        success: true,
        rows: results.length,
        duration: `${duration}ms`,
        data: results,
      });
    } else {
      const result = db.prepare(sql).run();
      const duration = Date.now() - startTime;

      res.json({
        success: true,
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid,
        duration: `${duration}ms`,
      });
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    connected: !!db,
    database: currentDbPath,
  });
});

// Serve index.html for root
app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`SQLite MCP GUI running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});

// Cleanup
process.on('SIGINT', () => {
  if (db) {
    db.close();
  }
  process.exit(0);
});
