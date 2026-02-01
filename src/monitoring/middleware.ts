/**
 * Monitoring Middleware Module
 *
 * Express middleware for tracking requests, queries, and collecting metrics.
 *
 * @module monitoring/middleware
 */

import { Request, Response, NextFunction } from 'express';
import { getMetrics } from './metrics.js';
import { getLogger, correlationIdMiddleware } from './logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  /** Enable request timing */
  enableTiming?: boolean;
  /** Track database queries */
  trackQueries?: boolean;
  /** Ignore specific paths from metrics */
  ignoredPaths?: string[];
}

/**
 * Default middleware configuration
 */
const DEFAULT_CONFIG: Required<MiddlewareConfig> = {
  enableTiming: true,
  trackQueries: true,
  ignoredPaths: ['/health', '/metrics'],
};

/**
 * Request timing middleware
 * Tracks request duration and records metrics
 */
export function metricsMiddleware(config: MiddlewareConfig = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const metrics = getMetrics();
  const logger = getLogger();

  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const correlationId = req.headers['x-correlation-id'] as string || uuidv4();

    // Add correlation ID to request
    (req as unknown as { correlationId: string }).correlationId = correlationId;

    // Add to response headers
    res.setHeader('X-Correlation-ID', correlationId);

    // Log request
    logger.info('Incoming request', {
      correlationId,
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
    });

    // Track response
    const originalJson = res.json;
    res.json = function(this: Response, body: unknown) {
      const duration = Date.now() - startTime;
      const route = getRouteName(req);

      // Skip ignored paths
      if (!cfg.ignoredPaths.some(path => req.path.startsWith(path))) {
        metrics.recordHttpRequest(req.method, route, res.statusCode, duration);
      }

      // Log response
      logger.info('Outgoing response', {
        correlationId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      });

      return originalJson.call(this, body);
    };

    // Handle errors
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const route = getRouteName(req);

      // Log if not already logged
      if (!res.headersSent) {
        if (!cfg.ignoredPaths.some(path => req.path.startsWith(path))) {
          metrics.recordHttpRequest(req.method, route, res.statusCode, duration);
        }

        logger.info('Request completed', {
          correlationId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
        });
      }
    });

    next();
  };
}

/**
 * Database query tracking wrapper
 * Wraps database operations to track query metrics
 */
export function trackDbQuery(operation: string, database: string) {
  const metrics = getMetrics();
  const logger = getLogger();
  const startTime = Date.now();

  return {
    /**
     * Record successful query
     */
    success: () => {
      const duration = Date.now() - startTime;
      metrics.recordDbQuery(operation, database, duration);

      logger.debug('Query executed', {
        operation,
        database,
        duration,
      });

      return duration;
    },

    /**
     * Record failed query
     */
    error: (error: Error) => {
      const duration = Date.now() - startTime;
      metrics.recordDbQuery(operation, database, duration);

      logger.error('Query failed', error, {
        operation,
        database,
        duration,
      });

      return duration;
    },
  };
}

/**
 * Async function wrapper for tracking database queries
 */
export function withDbTracking<T>(
  operation: string,
  database: string,
  fn: () => Promise<T>
): Promise<T> {
  const tracker = trackDbQuery(operation, database);

  return fn()
    .then((result) => {
      tracker.success();
      return result;
    })
    .catch((error) => {
      tracker.error(error);
      throw error;
    });
}

/**
 * Extract route name from request
 */
function getRouteName(req: Request): string {
  // Try to get route from Express route
  const route = (req as unknown as { route?: { path: string } }).route?.path;
  if (route) {
    return route;
  }

  // Fallback to path
  return req.path;
}

/**
 * Error tracking middleware
 */
export function errorTrackingMiddleware() {
  const logger = getLogger();

  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req as unknown as { correlationId: string }).correlationId || uuidv4();

    logger.error('Request error', err, {
      correlationId,
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
      ip: req.ip,
    });

    // Send error response
    res.status(500).json({
      error: err.message,
      correlationId,
    });
  };
}

/**
 * Request ID middleware
 * Adds unique request ID to each request
 */
export function requestIdMiddleware() {
  return correlationIdMiddleware();
}

/**
 * Slow query detection middleware for database operations
 */
export function slowQueryDetection(thresholdMs: number = 1000) {
  const logger = getLogger();

  return {
    /**
     * Track query and log if slow
     */
    track: (operation: string, database: string, sql: string, duration: number) => {
      if (duration > thresholdMs) {
        logger.warn('Slow query detected', {
          operation,
          database,
          duration,
          threshold: thresholdMs,
          sql: sql.substring(0, 500), // Limit SQL length
        });
      }
    },
  };
}

/**
 * Connection pool tracking
 */
export class ConnectionPoolTracker {
  private pools: Map<string, { total: number; active: number; idle: number }> = new Map();
  private metrics = getMetrics();

  /**
   * Register a connection pool
   */
  registerPool(database: string, pool: { total: number; active: number; idle: number }): void {
    this.pools.set(database, pool);
    this.updateMetrics(database);
  }

  /**
   * Update pool metrics
   */
  updatePool(database: string, pool: { total: number; active: number; idle: number }): void {
    this.pools.set(database, pool);
    this.updateMetrics(database);
  }

  /**
   * Update metrics for a specific database
   */
  private updateMetrics(database: string): void {
    const pool = this.pools.get(database);
    if (pool) {
      this.metrics.setDbPoolSize(database, pool.total, pool.active, pool.idle);
      this.metrics.setActiveConnections(database, pool.active);
    }
  }

  /**
   * Get pool status
   */
  getPoolStatus(database: string): { total: number; active: number; idle: number } | undefined {
    return this.pools.get(database);
  }

  /**
   * Get all pool statuses
   */
  getAllPoolStatuses(): Map<string, { total: number; active: number; idle: number }> {
    return new Map(this.pools);
  }
}

/**
 * Global connection pool tracker
 */
let globalPoolTracker: ConnectionPoolTracker | null = null;

/**
 * Get or create the global connection pool tracker
 */
export function getPoolTracker(): ConnectionPoolTracker {
  if (!globalPoolTracker) {
    globalPoolTracker = new ConnectionPoolTracker();
  }
  return globalPoolTracker;
}

/**
 * Express middleware to add response time header
 */
export function responseTimeMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      res.setHeader('X-Response-Time', `${duration}ms`);
    });

    next();
  };
}
