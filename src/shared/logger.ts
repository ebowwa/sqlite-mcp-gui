/**
 * Logger Utilities
 *
 * Provides structured logging with different levels and formatting.
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LoggerOptions {
  level?: LogLevel;
  timestamp?: boolean;
  colorize?: boolean;
}

const COLORS = {
  [LogLevel.DEBUG]: '\x1b[36m', // Cyan
  [LogLevel.INFO]: '\x1b[32m', // Green
  [LogLevel.WARN]: '\x1b[33m', // Yellow
  [LogLevel.ERROR]: '\x1b[31m', // Red
  RESET: '\x1b[0m',
};

export class Logger {
  private level: LogLevel;
  private timestamp: boolean;
  private colorize: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level || LogLevel.INFO;
    this.timestamp = options.timestamp !== false;
    this.colorize = options.colorize !== false;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = this.timestamp ? `[${new Date().toISOString()}] ` : '';
    const levelStr = this.colorize ? `${COLORS[level]}${level}${COLORS.RESET}` : level;
    return `${timestamp}${levelStr}: ${message}`;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage(LogLevel.DEBUG, message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(LogLevel.INFO, message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message), ...args);
    }
  }

  error(message: string, error?: Error | unknown, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(LogLevel.ERROR, message), error, ...args);
    }
  }
}

// Create default logger instance
export const logger = new Logger({
  level: process.env.LOG_LEVEL ? (process.env.LOG_LEVEL as LogLevel) : LogLevel.INFO,
});

// Create request logger middleware for Express
export function createRequestLogger(logger: Logger) {
  return (req: { method: string; path: string; ip?: string }, res: unknown, next: () => void) => {
    const ip = req.ip || 'unknown';
    logger.info(`${req.method} ${req.path} from ${ip}`);
    next();
  };
}
