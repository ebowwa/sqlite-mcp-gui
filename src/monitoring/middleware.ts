/**
 * Monitoring Middleware Module
 *
 * Express middleware for tracking requests, queries, and collecting metrics.
 *
 * @module monitoring/middleware
 */

import type { Request, Response, NextFunction } from 'express';
import { getMetrics } from './metrics.js';
import {
  getLogger,
  correlationIdMiddleware,
  type RequestWithCorrelationId,
} from './logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  enableTiming?: boolean;
  trackQueries?: boolean;
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
 * Query tracking result
 */
export interface QueryTrackingResult {
  success: () => number;
  error: (error: Error) => number;
}

/**
 * Connection pool information
 */
export interface ConnectionPoolInfo {
  total: number;
  active: number;
  idle: number;
}

/**
 * Extended Request type with correlation ID
 */
interface RequestWithMetrics extends Request {
  correlationId?: string;
  route?: { path?: string };
}

/**
 * Extended Response type
 */
interface ResponseWithMetrics extends Response {
  header(name: string, value: string): this;
}

/**
 * Request timing middleware
 * Tracks request duration and records metrics
 */
export function metricsMiddleware(config: MiddlewareConfig = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const metrics = getMetrics();
  const logger = getLogger();

  return (req: RequestWithMetrics, res: ResponseWithMetrics, next: NextFunction): void => {
    const startTime = Date.now();
    const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();

    // Add correlation ID to request
    req.correlationId = correlationId;

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
    const originalJson = res.json.bind(res);
    res.json = function (body: any): Response {
      const duration = Date.now() - startTime;
      const route = getRouteName(req);

      // Skip ignored paths
      if (!cfg.ignoredPaths.some(path => req.path.startsWith(path))) {
        metrics.recordHttpRequest(req.method ?? 'GET', route, res.statusCode, duration);
      }

      // Log response
      logger.info('Outgoing response', {
        correlationId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      });

      return originalJson(body);
    };

    // Handle errors
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const route = getRouteName(req);

      // Log if not already logged
      if (!res.headersSent) {
        if (!cfg.ignoredPaths.some(path => req.path.startsWith(path))) {
          metrics.recordHttpRequest(req.method ?? 'GET', route, res.statusCode, duration);
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
export function trackDbQuery(
  operation: string,
  database: string
): QueryTrackingResult {
  const metrics = getMetrics();
  const logger = getLogger();
  const startTime = Date.now();

  return {
    /**
     * Record successful query
     */
    success: (): number => {
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
    error: (error: Error): number => {
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
    .then(result => {
      tracker.success();
      return result;
    })
    .catch(error => {
      tracker.error(error);
      throw error;
    });
}

/**
 * Extract route name from request
 */
function getRouteName(req: RequestWithMetrics): string {
  // Try to get route from Express route
  const route = req.route?.path;
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

  return (
    err: Error,
    req: RequestWithMetrics,
    res: ResponseWithMetrics,
    next: NextFunction
  ): void => {
    const correlationId = req.correlationId || uuidv4();

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
 * Slow query detection for database operations
 */
export interface SlowQueryDetection {
  track: (operation: string, database: string, sql: string, duration: number) => void;
}

export function slowQueryDetection(thresholdMs = 1000): SlowQueryDetection {
  const logger = getLogger();

  return {
    /**
     * Track query and log if slow
     */
    track: (
      operation: string,
      database: string,
      sql: string,
      duration: number
    ): void => {
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
  private pools = new Map<string, ConnectionPoolInfo>();
  private metrics = getMetrics();

  /**
   * Register a connection pool
   */
  registerPool(database: string, pool: ConnectionPoolInfo): void {
    this.pools.set(database, pool);
    this.updateMetrics(database);
  }

  /**
   * Update pool information
   */
  updatePool(database: string, pool: ConnectionPoolInfo): void {
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
  getPoolStatus(database: string): ConnectionPoolInfo | undefined {
    return this.pools.get(database);
  }

  /**
   * Get all pool statuses
   */
  getAllPoolStatuses(): Map<string, ConnectionPoolInfo> {
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
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    // Store start time on the response object for later use
    (res as any).startTime = startTime;

    // Add response time header when headers are about to be sent
    const originalSend = res.send.bind(res);
    res.send = function(this: any, ...args: any[]): any {
      const duration = Date.now() - startTime;
      if (!this.headersSent) {
        try {
          this.setHeader('X-Response-Time', `${duration}ms`);
        } catch (err) {
          // Ignore header errors (might already be sent)
        }
      }
      return originalSend.apply(this, args);
    };

    next();
  };
}
