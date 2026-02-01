/**
 * Structured Logging Module
 *
 * Provides JSON-based structured logging with correlation IDs,
 * log levels, and request/response tracking.
 *
 * @module monitoring/logger
 */

import { v4 as uuidv4 } from 'uuid';
import type { Request, Response } from 'express';

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
 * Log entry context
 */
export interface LogContext {
  [key: string]: any;
}

/**
 * Error details
 */
export interface ErrorDetails {
  name?: string;
  message: string;
  stack?: string;
  code?: string | number;
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  context?: LogContext;
  error?: ErrorDetails;
  request?: {
    method: string;
    path: string;
    ip?: string;
    userAgent?: string;
  };
  response?: {
    statusCode: number;
    duration: number;
  };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level?: LogLevel;
  json?: boolean;
  colorize?: boolean;
  timestamp?: boolean;
  file?: string;
  logRequests?: boolean;
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
 * Extended Request type with correlation ID
 */
export interface RequestWithCorrelationId extends Request {
  correlationId?: string;
}

/**
 * Extended Response type with start time
 */
export interface ResponseWithStartTime extends Response {
  startTime?: number;
  header(name: string, value: string): this;
}

/**
 * Logger class
 */
export class Logger {
  private config: Required<LoggerConfig>;
  public correlationId: string;

  constructor(config: LoggerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.correlationId = uuidv4();
  }

  /**
   * Create a child logger with a specific correlation ID
   */
  child(context: { correlationId?: string }): Logger {
    const childLogger = new Logger(this.config);
    childLogger.correlationId = context.correlationId || uuidv4();
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
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext: LogContext = { ...context };

    if (error instanceof Error) {
      errorContext.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
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
  logRequest(req: RequestWithCorrelationId): void {
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
  logResponse(
    req: RequestWithCorrelationId,
    res: { statusCode: number },
    duration: number
  ): void {
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
  private log(level: LogLevel, message: string, context?: LogContext): void {
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
    const output = this.config.json
      ? JSON.stringify(entry)
      : this.formatLog(entry);
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
  return (req: RequestWithCorrelationId, res: ResponseWithStartTime, next: () => void) => {
    // Add correlation ID to request
    req.correlationId = uuidv4();

    // Start timing
    res.startTime = Date.now();

    // Log request
    getLogger().logRequest(req);

    // Log response on finish
    res.on?.('finish', () => {
      const duration = res.startTime ? Date.now() - res.startTime : 0;
      getLogger().logResponse(
        { method: req.method, path: req.path, correlationId: req.correlationId },
        { statusCode: res.statusCode || 200 },
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
  return (req: RequestWithCorrelationId, res: Response, next: () => void) => {
    // Use existing correlation ID from header or generate new one
    const correlationId = (req.headers?.['x-correlation-id'] as string) || uuidv4();
    req.correlationId = correlationId;

    // Add to response headers
    res.header('X-Correlation-ID', correlationId);

    next();
  };
}
