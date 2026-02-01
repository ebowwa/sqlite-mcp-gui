/**
 * Monitoring Module Index
 *
 * Exports all monitoring functionality including metrics,
 * logging, health checks, and middleware.
 *
 * @module monitoring
 */

// Metrics
export {
  MetricsCollector,
  initMetrics,
  getMetrics,
  resetMetrics,
  enableDefaultMetrics,
  disableDefaultMetrics,
  getMetricsSummary,
  type MetricsConfig,
} from './metrics.js';

// Logger
export {
  Logger,
  initLogger,
  getLogger,
  createLogger,
  requestLoggingMiddleware,
  correlationIdMiddleware,
  type LoggerConfig,
  type LogEntry,
  LogLevel,
} from './logger.js';

// Middleware
export {
  metricsMiddleware,
  errorTrackingMiddleware,
  requestIdMiddleware,
  responseTimeMiddleware,
  trackDbQuery,
  withDbTracking,
  slowQueryDetection,
  ConnectionPoolTracker,
  getPoolTracker,
  type MiddlewareConfig,
} from './middleware.js';

// Health checks
export {
  HealthChecker,
  initHealthChecker,
  getHealthChecker,
  runHealthChecks,
  healthCheckMiddleware,
  type HealthCheckResult,
  type HealthCheck,
  type HealthCheckConfig,
  type HealthStatus,
} from './health.js';
