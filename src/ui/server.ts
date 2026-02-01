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
import { createWebSocketServer, WebSocketServer } from '../websocket/server.js';

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const WS_ENABLED = process.env.WS_ENABLED !== 'false'; // Enable by default
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);

// WebSocket server instance
let wsServer: WebSocketServer | null = null;

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

/**
 * POST /api/query - Execute SQL queries with streaming support
 * @param {Object} req.body - Request body
 * @param {string} req.body.dbPath - Path to database
 * @param {string} req.body.sql - SQL query
 * @param {boolean} req.body.stream - Enable streaming for large results
 */
app.post('/api/query', async (req, res) => {
  const { dbPath, sql, stream = false } = req.body;
  const queryId = `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  try {
    if (!dbPath || !sql) {
      return res.status(400).json({ error: 'dbPath and sql are required' });
    }

    // Notify query started via WebSocket
    if (wsServer) {
      wsServer.notifyQueryStarted({
        queryId,
        sql,
        dbPath,
      });
    }

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);
    const trimmedSql = sql.trim().toUpperCase();

    if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA')) {
      const stmt = db.prepare(sql);

      if (stream && wsServer) {
        // Stream results in chunks
        const CHUNK_SIZE = 1000;
        let rows: any[] = [];
        let rowCount = 0;

        try {
          for (const row of stmt.iterate()) {
            rows.push(row);
            rowCount++;

            if (rows.length >= CHUNK_SIZE) {
              const progress = Math.min(50, Math.floor((rowCount / 10000) * 50));
              wsServer.notifyQueryProgress({
                queryId,
                progress,
                rowsProcessed: rowCount,
              });

              // Send chunk to client
              res.write(JSON.stringify({
                type: 'chunk',
                queryId,
                data: { rows: [...rows], rowCount: rows.length },
              }) + '\n');

              rows = [];
            }
          }

          // Send remaining rows
          if (rows.length > 0) {
            res.write(JSON.stringify({
              type: 'chunk',
              queryId,
              data: { rows: [...rows], rowCount: rows.length },
            }) + '\n');
          }

          const executionTime = Date.now() - startTime;

          // Notify query complete via WebSocket
          wsServer.notifyQueryProgress({
            queryId,
            progress: 100,
            rowsProcessed: rowCount,
          });

          wsServer.notifyQueryComplete({
            queryId,
            rows: [],
            rowCount,
            executionTime,
          });

          res.write(JSON.stringify({
            type: 'complete',
            queryId,
            data: { success: true, rowCount, executionTime },
          }) + '\n');
          res.end();
        } catch (streamError) {
          const error = streamError instanceof Error ? streamError.message : String(streamError);
          wsServer.notifyQueryError({
            queryId,
            error,
          });
          throw streamError;
        }
      } else {
        // Non-streaming query
        const rows = stmt.all();
        const executionTime = Date.now() - startTime;

        res.json({ success: true, rows, rowCount: rows.length, executionTime });

        // Notify query complete via WebSocket
        if (wsServer) {
          wsServer.notifyQueryComplete({
            queryId,
            rows,
            rowCount: rows.length,
            executionTime,
          });
        }
      }
    } else {
      // Execute non-query statement (INSERT, UPDATE, DELETE, CREATE, etc.)
      db.exec(sql);

      // Detect table changes
      const upperSql = trimmedSql;
      if (upperSql.includes('CREATE TABLE')) {
        const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?/i);
        if (match && wsServer) {
          wsServer.notifyTableCreated({
            tableName: match[1],
            dbPath,
            timestamp: Date.now(),
          });
        }
      } else if (upperSql.includes('DROP TABLE')) {
        const match = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["'`]?(\w+)["'`]?/i);
        if (match && wsServer) {
          wsServer.notifyTableDropped({
            tableName: match[1],
            dbPath,
            timestamp: Date.now(),
          });
        }
      } else if (upperSql.includes('ALTER TABLE')) {
        const match = sql.match(/ALTER\s+TABLE\s+["'`]?(\w+)["'`]?/i);
        if (match && wsServer) {
          wsServer.notifyTableModified({
            tableName: match[1],
            dbPath,
            timestamp: Date.now(),
          });
        }
      }

      const changesStmt = db.prepare('SELECT changes() as changes');
      const { changes } = changesStmt.get() as { changes: number };

      res.json({ success: true, changes, message: 'Query executed successfully' });
    }

    db.close();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Notify query error via WebSocket
    if (wsServer) {
      wsServer.notifyQueryError({
        queryId,
        error: errorMessage,
      });
    }

    res.status(500).json({
      error: errorMessage,
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
 * POST /api/compare/schema - Compare schemas between two databases
 */
app.post('/api/compare/schema', async (req, res) => {
  try {
    const { dbPath1, dbPath2 } = req.body;
    if (!dbPath1 || !dbPath2) {
      return res.status(400).json({ error: 'dbPath1 and dbPath2 are required' });
    }
    const Database = (await import('better-sqlite3')).default;
    const db1 = new Database(dbPath1);
    const db2 = new Database(dbPath2);

    // Get all tables from both databases
    const tables1Stmt = db1.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tables2Stmt = db2.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tables1 = tables1Stmt.all() as Array<{ name: string; sql: string }>;
    const tables2 = tables2Stmt.all() as Array<{ name: string; sql: string }>;

    const tableNames1 = new Set(tables1.map(t => t.name));
    const tableNames2 = new Set(tables2.map(t => t.name));

    const addedTables = [...tableNames2].filter(name => !tableNames1.has(name));
    const removedTables = [...tableNames1].filter(name => !tableNames2.has(name));
    const commonTables = [...tableNames1].filter(name => tableNames2.has(name));

    const modifiedTables: Array<{ name: string; changes: any }> = [];

    for (const tableName of commonTables) {
      const table1 = tables1.find(t => t.name === tableName)!;
      const table2 = tables2.find(t => t.name === tableName)!;

      const columns1Stmt = db1.prepare(`PRAGMA table_info(${tableName})`);
      const columns2Stmt = db2.prepare(`PRAGMA table_info(${tableName})`);
      const columns1 = columns1Stmt.all() as Array<any>;
      const columns2 = columns2Stmt.all() as Array<any>;

      const indexList1Stmt = db1.prepare(`PRAGMA index_list(${tableName})`);
      const indexList2Stmt = db2.prepare(`PRAGMA index_list(${tableName})`);
      const indexes1 = indexList1Stmt.all() as Array<any>;
      const indexes2 = indexList2Stmt.all() as Array<any>;

      const fk1Stmt = db1.prepare(`PRAGMA foreign_key_list(${tableName})`);
      const fk2Stmt = db2.prepare(`PRAGMA foreign_key_list(${tableName})`);
      const foreignKeys1 = fk1Stmt.all() as Array<any>;
      const foreignKeys2 = fk2Stmt.all() as Array<any>;

      const changes: any = { columns: { added: [], removed: [], modified: [] }, indexes: { added: [], removed: [], modified: [] }, foreignKeys: { added: [], removed: [] } };

      const colNames1 = new Map(columns1.map(c => [c.name, c]));
      const colNames2 = new Map(columns2.map(c => [c.name, c]));

      for (const col of columns1) {
        if (!colNames2.has(col.name)) {
          changes.columns.removed.push(col);
        } else {
          const col2 = colNames2.get(col.name);
          if (col.type !== col2.type || col.notnull !== col2.notnull || col.dflt_value !== col2.dflt_value || col.pk !== col2.pk) {
            changes.columns.modified.push({ name: col.name, inDb1: col, inDb2: col2 });
          }
        }
      }

      for (const col of columns2) {
        if (!colNames1.has(col.name)) {
          changes.columns.added.push(col);
        }
      }

      const idxNames1 = new Map(indexes1.map(i => [i.name, i]));
      const idxNames2 = new Map(indexes2.map(i => [i.name, i]));

      for (const idx of indexes1) {
        if (!idxNames2.has(idx.name)) {
          changes.indexes.removed.push(idx);
        } else {
          const idx2 = idxNames2.get(idx.name);
          const idxInfo1Stmt = db1.prepare(`PRAGMA index_info(${idx.name})`);
          const idxInfo2Stmt = db2.prepare(`PRAGMA index_info(${idx.name})`);
          const idxInfo1 = idxInfo1Stmt.all() as Array<any>;
          const idxInfo2 = idxInfo2Stmt.all() as Array<any>;

          if (idx.unique !== idx2.unique || JSON.stringify(idxInfo1) !== JSON.stringify(idxInfo2)) {
            changes.indexes.modified.push({ name: idx.name, inDb1: idx, inDb2: idx2 });
          }
        }
      }

      for (const idx of indexes2) {
        if (!idxNames1.has(idx.name)) {
          changes.indexes.added.push(idx);
        }
      }

      const fkMap1 = new Map(foreignKeys1.map((fk, i) => [`${fk.table}_${fk.from}_${i}`, fk]));
      const fkMap2 = new Map(foreignKeys2.map((fk, i) => [`${fk.table}_${fk.from}_${i}`, fk]));

      for (const [key, fk] of fkMap1) {
        if (!fkMap2.has(key)) {
          changes.foreignKeys.removed.push(fk);
        }
      }

      for (const [key, fk] of fkMap2) {
        if (!fkMap1.has(key)) {
          changes.foreignKeys.added.push(fk);
        }
      }

      if (changes.columns.added.length > 0 || changes.columns.removed.length > 0 || changes.columns.modified.length > 0 ||
          changes.indexes.added.length > 0 || changes.indexes.removed.length > 0 || changes.indexes.modified.length > 0 ||
          changes.foreignKeys.added.length > 0 || changes.foreignKeys.removed.length > 0) {
        modifiedTables.push({ name: tableName, changes });
      }
    }

    res.json({
      success: true,
      schemaDiff: {
        addedTables,
        removedTables,
        modifiedTables,
        commonTables
      }
    });

    db1.close();
    db2.close();
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/compare/data - Compare data between two databases
 */
app.post('/api/compare/data', async (req, res) => {
  try {
    const { dbPath1, dbPath2, tables, useChecksums = false } = req.body;
    if (!dbPath1 || !dbPath2) {
      return res.status(400).json({ error: 'dbPath1 and dbPath2 are required' });
    }
    const Database = (await import('better-sqlite3')).default;
    const db1 = new Database(dbPath1);
    const db2 = new Database(dbPath2);

    const tablesToCompare = tables || [];

    const dataDiff: any = { tables: {} };

    for (const tableName of tablesToCompare) {
      const count1Stmt = db1.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
      const count2Stmt = db2.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);

      const count1 = count1Stmt.get() as { count: number };
      const count2 = count2Stmt.get() as { count: number };

      const tableDiff: any = {
        rowCount: { db1: count1.count, db2: count2.count },
        difference: count2.count - count1.count,
        checksum: null
      };

      if (useChecksums) {
        const checksum1Stmt = db1.prepare(`SELECT md5_groupconcat(*) as checksum FROM (SELECT * FROM ${tableName} ORDER BY rowid)`);
        const checksum2Stmt = db2.prepare(`SELECT md5_groupconcat(*) as checksum FROM (SELECT * FROM ${tableName} ORDER BY rowid)`);

        try {
          const checksum1 = checksum1Stmt.get() as any;
          const checksum2 = checksum2Stmt.get() as any;
          tableDiff.checksum = { db1: checksum1?.checksum || null, db2: checksum2?.checksum || null };
          tableDiff.checksumMatch = tableDiff.checksum.db1 === tableDiff.checksum.db2;
        } catch (e) {
          tableDiff.checksumError = 'Checksum comparison not available';
        }
      }

      dataDiff.tables[tableName] = tableDiff;
    }

    res.json({ success: true, dataDiff });

    db1.close();
    db2.close();
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/compare/generate-sync - Generate SQL sync script
 */
app.post('/api/compare/generate-sync', async (req, res) => {
  try {
    const { sourceDb, targetDb, direction, schemaDiff } = req.body;
    if (!sourceDb || !targetDb || !direction || !schemaDiff) {
      return res.status(400).json({ error: 'sourceDb, targetDb, direction, and schemaDiff are required' });
    }

    const sqlStatements: string[] = [];
    const leftToRight = direction === 'left-to-right';

    const source = leftToRight ? 'db1' : 'db2';
    const target = leftToRight ? 'db2' : 'db1';

    sqlStatements.push('-- Sync script generated by SQLite MCP GUI');
    sqlStatements.push(`-- Sync direction: ${direction}`);
    sqlStatements.push(`-- Source: ${leftToRight ? sourceDb : targetDb}`);
    sqlStatements.push(`-- Target: ${leftToRight ? targetDb : sourceDb}`);
    sqlStatements.push('-- Generated at: ' + new Date().toISOString());
    sqlStatements.push('');

    if (leftToRight) {
      for (const tableName of schemaDiff.addedTables) {
        sqlStatements.push(`-- Table ${tableName} was added in target database`);
        sqlStatements.push(`-- Skipping table creation (manual review needed)`);
        sqlStatements.push('');
      }

      for (const tableName of schemaDiff.removedTables) {
        sqlStatements.push(`-- Table ${tableName} was removed in source database`);
        sqlStatements.push(`DROP TABLE IF EXISTS ${tableName};`);
        sqlStatements.push('');
      }

      for (const tableDiff of schemaDiff.modifiedTables) {
        sqlStatements.push(`-- Modifications for table: ${tableDiff.name}`);

        for (const col of tableDiff.changes.columns.added) {
          sqlStatements.push(`ALTER TABLE ${tableDiff.name} ADD COLUMN ${col.name} ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}${col.pk ? ' PRIMARY KEY' : ''};`);
        }

        for (const idx of tableDiff.changes.indexes.added) {
          sqlStatements.push(`CREATE ${idx.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${idx.name} ON ${tableDiff.name} (${idx.name});`);
        }

        sqlStatements.push('');
      }
    } else {
      for (const tableName of schemaDiff.addedTables) {
        sqlStatements.push(`-- Table ${tableName} was added in source database`);
        sqlStatements.push(`-- Skipping table creation (manual review needed)`);
        sqlStatements.push('');
      }

      for (const tableName of schemaDiff.removedTables) {
        sqlStatements.push(`-- Table ${tableName} was removed in target database`);
        sqlStatements.push(`DROP TABLE IF EXISTS ${tableName};`);
        sqlStatements.push('');
      }

      for (const tableDiff of schemaDiff.modifiedTables) {
        sqlStatements.push(`-- Modifications for table: ${tableDiff.name}`);

        for (const col of tableDiff.changes.columns.added) {
          sqlStatements.push(`ALTER TABLE ${tableDiff.name} ADD COLUMN ${col.name} ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}${col.pk ? ' PRIMARY KEY' : ''};`);
        }

        for (const idx of tableDiff.changes.indexes.added) {
          sqlStatements.push(`CREATE ${idx.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${idx.name} ON ${tableDiff.name} (${idx.name});`);
        }

        sqlStatements.push('');
      }
    }

    res.json({ success: true, syncScript: sqlStatements.join('\n') });
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
 * GET /ws/status - Get WebSocket status
 */
app.get('/ws/status', (req, res) => {
  res.json({
    enabled: WS_ENABLED,
    port: WS_PORT,
    connected: wsServer ? wsServer.getClientCount() : 0,
  });
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log(`SQLite GUI Server running at http://localhost:${PORT}`);

  // Start WebSocket server if enabled
  if (WS_ENABLED) {
    try {
      wsServer = createWebSocketServer({
        port: WS_PORT,
        path: '/ws',
        heartbeatInterval: 30000,
        maxConnections: 100,
      });
      console.log(`WebSocket server enabled on ws://localhost:${WS_PORT}/ws`);
    } catch (error) {
      console.error('Failed to start WebSocket server:', error);
    }
  } else {
    console.log('WebSocket server disabled (set WS_ENABLED=true to enable)');
  }
});
