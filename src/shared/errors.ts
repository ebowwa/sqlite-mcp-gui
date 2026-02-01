/**
 * Custom Error Classes
 *
 * Specialized error types for better error handling and reporting.
 */

/**
 * Base application error
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends AppError {
  constructor(message: string, code?: string) {
    super(message, code, 500);
    this.name = 'DatabaseError';
  }
}

/**
 * Database connection error
 */
export class DatabaseConnectionError extends DatabaseError {
  constructor(message: string, public originalError?: Error) {
    super(message, 'DB_CONNECTION_ERROR');
    this.name = 'DatabaseConnectionError';
  }
}

/**
 * SQL query execution error
 */
export class QueryExecutionError extends DatabaseError {
  constructor(message: string, public sql?: string) {
    super(message, 'QUERY_EXECUTION_ERROR');
    this.name = 'QueryExecutionError';
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

/**
 * SQL validation error
 */
export class SQLValidationError extends ValidationError {
  constructor(message: string, public sql?: string) {
    super(message, 'SQL_VALIDATION_ERROR');
    this.name = 'SQLValidationError';
  }
}

/**
 * Authentication/Authorization errors
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Rate limiting error
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}
