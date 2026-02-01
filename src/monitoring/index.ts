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
  type MetricsSummary,
} from './metrics.js';

// Logger
export {
  Logger,
  initLogger,
  getLogger,
  createLogger,
  requestLoggingMiddleware,
  correlationIdMiddleware,
  LogLevel,
  type LoggerConfig,
  type LogContext,
  type LogEntry,
  type ErrorDetails,
  type RequestWithCorrelationId,
  type ResponseWithStartTime,
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
  type QueryTrackingResult,
  type ConnectionPoolInfo,
  type SlowQueryDetection,
} from './middleware.js';

// Health checks
export {
  HealthChecker,
  initHealthChecker,
  getHealthChecker,
  runHealthChecks,
  healthCheckMiddleware,
  type HealthCheckConfig,
  type HealthCheckResult,
  type HealthCheckResponse,
  type HealthStatus,
} from './health.js';
