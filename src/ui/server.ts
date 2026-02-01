/**
 * SQLite GUI Web Server
 *
 * Express server providing a web interface for SQLite database operations.
 * Includes monitoring, metrics, and health check endpoints.
 *
 * @module ui/server
 */

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setupCookieParser } from '../auth/routes.js';
import { authenticate } from '../auth/middleware.js';
import { authConfig } from '../auth/auth.config.js';

// Import monitoring modules
import {
  initMetrics,
  getMetrics,
  enableDefaultMetrics,
  getMetricsSummary,
  initLogger,
  getLogger,
  metricsMiddleware,
  errorTrackingMiddleware,
  responseTimeMiddleware,
  initHealthChecker,
  healthCheckMiddleware,
  trackDbQuery,
  getPoolTracker,
  withDbTracking,
  LogLevel,
} from '../monitoring/index.js';

// @ts-ignore - import.meta.url is supported in ES modules
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize monitoring
const metrics = initMetrics({
  enabled: process.env.METRICS_ENABLED !== 'false',
  prefix: 'sqlite_mcp_gui_',
  slowQueryThreshold: 1000,
});

const logger = initLogger({
  level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
  json: true,
  logRequests: true,
  logResponses: true,
});

// Enable default Prometheus metrics (CPU, memory, etc.)
enableDefaultMetrics();

// Initialize health checker
const healthChecker = initHealthChecker({
  diskWarningThreshold: 80,
  diskCriticalThreshold: 90,
  memoryWarningThreshold: 80,
  memoryCriticalThreshold: 90,
});

// Middleware
app.use(express.json());
setupCookieParser(app);
app.use(express.static(join(__dirname, 'public')));

// Monitoring middleware
app.use(responseTimeMiddleware());
app.use(metricsMiddleware({
  ignoredPaths: ['/health', '/metrics'],
}));

// Import auth routes
import authRoutes from '../auth/routes.js';

// Mount authentication routes
app.use('/auth', authRoutes);

/**
 * GET /health
 *
 * Health check endpoint with comprehensive system status.
 * Returns health status of disk space, memory, CPU, databases, and dependencies.
 *
 * @returns {Object} Health check result
 * @returns {string} returns.status - Overall health status (healthy, degraded, unhealthy)
 * @returns {string} returns.timestamp - ISO timestamp of check
 * @returns {Object} returns.checkes - Individual health check results
 *
 * @example
 * // Health check response
 * {
 *   "status": "healthy",
 *   "timestamp": "2024-01-01T00:00:00.000Z",
 *   "checks": {
 *     "disk": { "status": "healthy", "message": "Disk space OK" },
 *     "memory": { "status": "healthy", "message": "Memory usage: 45.23%" },
 *     "cpu": { "status": "healthy", "message": "4 CPU core(s) available" }
 *   }
 * }
 */
app.get('/health', healthCheckMiddleware());

/**
 * GET /metrics
 *
 * Prometheus-style metrics endpoint.
 * Returns metrics in Prometheus text format for scraping by monitoring systems.
 *
 * @returns {text/plain} Prometheus metrics format
 *
 * @example
 * // Metrics output
 * # HELP sqlite_mcp_gui_http_requests_total Total number of HTTP requests
 * # TYPE sqlite_mcp_gui_http_requests_total counter
 * sqlite_mcp_gui_http_requests_total{method="GET",route="/",status_code="200"} 42
 */
app.get('/metrics', async (req, res) => {
  try {
    const metricsData = await getMetrics().getMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metricsData);
  } catch (error) {
    logger.error('Failed to get metrics', error);
    res.status(500).send('Error collecting metrics');
  }
});

/**
 * GET /api/metrics/summary
 *
 * Get metrics summary for dashboard display.
 * Returns aggregated metrics in JSON format.
 *
 * @returns {Object} Metrics summary
 * @returns {number} returns.totalRequests - Total HTTP requests
 * @returns {number} returns.averageResponseTime - Average response time in ms
 * @returns {number} returns.totalQueries - Total database queries
 * @returns {number} returns.averageQueryTime - Average query time in ms
 * @returns {number} returns.errorRate - Error rate percentage
 *
 * @example
 * // Metrics summary response
 * {
 *   "totalRequests": 1234,
 *   "averageResponseTime": 45.67,
 *   "totalQueries": 567,
 *   "averageQueryTime": 12.34,
 *   "errorRate": 0.5,
 *   "activeConnections": 2
 * }
 */
app.get('/api/metrics/summary', async (req, res) => {
  try {
    const summary = await getMetricsSummary();
    res.json(summary);
  } catch (error) {
    logger.error('Failed to get metrics summary', error);
    res.status(500).json({ error: 'Failed to get metrics summary' });
  }
});

/**
 * POST /api/query
 *
 * Execute SQL queries against a SQLite database.
 * Supports SELECT, PRAGMA, INSERT, UPDATE, DELETE, and other SQL operations.
 * Requires authentication if enabled.
 * Now includes query tracking for metrics.
 *
 * @param {Object} req.body - Request body
 * @param {string} req.body.dbPath - Path to the SQLite database file
 * @param {string} req.body.sql - SQL query to execute
 *
 * @returns {Object} Response
 * @returns {boolean} response.success - Indicates if the query was successful
 * @returns {Array<Object>} [response.rows] - Result rows (for SELECT queries)
 * @returns {number} [response.rowCount] - Number of rows returned
 * @returns {number} [response.changes] - Number of rows affected (for INSERT/UPDATE/DELETE)
 * @returns {string} [response.message] - Success message
 *
 * @example
 * // SELECT query example
 * fetch('/api/query', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     dbPath: '/path/to/database.db',
 *     sql: 'SELECT * FROM users LIMIT 10'
 *   })
 * })
 */
app.post('/api/query', authenticate, async (req, res) => {
  const tracker = trackDbQuery('query', req.body.dbPath || 'unknown');

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
    tracker.success();
  } catch (error) {
    tracker.error(error as Error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/tables
 *
 * List all tables in the SQLite database.
 * Excludes SQLite system tables (those starting with 'sqlite_').
 * Requires authentication if enabled.
 * Now includes query tracking.
 *
 * @param {Object} req.body - Request body
 * @param {string} req.body.dbPath - Path to the SQLite database file
 *
 * @returns {Object} Response
 * @returns {boolean} response.success - Indicates if the request was successful
 * @returns {string[]} response.tables - Array of table names in alphabetical order
 *
 * @example
 * fetch('/api/tables', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     dbPath: '/path/to/database.db'
 *   })
 * })
 */
app.post('/api/tables', authenticate, async (req, res) => {
  const tracker = trackDbQuery('list_tables', req.body.dbPath || 'unknown');

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
    tracker.success();
  } catch (error) {
    tracker.error(error as Error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/schema
 *
 * Get schema information for a specific table.
 * Returns column names, data types, constraints, and other metadata.
 * Requires authentication if enabled.
 * Now includes query tracking.
 *
 * @param {Object} req.body - Request body
 * @param {string} req.body.dbPath - Path to the SQLite database file
 * @param {string} req.body.tableName - Name of the table to get schema for
 *
 * @returns {Object} Response
 * @returns {boolean} response.success - Indicates if the request was successful
 * @returns {string} response.table - Name of the table
 * @returns {Array<Object>} response.columns - Array of column information objects
 * @returns {number} response.columns[].cid - Column ID (0-based index)
 * @returns {string} response.columns[].name - Column name
 * @returns {string} response.columns[].type - Column data type (INTEGER, TEXT, REAL, BLOB)
 * @returns {number} response.columns[].notnull - NOT NULL constraint (1 or 0)
 * @returns {string|null} response.columns[].dflt_value - Default value
 * @returns {number} response.columns[].pk - Primary key position (0 if not part of PK)
 *
 * @example
 * fetch('/api/schema', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     dbPath: '/path/to/database.db',
 *     tableName: 'users'
 *   })
 * })
 */
app.post('/api/schema', authenticate, async (req, res) => {
  const tracker = trackDbQuery('schema', req.body.dbPath || 'unknown');

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
    tracker.success();
  } catch (error) {
    tracker.error(error as Error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /
 *
 * Serve the main application HTML page.
 *
 * @returns {HTML} The main index.html page
 *
 * @example
 * // Open in browser
 * // http://localhost:3000/
 */
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use(errorTrackingMiddleware());

/**
 * Start the HTTP server.
 *
 * Server listens on the configured PORT (default: 3000).
 * Can be customized via the PORT environment variable.
 *
 * Authentication status is logged on startup based on AUTH_ENABLED.
 *
 * Monitoring features:
 * - Metrics available at /metrics (Prometheus format)
 * - Health checks at /health (JSON format)
 * - Metrics summary at /api/metrics/summary (JSON format)
 *
 * @example
 * // Start with default port
 * npm run start:ui
 *
 * @example
 * // Start with custom port
 * PORT=8080 npm run start:ui
 *
 * @example
 * // Start with authentication enabled
 * AUTH_ENABLED=true npm run start:ui
 *
 * @example
 * // Disable metrics collection
 * METRICS_ENABLED=false npm run start:ui
 *
 * @example
 * // Set log level
 * LOG_LEVEL=DEBUG npm run start:ui
 */
app.listen(PORT, () => {
  logger.info('SQLite GUI Server started', {
    port: PORT,
    url: `http://localhost:${PORT}`,
    metricsEndpoint: `http://localhost:${PORT}/metrics`,
    healthEndpoint: `http://localhost:${PORT}/health`,
  });

  console.log(`SQLite GUI Server running at http://localhost:${PORT}`);
  console.log(`Metrics available at http://localhost:${PORT}/metrics`);
  console.log(`Health checks at http://localhost:${PORT}/health`);

  if (authConfig.enabled) {
    console.log(`Authentication: ENABLED`);
  } else {
    console.log(`Authentication: DISABLED (Set AUTH_ENABLED=true to enable)`);
  }
});
