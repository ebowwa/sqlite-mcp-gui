import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// API endpoint to execute SQL queries
app.post('/api/query', async (req, res) => {
  try {
    const { dbPath, sql } = req.body;

    if (!dbPath || !sql) {
      return res.status(400).json({ error: 'dbPath and sql are required' });
    }

    // For now, we'll use a simple SQLite approach
    // In a full implementation, this would use the MCP server
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

// API endpoint to get tables
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

// API endpoint to get table schema
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

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SQLite GUI Server running at http://localhost:${PORT}`);
});
