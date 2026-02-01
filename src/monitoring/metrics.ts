/**
 * Monitoring and Metrics Collection Module
 *
 * Provides Prometheus-style metrics collection using prom-client.
 * Tracks HTTP requests, database queries, errors, and system resources.
 *
 * @module monitoring/metrics
 */

import promClient, { Counter, Histogram, Gauge } from 'prom-client';

/**
 * Metrics configuration options
 */
export interface MetricsConfig {
  /** Enable/disable metrics collection */
  enabled?: boolean;
  /** Prefix for all metric names */
  prefix?: string;
  /** Labels to add to all metrics */
  defaultLabels?: Record<string, string>;
  /** Slow query threshold in milliseconds */
  slowQueryThreshold?: number;
}

/**
 * Default metrics configuration
 */
const DEFAULT_CONFIG: Required<MetricsConfig> = {
  enabled: true,
  prefix: 'sqlite_mcp_gui_',
  defaultLabels: {},
  slowQueryThreshold: 1000,
};

/**
 * Metrics collector class
 */
export class MetricsCollector {
  private config: Required<MetricsConfig>;
  private httpRequestCounter: Counter<string>;
  private httpRequestDuration: Histogram<string>;
  private httpErrorCounter: Counter<string>;
  private queryCounter: Counter<string>;
  private queryDuration: Histogram<string>;
  private slowQueryCounter: Counter<string>;
  private activeConnections: Gauge<string>;
  private dbPoolSize: Gauge<string>;

  constructor(config: MetricsConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Apply default labels to all registries
    if (Object.keys(this.config.defaultLabels).length > 0) {
      promClient.register.setDefaultLabels(this.config.defaultLabels);
    }

    // Initialize metrics
    this.initializeMetrics();
  }

  /**
   * Initialize all Prometheus metrics
   */
  private initializeMetrics(): void {
    const prefix = this.config.prefix;

    // HTTP request counter
    this.httpRequestCounter = new promClient.Counter({
      name: `${prefix}http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    // HTTP request duration histogram
    this.httpRequestDuration = new promClient.Histogram({
      name: `${prefix}http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    });

    // HTTP error counter
    this.httpErrorCounter = new promClient.Counter({
      name: `${prefix}http_errors_total`,
      help: 'Total number of HTTP errors',
      labelNames: ['method', 'route', 'status_code', 'error_type'],
    });

    // Database query counter
    this.queryCounter = new promClient.Counter({
      name: `${prefix}db_queries_total`,
      help: 'Total number of database queries',
      labelNames: ['operation', 'database'],
    });

    // Query duration histogram
    this.queryDuration = new promClient.Histogram({
      name: `${prefix}db_query_duration_seconds`,
      help: 'Database query duration in seconds',
      labelNames: ['operation', 'database'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    });

    // Slow query counter
    this.slowQueryCounter = new promClient.Counter({
      name: `${prefix}db_slow_queries_total`,
      help: 'Total number of slow database queries',
      labelNames: ['operation', 'database', 'threshold_ms'],
    });

    // Active connections gauge
    this.activeConnections = new promClient.Gauge({
      name: `${prefix}db_active_connections`,
      help: 'Number of active database connections',
      labelNames: ['database'],
    });

    // Database pool size gauge
    this.dbPoolSize = new promClient.Gauge({
      name: `${prefix}db_pool_size`,
      help: 'Database connection pool size',
      labelNames: ['database', 'state'],
    });
  }

  /**
   * Record an HTTP request
   */
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    if (!this.config.enabled) return;

    const labels = {
      method,
      route,
      status_code: statusCode.toString(),
    };

    this.httpRequestCounter.inc(labels);
    this.httpRequestDuration.observe(labels, duration / 1000); // Convert ms to seconds

    // Track errors (4xx and 5xx)
    if (statusCode >= 400) {
      this.httpErrorCounter.inc({
        ...labels,
        error_type: statusCode >= 500 ? 'server_error' : 'client_error',
      });
    }
  }

  /**
   * Record a database query
   */
  recordDbQuery(operation: string, database: string, duration: number): void {
    if (!this.config.enabled) return;

    const labels = { operation, database };

    this.queryCounter.inc(labels);
    this.queryDuration.observe(labels, duration / 1000); // Convert ms to seconds

    // Track slow queries
    if (duration > this.config.slowQueryThreshold) {
      this.slowQueryCounter.inc({
        ...labels,
        threshold_ms: this.config.slowQueryThreshold.toString(),
      });
    }
  }

  /**
   * Set the number of active database connections
   */
  setActiveConnections(database: string, count: number): void {
    if (!this.config.enabled) return;
    this.activeConnections.set({ database }, count);
  }

  /**
   * Set database pool size metrics
   */
  setDbPoolSize(database: string, total: number, active: number, idle: number): void {
    if (!this.config.enabled) return;

    this.dbPoolSize.set({ database, state: 'total' }, total);
    this.dbPoolSize.set({ database, state: 'active' }, active);
    this.dbPoolSize.set({ database, state: 'idle' }, idle);
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return promClient.register.metrics();
  }

  /**
   * Get metrics as JSON object
   */
  async getMetricsAsJson(): Promise<Record<string, unknown>> {
    const metrics = await promClient.register.getMetricsAsJSON();
    return metrics as unknown as Record<string, unknown>;
  }

  /**
   * Clear all metrics
   */
  resetMetrics(): void {
    promClient.register.clear();
    this.initializeMetrics();
  }

  /**
   * Enable or disable metrics collection
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
}

/**
 * Global metrics collector instance
 */
let globalMetricsCollector: MetricsCollector | null = null;

/**
 * Initialize the global metrics collector
 */
export function initMetrics(config?: MetricsConfig): MetricsCollector {
  if (!globalMetricsCollector) {
    globalMetricsCollector = new MetricsCollector(config);
  }
  return globalMetricsCollector;
}

/**
 * Get the global metrics collector instance
 */
export function getMetrics(): MetricsCollector {
  if (!globalMetricsCollector) {
    globalMetricsCollector = new MetricsCollector();
  }
  return globalMetricsCollector;
}

/**
 * Reset the global metrics collector
 */
export function resetMetrics(): void {
  if (globalMetricsCollector) {
    globalMetricsCollector.resetMetrics();
  }
}

/**
 * Enable default Prometheus metrics (CPU, memory, etc.)
 */
export function enableDefaultMetrics(): void {
  promClient.collectDefaultMetrics({
    prefix: DEFAULT_CONFIG.prefix,
  });
}

/**
 * Disable default Prometheus metrics
 */
export function disableDefaultMetrics(): void {
  const defaultMetrics = promClient.register.getSingleMetric('nodejs_heap_size_total_bytes') as any;
  if (defaultMetrics) {
    promClient.register.removeSingleMetric(defaultMetrics.name);
  }
}

/**
 * Get metrics summary for dashboard display
 */
export async function getMetricsSummary(): Promise<{
  totalRequests: number;
  averageResponseTime: number;
  totalQueries: number;
  averageQueryTime: number;
  errorRate: number;
  activeConnections: number;
}> {
  const collector = getMetrics();
  const metrics = await collector.getMetricsAsJson();

  // Extract metrics from Prometheus format
  let totalRequests = 0;
  let totalResponseTime = 0;
  let responseCount = 0;
  let totalQueries = 0;
  let totalQueryTime = 0;
  let queryCount = 0;
  let totalErrors = 0;

  if (Array.isArray(metrics)) {
    for (const metric of metrics) {
      if (metric.name?.includes('http_requests_total')) {
        if (Array.isArray(metric.values)) {
          for (const value of metric.values) {
            totalRequests += value.value || 0;
          }
        }
      } else if (metric.name?.includes('http_request_duration_seconds') && metric.values) {
        for (const value of metric.values) {
          totalResponseTime += value.value || 0;
          responseCount++;
        }
      } else if (metric.name?.includes('http_errors_total')) {
        if (Array.isArray(metric.values)) {
          for (const value of metric.values) {
            totalErrors += value.value || 0;
          }
        }
      } else if (metric.name?.includes('db_queries_total')) {
        if (Array.isArray(metric.values)) {
          for (const value of metric.values) {
            totalQueries += value.value || 0;
          }
        }
      } else if (metric.name?.includes('db_query_duration_seconds') && metric.values) {
        for (const value of metric.values) {
          totalQueryTime += value.value || 0;
          queryCount++;
        }
      }
    }
  }

  const averageResponseTime = responseCount > 0 ? (totalResponseTime / responseCount) * 1000 : 0;
  const averageQueryTime = queryCount > 0 ? (totalQueryTime / queryCount) * 1000 : 0;
  const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

  return {
    totalRequests,
    averageResponseTime,
    totalQueries,
    averageQueryTime,
    errorRate,
    activeConnections: 0, // Will be updated by connection tracking
  };
}
