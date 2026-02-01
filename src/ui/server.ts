/**
 * SQLite GUI Web Server
 *
 * Express server providing a web interface for SQLite database operations.
 *
 * @module ui/server
 */

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

/**
 * POST /api/query - Execute SQL queries
 * @param {Object} req.body - Request body
 * @param {string} req.body.dbPath - Path to database
 * @param {string} req.body.sql - SQL query
 */
app.post('/api/query', async (req, res) => {
  try {
    const { dbPath, sql } = req.body;
    if (!dbPath || !sql) {
      return res.status(400).json({ error: 'dbPath and sql are required' });
    }
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);
    const trimmedSql = sql.trim().toUpperCase();
    if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA')) {
      const stmt = db.prepare(sql);
      const rows = stmt.all();
      res.json({ success: true, rows, rowCount: rows.length });
    } else {
      db.exec(sql);
      const changesStmt = db.prepare('SELECT changes() as changes');
      const { changes } = changesStmt.get() as { changes: number };
      res.json({ success: true, changes, message: 'Query executed successfully' });
    }
    db.close();
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/tables - List all tables
 */
app.post('/api/tables', async (req, res) => {
  try {
    const { dbPath } = req.body;
    if (!dbPath) {
      return res.status(400).json({ error: 'dbPath is required' });
    }
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);
    const stmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tables = stmt.all() as Array<{ name: string }>;
    res.json({ success: true, tables: tables.map((t) => t.name) });
    db.close();
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/schema - Get table schema
 */
app.post('/api/schema', async (req, res) => {
  try {
    const { dbPath, tableName } = req.body;
    if (!dbPath || !tableName) {
      return res.status(400).json({ error: 'dbPath and tableName are required' });
    }
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);
    const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
    const columns = stmt.all();
    res.json({ success: true, table: tableName, columns });
    db.close();
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET / - Serve main application page
 */
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log(`SQLite GUI Server running at http://localhost:${PORT}`);
});
