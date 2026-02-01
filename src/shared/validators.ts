/**
 * Validation Utilities
 *
 * Input validation and sanitization functions.
 */

import {
  MAX_SQL_QUERY_LENGTH,
  DANGEROUS_SQL_PATTERNS,
} from './constants.js';
import {
  SQLValidationError,
  ValidationError,
} from './errors.js';

/**
 * Validate and sanitize SQL query
 *
 * @param sql - The SQL query to validate
 * @param options - Validation options
 * @returns Sanitized SQL query
 * @throws {SQLValidationError} If validation fails
 */
export function validateSQL(
  sql: string,
  options: {
    maxLength?: number;
    allowMultipleStatements?: boolean;
  } = {}
): string {
  const { maxLength = MAX_SQL_QUERY_LENGTH, allowMultipleStatements = false } = options;

  const trimmed = sql.trim();

  // Check if empty
  if (trimmed.length === 0) {
    throw new SQLValidationError('SQL query cannot be empty');
  }

  // Check length
  if (trimmed.length > maxLength) {
    throw new SQLValidationError(
      `SQL query too large (max ${maxLength.toLocaleString()} characters)`
    );
  }

  // Check for multiple statements
  if (!allowMultipleStatements) {
    const statementCount = (trimmed.match(/;/g) || []).length;
    if (statementCount > 1) {
      throw new SQLValidationError('Multiple SQL statements are not allowed');
    }
  }

  // Check for dangerous patterns (basic SQL injection detection)
  for (const pattern of DANGEROUS_SQL_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new SQLValidationError('Potentially dangerous SQL pattern detected');
    }
  }

  return trimmed;
}

/**
 * Validate database path
 *
 * @param dbPath - The database path to validate
 * @throws {ValidationError} If validation fails
 */
export function validateDatabasePath(dbPath: string): void {
  if (!dbPath || typeof dbPath !== 'string') {
    throw new ValidationError('Database path is required');
  }

  const trimmed = dbPath.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('Database path cannot be empty');
  }

  // Check for path traversal attempts
  if (trimmed.includes('..')) {
    throw new ValidationError('Invalid database path: path traversal not allowed');
  }

  // Check for suspicious characters (basic check)
  if (/[<>:"|?*\x00-\x1F]/.test(trimmed)) {
    throw new ValidationError('Database path contains invalid characters');
  }
}

/**
 * Validate table name
 *
 * @param tableName - The table name to validate
 * @throws {ValidationError} If validation fails
 */
export function validateTableName(tableName: string): void {
  if (!tableName || typeof tableName !== 'string') {
    throw new ValidationError('Table name is required');
  }

  const trimmed = tableName.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('Table name cannot be empty');
  }

  // SQL identifier validation (basic check)
  // Must start with letter or underscore, followed by letters, numbers, or underscores
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    throw new ValidationError(
      'Invalid table name. Must start with letter or underscore, followed by letters, numbers, or underscores'
    );
  }

  // Check length (SQLite has limits)
  if (trimmed.length > 128) {
    throw new ValidationError('Table name too long (max 128 characters)');
  }
}

/**
 * Validate required fields in request body
 *
 * @param required - Array of required field names
 * @param body - Request body object
 * @throws {ValidationError} If validation fails
 */
export function validateRequestBody(required: string[], body: Record<string, unknown>): void {
  const missing: string[] = [];

  for (const field of required) {
    if (!body[field]) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * Sanitize string output to prevent XSS
 *
 * @param text - Text to sanitize
 * @returns Sanitized text
 */
export function sanitizeOutput(text: string | number | null | undefined): string {
  if (text === null || text === undefined) {
    return '';
  }

  const str = String(text);

  // Basic HTML escaping
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate and parse integer parameter
 *
 * @param value - Value to parse
 * @param defaultValue - Default value if parsing fails
 * @param min - Minimum value (optional)
 * @param max - Maximum value (optional)
 * @returns Parsed integer or default value
 */
export function parseIntParam(
  value: unknown,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const parsed = parseInt(String(value), 10);

  if (isNaN(parsed)) {
    return defaultValue;
  }

  const clamped = min !== undefined ? Math.max(min, parsed) : parsed;
  const final = max !== undefined ? Math.min(max, clamped) : clamped;

  return final;
}
