/**
 * Structured Logging Module
 *
 * Provides JSON-based structured logging with correlation IDs,
 * log levels, and request/response tracking.
 *
 * @module monitoring/logger
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  request?: {
    method: string;
    path: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  };
  response?: {
    statusCode: number;
    duration?: number;
  };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level */
  level?: LogLevel;
  /** Enable JSON output */
  json?: boolean;
  /** Enable color output in console */
  colorize?: boolean;
  /** Include timestamp in logs */
  timestamp?: boolean;
  /** Log to file */
  file?: string;
  /** Enable request logging */
  logRequests?: boolean;
  /** Enable response logging */
  logResponses?: boolean;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: Required<LoggerConfig> = {
  level: LogLevel.INFO,
  json: true,
  colorize: false,
  timestamp: true,
  file: '',
  logRequests: true,
  logResponses: true,
};

/**
 * Logger class
 */
export class Logger {
  private config: Required<LoggerConfig>;
  private correlationId: string;

  constructor(config: LoggerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.correlationId = uuidv4();
  }

  /**
   * Create a child logger with a specific correlation ID
   */
  child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger(this.config);
    childLogger.correlationId = context.correlationId as string || uuidv4();
    return childLogger;
  }

  /**
   * Set correlation ID for this logger instance
   */
  setCorrelationId(correlationId: string): void {
    this.correlationId = correlationId;
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const errorContext = { ...context };

    if (error instanceof Error) {
      errorContext.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as unknown as { code?: string }).code,
      };
    } else if (error) {
      errorContext.error = {
        name: 'Unknown',
        message: String(error),
      };
    }

    this.log(LogLevel.ERROR, message, errorContext);
  }

  /**
   * Log an HTTP request
   */
  logRequest(req: {
    method: string;
    path: string;
    ip?: string;
    headers?: { 'user-agent'?: string };
  }): void {
    if (!this.config.logRequests) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message: 'Incoming request',
      correlationId: this.correlationId,
      request: {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
      },
    };

    this.write(entry);
  }

  /**
   * Log an HTTP response
   */
  logResponse(req: {
    method: string;
    path: string;
  }, res: {
    statusCode: number;
  }, duration: number): void {
    if (!this.config.logResponses) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO,
      message: 'Outgoing response',
      correlationId: this.correlationId,
      request: {
        method: req.method,
        path: req.path,
      },
      response: {
        statusCode: res.statusCode,
        duration,
      },
    };

    this.write(entry);
  }

  /**
   * Log a slow query
   */
  logSlowQuery(sql: string, duration: number, database: string): void {
    this.warn('Slow query detected', {
      query: sql.substring(0, 1000), // Limit query length
      duration,
      database,
      threshold: 1000,
    });
  }

  /**
   * Internal log method
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    // Check if we should log this level
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: this.correlationId,
      ...(context ? { context } : {}),
    };

    this.write(entry);
  }

  /**
   * Write log entry to output
   */
  private write(entry: LogEntry): void {
    const output = this.config.json ? JSON.stringify(entry) : this.formatLog(entry);
    console.log(output);
  }

  /**
   * Format log entry for non-JSON output
   */
  private formatLog(entry: LogEntry): string {
    const { timestamp, level, message, correlationId, context } = entry;
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level}]${correlationId ? ` [${correlationId}]` : ''} ${message}${contextStr}`;
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const logLevelIndex = levels.indexOf(level);
    return logLevelIndex >= currentLevelIndex;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }
}

/**
 * Global logger instance
 */
let globalLogger: Logger | null = null;

/**
 * Initialize the global logger
 */
export function initLogger(config?: LoggerConfig): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(config);
  }
  return globalLogger;
}

/**
 * Get the global logger instance
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

/**
 * Create a logger with a specific correlation ID
 */
export function createLogger(correlationId?: string): Logger {
  const logger = new Logger();
  if (correlationId) {
    logger.setCorrelationId(correlationId);
  }
  return logger;
}

/**
 * Express middleware to add request logging
 */
export function requestLoggingMiddleware() {
  return (req: unknown, res: unknown, next: () => void) => {
    const request = req as { method: string; path: string; ip?: string; headers?: { 'user-agent'?: string }; correlationId?: string };
    const response = res as { statusCode?: number; startTime?: number; on?: (event: string, listener: () => void) => void };

    // Add correlation ID to request
    request.correlationId = uuidv4();

    // Start timing
    response.startTime = Date.now();

    // Log request
    getLogger().logRequest(request);

    // Log response on finish
    response.on?.('finish', () => {
      const duration = response.startTime ? Date.now() - response.startTime : 0;
      getLogger().logResponse(
        { method: request.method, path: request.path },
        { statusCode: response.statusCode || 200 },
        duration
      );
    });

    next();
  };
}

/**
 * Express middleware to add correlation ID to response headers
 */
export function correlationIdMiddleware() {
  return (req: unknown, res: unknown, next: () => void) => {
    const request = req as { correlationId?: string; headers?: { 'x-correlation-id'?: string } };
    const response = res as { header: (name: string, value: string) => void };

    // Use existing correlation ID from header or generate new one
    const correlationId = request.headers?.['x-correlation-id'] || uuidv4();
    request.correlationId = correlationId;

    // Add to response headers
    response.header('X-Correlation-ID', correlationId);

    next();
  };
}
