/**
 * Application Constants
 *
 * Centralized constants for the SQLite MCP GUI application.
 * This includes configuration limits, timeouts, and other magic numbers.
 */

/**
 * Maximum allowed SQL query length in characters
 */
export const MAX_SQL_QUERY_LENGTH = 100000;

/**
 * Maximum database connection timeout in milliseconds
 */
export const DB_CONNECTION_TIMEOUT = 5000;

/**
 * Maximum request body size for Express
 */
export const MAX_REQUEST_SIZE = '10mb';

/**
 * Rate limiting window in milliseconds (5 minutes)
 */
export const RATE_LIMIT_WINDOW = 5 * 60 * 1000;

/**
 * Maximum requests per window per IP
 */
export const RATE_LIMIT_MAX_REQUESTS = 100;

/**
 * Query history maximum size
 */
export const MAX_QUERY_HISTORY_SIZE = 10;

/**
 * Default port for the web server
 */
export const DEFAULT_PORT = 3000;

/**
 * Maximum rows to display in table preview
 */
export const DEFAULT_PREVIEW_LIMIT = 100;

/**
 * SQL injection dangerous patterns
 */
export const DANGEROUS_SQL_PATTERNS = [
  /;\s*DROP\s+/i,
  /;\s*DELETE\s+FROM\s+\w+\s*$/i,
  /;\s*TRUNCATE/i,
  /;\s*ALTER\s+DATABASE/i,
] as const;

/**
 * Valid SQL statement types
 */
export const VALID_SQL_TYPES = {
  SELECT: 'SELECT',
  PRAGMA: 'PRAGMA',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  CREATE: 'CREATE',
  ALTER: 'ALTER',
  DROP: 'DROP',
} as const;

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

/**
 * Error types
 */
export const ERROR_TYPES = {
  VALIDATION: 'validation',
  DATABASE: 'database',
  NETWORK: 'network',
  INTERNAL: 'internal',
  NOT_FOUND: 'not_found',
} as const;
