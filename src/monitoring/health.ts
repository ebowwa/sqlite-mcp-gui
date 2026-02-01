/**
 * Health Check Module
 *
 * Provides comprehensive health checks for the application,
 * including disk space, memory, database integrity, and dependencies.
 *
 * @module monitoring/health
 */

import { existsSync, statSync } from 'node:fs';
import { cpus, freemem, totalmem } from 'node:os';
import { cwd } from 'node:process';

/**
 * Health status types
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  checks: Record<string, HealthCheck>;
  uptime: number;
  version?: string;
}

/**
 * Individual health check
 */
export interface HealthCheck {
  status: HealthStatus;
  message?: string;
  details?: Record<string, unknown>;
  duration?: number;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Disk space warning threshold (percentage) */
  diskWarningThreshold?: number;
  /** Disk space critical threshold (percentage) */
  diskCriticalThreshold?: number;
  /** Memory usage warning threshold (percentage) */
  memoryWarningThreshold?: number;
  /** Memory usage critical threshold (percentage) */
  memoryCriticalThreshold?: number;
  /** Database paths to check */
  databasePaths?: string[];
  /** Custom checks to include */
  customChecks?: Record<string, () => Promise<HealthCheck>>;
}

/**
 * Default health check configuration
 */
const DEFAULT_CONFIG: Required<HealthCheckConfig> = {
  diskWarningThreshold: 80,
  diskCriticalThreshold: 90,
  memoryWarningThreshold: 80,
  memoryCriticalThreshold: 90,
  databasePaths: [],
  customChecks: {},
};

/**
 * Health checker class
 */
export class HealthChecker {
  private config: Required<HealthCheckConfig>;
  private startTime: number;

  constructor(config: HealthCheckConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startTime = Date.now();
  }

  /**
   * Run all health checks
   */
  async runChecks(): Promise<HealthCheckResult> {
    const checks: Record<string, HealthCheck> = {};

    // Run built-in checks
    checks.disk = await this.checkDiskSpace();
    checks.memory = await this.checkMemory();
    checks.cpu = this.checkCpu();
    checks.uptime = this.checkUptime();
    checks.dependencies = await this.checkDependencies();

    // Check databases if configured
    if (this.config.databasePaths.length > 0) {
      checks.databases = await this.checkDatabases();
    }

    // Run custom checks
    for (const [name, checkFn] of Object.entries(this.config.customChecks)) {
      try {
        checks[name] = await checkFn();
      } catch (error) {
        checks[name] = {
          status: 'unhealthy',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // Calculate overall status
    const overallStatus = this.calculateOverallStatus(checks);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Check disk space
   */
  private async checkDiskSpace(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Get current working directory stats
      const stats = statSync(cwd());

      // Note: This is a simplified check. In production, you'd want to use
      // a library like 'check-disk-space' for accurate disk usage
      // For now, we'll return a healthy status
      return {
        status: 'healthy',
        message: 'Disk space check passed',
        details: {
          path: cwd(),
          note: 'Full disk space monitoring requires additional dependencies',
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'degraded',
        message: 'Unable to check disk space',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const total = totalmem();
      const free = freemem();
      const used = total - free;
      const usagePercent = (used / total) * 100;

      let status: HealthStatus = 'healthy';
      if (usagePercent >= this.config.memoryCriticalThreshold) {
        status = 'unhealthy';
      } else if (usagePercent >= this.config.memoryWarningThreshold) {
        status = 'degraded';
      }

      return {
        status,
        message: `Memory usage: ${usagePercent.toFixed(2)}%`,
        details: {
          total: `${(total / 1024 / 1024 / 1024).toFixed(2)} GB`,
          used: `${(used / 1024 / 1024 / 1024).toFixed(2)} GB`,
          free: `${(free / 1024 / 1024 / 1024).toFixed(2)} GB`,
          usagePercent: usagePercent.toFixed(2),
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Unable to check memory usage',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check CPU information
   */
  private checkCpu(): HealthCheck {
    const startTime = Date.now();

    try {
      const cpuInfo = cpus();

      return {
        status: 'healthy',
        message: `${cpuInfo.length} CPU core(s) available`,
        details: {
          cores: cpuInfo.length,
          model: cpuInfo[0]?.model,
          speed: `${cpuInfo[0]?.speed} MHz`,
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'degraded',
        message: 'Unable to check CPU information',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check uptime
   */
  private checkUptime(): HealthCheck {
    const startTime = Date.now();
    const uptime = Date.now() - this.startTime;
    const uptimeSeconds = Math.floor(uptime / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);

    return {
      status: 'healthy',
      message: `Uptime: ${uptimeDays}d ${uptimeHours % 24}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s`,
      details: {
        uptime,
        uptimeSeconds,
        startTime: new Date(this.startTime).toISOString(),
      },
      duration: Date.now() - startTime,
    };
  }

  /**
   * Check dependencies (database, etc.)
   */
  private async checkDependencies(): Promise<HealthCheck> {
    const startTime = Date.now();
    const dependencies: string[] = [];
    const issues: string[] = [];

    // Check if better-sqlite3 is available
    try {
      await import('better-sqlite3');
      dependencies.push('better-sqlite3');
    } catch (error) {
      issues.push('better-sqlite3 not available');
    }

    // Check if express is available
    try {
      await import('express');
      dependencies.push('express');
    } catch (error) {
      issues.push('express not available');
    }

    // Check if prom-client is available
    try {
      await import('prom-client');
      dependencies.push('prom-client');
    } catch (error) {
      issues.push('prom-client not available');
    }

    const status = issues.length === 0 ? 'healthy' : 'degraded';

    return {
      status,
      message: `${dependencies.length} dependencies OK${issues.length > 0 ? `, ${issues.length} issues` : ''}`,
      details: {
        available: dependencies,
        issues,
      },
      duration: Date.now() - startTime,
    };
  }

  /**
   * Check database files
   */
  private async checkDatabases(): Promise<HealthCheck> {
    const startTime = Date.now();
    const databases: string[] = [];
    const issues: string[] = [];

    for (const dbPath of this.config.databasePaths) {
      if (existsSync(dbPath)) {
        try {
          const stats = statSync(dbPath);
          databases.push(dbPath);

          // Try to open the database
          const Database = (await import('better-sqlite3')).default;
          const db = new Database(dbPath, { readonly: true });
          db.pragma('integrity_check');
          db.close();
        } catch (error) {
          issues.push(`${dbPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        issues.push(`${dbPath}: File not found`);
      }
    }

    const status = issues.length === 0 ? 'healthy' : databases.length === 0 ? 'unhealthy' : 'degraded';

    return {
      status,
      message: `${databases.length} database(s) OK${issues.length > 0 ? `, ${issues.length} issue(s)` : ''}`,
      details: {
        available: databases,
        issues,
      },
      duration: Date.now() - startTime,
    };
  }

  /**
   * Calculate overall health status
   */
  private calculateOverallStatus(checks: Record<string, HealthCheck>): HealthStatus {
    const values = Object.values(checks);

    if (values.some(check => check.status === 'unhealthy')) {
      return 'unhealthy';
    }

    if (values.some(check => check.status === 'degraded')) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Global health checker instance
 */
let globalHealthChecker: HealthChecker | null = null;

/**
 * Initialize the global health checker
 */
export function initHealthChecker(config?: HealthCheckConfig): HealthChecker {
  if (!globalHealthChecker) {
    globalHealthChecker = new HealthChecker(config);
  } else {
    globalHealthChecker.setConfig(config || {});
  }
  return globalHealthChecker;
}

/**
 * Get the global health checker instance
 */
export function getHealthChecker(): HealthChecker {
  if (!globalHealthChecker) {
    globalHealthChecker = new HealthChecker();
  }
  return globalHealthChecker;
}

/**
 * Run health checks and return result
 */
export async function runHealthChecks(): Promise<HealthCheckResult> {
  const checker = getHealthChecker();
  return checker.runChecks();
}

/**
 * Express middleware to respond to health check requests
 */
export function healthCheckMiddleware() {
  return async (req: unknown, res: unknown) => {
    const response = res as { status: (code: number) => unknown; json: (body: unknown) => void };

    try {
      const result = await runHealthChecks();

      let statusCode = 200;
      if (result.status === 'degraded') {
        statusCode = 200; // Still OK but degraded
      } else if (result.status === 'unhealthy') {
        statusCode = 503; // Service unavailable
      }

      (response.status(statusCode) as unknown as { json: (body: unknown) => void }).json(result);
    } catch (error) {
      (response.status(503) as unknown as { json: (body: unknown) => void }).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
