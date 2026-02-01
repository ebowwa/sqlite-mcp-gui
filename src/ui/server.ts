/**
 * SQLite GUI Web Server
 *
 * Express server providing a web interface for SQLite database operations.
 * Includes REST API endpoints for querying, listing tables, and retrieving schema.
 *
 * @module ui/server
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import {
  DEFAULT_PORT,
  MAX_REQUEST_SIZE,
  DB_CONNECTION_TIMEOUT,
  DEFAULT_PREVIEW_LIMIT,
} from '../shared/constants.js';
import {
  DatabaseError,
  DatabaseConnectionError,
  QueryExecutionError,
  ValidationError,
} from '../shared/errors.js';
import {
  validateSQL,
  validateDatabasePath,
  validateTableName,
  validateRequestBody,
} from '../shared/validators.js';
import { logger } from '../shared/logger.js';
import {
  rateLimitMiddleware,
  corsMiddleware,
  securityHeadersMiddleware,
  requestLoggingMiddleware,
  requestIdMiddleware,
} from '../shared/middleware.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Express application instance
 */
const app = express();

/**
 * Server configuration
 */
const PORT = process.env.PORT || DEFAULT_PORT;

/**
 * ============================================================================
 * Middleware Configuration
 * ============================================================================
 */

// Body parsing middleware
app.use(express.json({ limit: MAX_REQUEST_SIZE }));

// Serve static files from public directory
app.use(express.static(join(__dirname, 'public')));

// Security and logging middleware
app.use(securityHeadersMiddleware);
app.use(corsMiddleware({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: false,
}));
app.use(rateLimitMiddleware({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW) || undefined,
  maxRequests: Number(process.env.RATE_LIMIT_MAX) || undefined,
}));
app.use(requestIdMiddleware);
app.use(requestLoggingMiddleware);

/**
 * ============================================================================
 * Route Handlers
 * ============================================================================
 */

/**
 * @route   GET /
 * @desc    Serve the main application HTML
 * @access  Public
 */
app.get('/', (_req: Request, res: Response): void => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

/**
 * @route   GET /health
 * @desc    Health check endpoint
 * @access  Public
 */
app.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'healthy',
    service: 'sqlite-mcp-gui',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
  });
});

// API endpoint to execute SQL queries
app.post('/api/query', async (req, res) => {
  let db: any = null;
  try {
    const { dbPath, sql } = req.body;

    // Validate input
    validateRequestBody(['dbPath', 'sql'], req.body);
    const sanitizedSQL = sanitizeSQL(sql);

    // Import and open database
    const Database = (await import('better-sqlite3')).default;
    try {
      db = new Database(dbPath, { readonly: false, timeout: 5000 });
      db.pragma('journal_mode = WAL');
    } catch (openError: any) {
      throw new DatabaseError(
        `Failed to open database: ${openError.message}`,
        'DB_OPEN_ERROR'
      );
    }

    const trimmedSql = sanitizedSQL.toUpperCase();

    if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA')) {
      try {
        const stmt = db.prepare(sanitizedSQL);
        const rows = stmt.all();
        res.json({ success: true, rows, rowCount: rows.length });
      } catch (queryError: any) {
        throw new DatabaseError(
          `Query failed: ${queryError.message}`,
          'QUERY_ERROR'
        );
      }
    } else {
      try {
        const result = db.exec(sanitizedSQL);
        const changesStmt = db.prepare('SELECT changes() as changes');
        const { changes } = changesStmt.get() as { changes: number };
        res.json({
          success: true,
          changes,
          message: `Query executed successfully. ${changes} row(s) affected.`
        });
      } catch (execError: any) {
        throw new DatabaseError(
          `Execution failed: ${execError.message}`,
          'EXEC_ERROR'
        );
      }
    }
  } catch (error: any) {
    console.error('Query error:', error);

    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        type: 'validation'
      });
    }

    if (error instanceof DatabaseError) {
      return res.status(500).json({
        success: false,
        error: error.message,
        code: error.code,
        type: 'database'
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      type: 'unknown'
    });
  } finally {
    if (db) {
      try {
        db.close();
      } catch (closeError) {
        console.error('Error closing database:', closeError);
      }
    }
  }
});

// API endpoint to get tables
app.post('/api/tables', async (req, res) => {
  let db: any = null;
  try {
    const { dbPath } = req.body;

    validateRequestBody(['dbPath'], req.body);

    const Database = (await import('better-sqlite3')).default;
    try {
      db = new Database(dbPath, { readonly: true, timeout: 5000 });
    } catch (openError: any) {
      throw new DatabaseError(
        `Failed to open database: ${openError.message}`,
        'DB_OPEN_ERROR'
      );
    }

    const stmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tables = stmt.all() as Array<{ name: string }>;

    res.json({ success: true, tables: tables.map((t) => t.name) });
  } catch (error: any) {
    console.error('Tables error:', error);

    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        type: 'validation'
      });
    }

    if (error instanceof DatabaseError) {
      return res.status(500).json({
        success: false,
        error: error.message,
        code: error.code,
        type: 'database'
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      type: 'unknown'
    });
  } finally {
    if (db) {
      try {
        db.close();
      } catch (closeError) {
        console.error('Error closing database:', closeError);
      }
    }
  }
});

// API endpoint to get table schema
app.post('/api/schema', async (req, res) => {
  let db: any = null;
  try {
    const { dbPath, tableName } = req.body;

    validateRequestBody(['dbPath', 'tableName'], req.body);

    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new ValidationError('Invalid table name');
    }

    const Database = (await import('better-sqlite3')).default;
    try {
      db = new Database(dbPath, { readonly: true, timeout: 5000 });
    } catch (openError: any) {
      throw new DatabaseError(
        `Failed to open database: ${openError.message}`,
        'DB_OPEN_ERROR'
      );
    }

    const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
    const columns = stmt.all();

    res.json({ success: true, table: tableName, columns });
  } catch (error: any) {
    console.error('Schema error:', error);

    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        type: 'validation'
      });
    }

    if (error instanceof DatabaseError) {
      return res.status(500).json({
        success: false,
        error: error.message,
        code: error.code,
        type: 'database'
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      type: 'unknown'
    });
  } finally {
    if (db) {
      try {
        db.close();
      } catch (closeError) {
        console.error('Error closing database:', closeError);
      }
    }
  }
});

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'sqlite-mcp-gui',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    type: 'internal'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    type: 'not_found'
  });
});

app.listen(PORT, () => {
  console.log(`SQLite GUI Server running at http://localhost:${PORT}`);
});
