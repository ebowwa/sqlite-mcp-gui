/**
 * SQLite MCP GUI Server
 *
 * Main Express server integrating all modules:
 * - Authentication (JWT, sessions, API keys)
 * - WebSocket (real-time updates)
 * - Monitoring (metrics, logging, health checks)
 * - Import/Export (CSV, JSON, SQL, Excel)
 * - Database operations
 *
 * @module ui/server
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Authentication
import { setupCookieParser, authRoutes, authenticate, optionalAuth, type AuthenticatedRequest } from '../auth/index.js';

// WebSocket
import { integrateWithExpress, type WebSocketServer } from '../websocket/index.js';

// Monitoring
import {
  initMetrics,
  getMetrics,
  metricsMiddleware,
  errorTrackingMiddleware,
  responseTimeMiddleware,
  initHealthChecker,
  runHealthChecks,
  initLogger,
  getLogger,
  enableDefaultMetrics,
} from '../monitoring/index.js';

// Import/Export
import {
  DataImporter,
  DataExporter,
  exportAllTables,
  type ImportOptions,
  type ExportOptions,
  type DataFormat,
} from '../import-export/import-export.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const WS_PATH = process.env.WS_PATH || '/ws';
const ENABLE_AUTH = process.env.ENABLE_AUTH !== 'false';
const ENABLE_WEBSOCKET = process.env.ENABLE_WEBSOCKET !== 'false';
const ENABLE_MONITORING = process.env.ENABLE_MONITORING !== 'false';

// Initialize Express app
const app = express();

// Initialize HTTP server for WebSocket integration
const httpServer = createServer(app);

// Initialize monitoring
const metrics = initMetrics({
  prefix: 'sqlite_mcp_gui_',
  defaultLabels: {
    service: 'sqlite-gui',
  },
});

const logger = initLogger({
  level: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
  enableConsole: true,
  enableFile: false,
});

const healthChecker = initHealthChecker({
  diskWarningThreshold: 80,
  diskCriticalThreshold: 90,
  memoryWarningThreshold: 80,
  memoryCriticalThreshold: 90,
});

// Enable default Prometheus metrics
enableDefaultMetrics();

// WebSocket server instance
let wsServer: WebSocketServer | null = null;

// ============================================================================
// MIDDLEWARE SETUP
// ============================================================================

// Cookie parser for session management (before auth middleware)
setupCookieParser(app);

// Response time middleware
if (ENABLE_MONITORING) {
  app.use(responseTimeMiddleware());
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Metrics and monitoring middleware
if (ENABLE_MONITORING) {
  app.use(metricsMiddleware({
    ignoredPaths: ['/health', '/ready', '/metrics', '/favicon.ico'],
  }));
}

// Static files
app.use(express.static(join(__dirname, 'public')));

// ============================================================================
// HEALTH CHECK ENDPOINTS
// ============================================================================

/**
 * GET /health
 *
 * Comprehensive health check endpoint
 * Returns overall system health status
 */
app.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await runHealthChecks();
    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /ready
 *
 * Readiness check endpoint for Kubernetes/d orchestration
 */
app.get('/ready', (req: Request, res: Response) => {
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /metrics
 *
 * Prometheus metrics endpoint
 * Exposes all collected metrics in Prometheus format
 */
app.get('/metrics', async (req: Request, res: Response) => {
  try {
    const promClient = await import('prom-client');
    const metrics = await promClient.register.metrics();
    res.set('Content-Type', promClient.register.contentType);
    res.send(metrics);
  } catch (error) {
    logger.error('Failed to generate metrics', error as Error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

/**
 * GET /api/metrics/summary
 *
 * Get metrics summary for dashboard display
 */
app.get('/api/metrics/summary', (req: Request, res: Response) => {
  try {
    const summary = getMetrics().getMetricsSummary();
    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

// Mount authentication routes
app.use('/auth', authRoutes);

/**
 * GET /api/auth/config
 *
 * Get public authentication configuration
 */
app.get('/api/auth/config', (req: Request, res: Response) => {
  res.json({
    enabled: ENABLE_AUTH,
    websocketEnabled: ENABLE_WEBSOCKET,
    monitoringEnabled: ENABLE_MONITORING,
  });
});

// ============================================================================
// API ROUTES
// ============================================================================

// Apply authentication middleware to protected routes if enabled
const apiAuthMiddleware = ENABLE_AUTH ? authenticate : optionalAuth;

/**
 * POST /api/query
 *
 * Execute SQL queries against a database
 * Requires authentication when enabled
 */
app.post('/api/query', apiAuthMiddleware as any, async (req: AuthenticatedRequest, res: Response) => {
  const dbTracker = metrics.trackDbQuery('execute', req.body.dbPath || 'unknown');

  try {
    const { dbPath, sql } = req.body;

    if (!dbPath || !sql) {
      dbTracker.error(new Error('Missing required parameters'));
      return res.status(400).json({ error: 'dbPath and sql are required' });
    }

    // Check database access permissions if auth is enabled
    if (ENABLE_AUTH && req.auth?.user.allowedDatabases) {
      if (!req.auth.user.allowedDatabases.includes(dbPath)) {
        dbTracker.error(new Error('Access denied'));
        return res.status(403).json({ error: 'Access denied to this database' });
      }
    }

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    const trimmedSql = sql.trim().toUpperCase();

    if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA')) {
      const stmt = db.prepare(sql);
      const rows = stmt.all();
      dbTracker.success();
      res.json({ success: true, rows, rowCount: rows.length });
    } else {
      // Check write permissions if auth is enabled
      if (ENABLE_AUTH && req.auth?.user.role !== 'admin' && req.auth?.user.role !== 'read-write') {
        db.close();
        dbTracker.error(new Error('Write permission denied'));
        return res.status(403).json({ error: 'Write permission denied' });
      }

      db.exec(sql);
      const changesStmt = db.prepare('SELECT changes() as changes');
      const { changes } = changesStmt.get() as { changes: number };
      dbTracker.success();
      res.json({ success: true, changes, message: 'Query executed successfully' });
    }

    db.close();

    // Notify WebSocket clients of query completion
    if (wsServer) {
      wsServer.notifyQueryComplete({
        database: dbPath,
        query: sql.substring(0, 100),
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    dbTracker.error(error as Error);
    logger.error('Query execution failed', error as Error, { dbPath: req.body.dbPath });

    if (wsServer) {
      wsServer.notifyQueryError({
        database: req.body.dbPath || 'unknown',
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/tables
 *
 * Get list of tables in a database
 */
app.post('/api/tables', apiAuthMiddleware as any, async (req: AuthenticatedRequest, res: Response) => {
  const dbTracker = metrics.trackDbQuery('list_tables', req.body.dbPath || 'unknown');

  try {
    const { dbPath } = req.body;

    if (!dbPath) {
      dbTracker.error(new Error('Missing dbPath'));
      return res.status(400).json({ error: 'dbPath is required' });
    }

    // Check database access permissions
    if (ENABLE_AUTH && req.auth?.user.allowedDatabases) {
      if (!req.auth.user.allowedDatabases.includes(dbPath)) {
        dbTracker.error(new Error('Access denied'));
        return res.status(403).json({ error: 'Access denied to this database' });
      }
    }

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    const stmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tables = stmt.all() as Array<{ name: string }>;

    dbTracker.success();
    res.json({ success: true, tables: tables.map((t) => t.name) });
    db.close();
  } catch (error) {
    dbTracker.error(error as Error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/schema
 *
 * Get schema information for a specific table
 */
app.post('/api/schema', apiAuthMiddleware as any, async (req: AuthenticatedRequest, res: Response) => {
  const dbTracker = metrics.trackDbQuery('table_schema', req.body.dbPath || 'unknown');

  try {
    const { dbPath, tableName } = req.body;

    if (!dbPath || !tableName) {
      dbTracker.error(new Error('Missing required parameters'));
      return res.status(400).json({ error: 'dbPath and tableName are required' });
    }

    // Check database access permissions
    if (ENABLE_AUTH && req.auth?.user.allowedDatabases) {
      if (!req.auth.user.allowedDatabases.includes(dbPath)) {
        dbTracker.error(new Error('Access denied'));
        return res.status(403).json({ error: 'Access denied to this database' });
      }
    }

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
    const columns = stmt.all();

    // Get foreign keys
    const fkStmt = db.prepare(`PRAGMA foreign_key_list(${tableName})`);
    const foreignKeys = fkStmt.all();

    // Get indexes
    const indexStmt = db.prepare(`PRAGMA index_list(${tableName})`);
    const indexes = indexStmt.all();

    dbTracker.success();
    res.json({
      success: true,
      table: tableName,
      columns,
      foreignKeys,
      indexes,
    });
    db.close();
  } catch (error) {
    dbTracker.error(error as Error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// IMPORT/EXPORT ENDPOINTS
// ============================================================================

/**
 * POST /api/import
 *
 * Import data from a file (CSV, JSON, SQL, Excel)
 * Requires write permission
 */
app.post('/api/import', apiAuthMiddleware as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      dbPath,
      format,
      tableName,
      filePath,
      content,
      options = {},
    } = req.body as {
      dbPath: string;
      format: DataFormat;
      tableName?: string;
      filePath?: string;
      content?: string;
      options?: Partial<ImportOptions>;
    };

    if (!dbPath || !format) {
      return res.status(400).json({ error: 'dbPath and format are required' });
    }

    if (!filePath && !content) {
      return res.status(400).json({ error: 'Either filePath or content must be provided' });
    }

    // Check write permissions
    if (ENABLE_AUTH && req.auth?.user.role !== 'admin' && req.auth?.user.role !== 'read-write') {
      return res.status(403).json({ error: 'Write permission required for import operations' });
    }

    // Check database access permissions
    if (ENABLE_AUTH && req.auth?.user.allowedDatabases) {
      if (!req.auth.user.allowedDatabases.includes(dbPath)) {
        return res.status(403).json({ error: 'Access denied to this database' });
      }
    }

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    const importer = new DataImporter(db, {
      format,
      tableName,
      ...options,
      onProgress: (progress) => {
        // Notify WebSocket clients of import progress
        if (wsServer) {
          wsServer.broadcast({
            type: 'import_progress',
            channel: 'import',
            data: {
              database: dbPath,
              table: tableName,
              progress,
            },
          });
        }
      },
    });

    let result;
    if (content) {
      // Import from content
      switch (format) {
        case 'csv':
          result = await importer.importFromCSV(content);
          break;
        case 'json':
          result = await importer.importFromJSON(content);
          break;
        case 'sql':
          result = await importer.importFromSQL(content);
          break;
        default:
          throw new Error(`Content import not supported for format: ${format}`);
      }
    } else {
      // Import from file
      result = await importer.importFromFile(filePath!);
    }

    db.close();

    // Notify WebSocket clients of successful import
    if (wsServer && result.success) {
      wsServer.notifyTableCreated({
        database: dbPath,
        table: tableName || result.tableCreated ? 'imported_data' : 'unknown',
        action: 'import',
        rowsAffected: result.rowsImported,
      });
    }

    logger.info('Import completed', {
      database: dbPath,
      format,
      rowsImported: result.rowsImported,
      user: req.auth?.user.username,
    });

    res.json(result);
  } catch (error) {
    logger.error('Import failed', error as Error, {
      database: req.body.dbPath,
      format: req.body.format,
    });

    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
      rowsImported: 0,
    });
  }
});

/**
 * POST /api/export
 *
 * Export data from a database to a file (CSV, JSON, SQL, Excel)
 */
app.post('/api/export', apiAuthMiddleware as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      dbPath,
      format,
      tableName,
      query,
      filePath,
      options = {},
    } = req.body as {
      dbPath: string;
      format: DataFormat;
      tableName?: string;
      query?: string;
      filePath: string;
      options?: Partial<ExportOptions>;
    };

    if (!dbPath || !format || !filePath) {
      return res.status(400).json({ error: 'dbPath, format, and filePath are required' });
    }

    // Check database access permissions
    if (ENABLE_AUTH && req.auth?.user.allowedDatabases) {
      if (!req.auth.user.allowedDatabases.includes(dbPath)) {
        return res.status(403).json({ error: 'Access denied to this database' });
      }
    }

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    const exporter = new DataExporter(db, {
      format,
      tableName,
      query,
      ...options,
      onProgress: (progress) => {
        // Notify WebSocket clients of export progress
        if (wsServer) {
          wsServer.broadcast({
            type: 'export_progress',
            channel: 'export',
            data: {
              database: dbPath,
              table: tableName,
              format,
              progress,
            },
          });
        }
      },
    });

    const result = await exporter.exportToFile(filePath);
    db.close();

    logger.info('Export completed', {
      database: dbPath,
      format,
      filePath,
      rowsExported: result.rowsExported,
      user: req.auth?.user.username,
    });

    res.json(result);
  } catch (error) {
    logger.error('Export failed', error as Error, {
      database: req.body.dbPath,
      format: req.body.format,
    });

    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
      rowsExported: 0,
    });
  }
});

/**
 * GET /api/export/:dbPath
 *
 * Export data and return as response (for direct download)
 */
app.get('/api/export/:dbPath', apiAuthMiddleware as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { dbPath } = req.params;
    const { format = 'json', tableName, query } = req.query;

    // Check database access permissions
    if (ENABLE_AUTH && req.auth?.user.allowedDatabases) {
      if (!req.auth.user.allowedDatabases.includes(dbPath)) {
        return res.status(403).json({ error: 'Access denied to this database' });
      }
    }

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    const exporter = new DataExporter(db, {
      format: format as DataFormat,
      tableName: tableName as string | undefined,
      query: query as string | undefined,
    });

    let content: string;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'csv':
        content = await exporter.exportToCSV();
        contentType = 'text/csv';
        filename = `${tableName || 'export'}.csv`;
        break;
      case 'json':
        content = await exporter.exportToJSON();
        contentType = 'application/json';
        filename = `${tableName || 'export'}.json`;
        break;
      case 'sql':
        content = await exporter.exportToSQL();
        contentType = 'text/plain';
        filename = `${tableName || 'export'}.sql`;
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    db.close();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);

    logger.info('Export completed (download)', {
      database: dbPath,
      format,
      user: req.auth?.user.username,
    });
  } catch (error) {
    logger.error('Export failed', error as Error, {
      database: req.params.dbPath,
      format: req.query.format,
    });

    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/export/:dbPath/all
 *
 * Export all tables from a database
 */
app.get('/api/export/:dbPath/all', apiAuthMiddleware as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { dbPath } = req.params;
    const { format = 'json', outputDir } = req.query;

    // Check database access permissions
    if (ENABLE_AUTH && req.auth?.user.allowedDatabases) {
      if (!req.auth.user.allowedDatabases.includes(dbPath)) {
        return res.status(403).json({ error: 'Access denied to this database' });
      }
    }

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    const results = await exportAllTables(
      db,
      outputDir as string || '/tmp',
      format as DataFormat
    );

    db.close();

    res.json({
      success: true,
      exported: results.length,
      results,
    });

    logger.info('Bulk export completed', {
      database: dbPath,
      format,
      tablesExported: results.length,
      user: req.auth?.user.username,
    });
  } catch (error) {
    logger.error('Bulk export failed', error as Error, {
      database: req.params.dbPath,
    });

    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// WEBSOCKET INFO ENDPOINT
// ============================================================================

/**
 * GET /api/websocket/info
 *
 * Get WebSocket connection information
 */
app.get('/api/websocket/info', (req: Request, res: Response) => {
  res.json({
    enabled: ENABLE_WEBSOCKET,
    path: WS_PATH,
    connectedClients: wsServer?.getClientCount() || 0,
  });
});

// ============================================================================
// SERVE WEB UI
// ============================================================================

/**
 * GET /
 *
 * Serve the main web UI
 */
app.get('/', (req: Request, res: Response) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Catch-all route for SPA
app.get('*', (req: Request, res: Response) => {
  // Only handle non-API routes
  if (!req.path.startsWith('/api') && !req.path.startsWith('/auth') && !req.path.startsWith('/health')) {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Global error handler
if (ENABLE_MONITORING) {
  app.use(errorTrackingMiddleware());
} else {
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', err, {
      path: req.path,
      method: req.method,
    });
    res.status(500).json({
      error: err.message,
    });
  });
}

// ============================================================================
// SERVER STARTUP
// ============================================================================

/**
 * Start the server
 */
async function startServer() {
  try {
    // Initialize WebSocket server if enabled
    if (ENABLE_WEBSOCKET) {
      wsServer = integrateWithExpress({
        server: httpServer,
        path: WS_PATH,
        config: {
          heartbeatInterval: 30000,
          maxConnections: 100,
        },
      });
      logger.info('WebSocket server initialized', { path: WS_PATH });
    }

    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('  SQLite MCP GUI Server');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`  Server running at:      http://localhost:${PORT}`);
      console.log(`  Health check:           http://localhost:${PORT}/health`);
      console.log(`  Metrics:                http://localhost:${PORT}/metrics`);
      console.log(`  WebSocket:              ws://localhost:${PORT}${WS_PATH}`);
      console.log('');
      console.log(`  Authentication:         ${ENABLE_AUTH ? 'Enabled' : 'Disabled'}`);
      console.log(`  WebSocket:              ${ENABLE_WEBSOCKET ? 'Enabled' : 'Disabled'}`);
      console.log(`  Monitoring:             ${ENABLE_MONITORING ? 'Enabled' : 'Disabled'}`);
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');
    });

    logger.info('Server started', {
      port: PORT,
      authEnabled: ENABLE_AUTH,
      websocketEnabled: ENABLE_WEBSOCKET,
      monitoringEnabled: ENABLE_MONITORING,
    });

  } catch (error) {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');

  if (wsServer) {
    wsServer.stop();
  }

  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');

  if (wsServer) {
    wsServer.stop();
  }

  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

// Start the server
startServer();

export { app, httpServer, wsServer };
