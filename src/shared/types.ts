/**
 * Shared Type Definitions
 *
 * Common interfaces and types used across the application.
 */

/**
 * Database query result
 */
export interface QueryResult {
  success: boolean;
  rows?: unknown[];
  rowCount?: number;
  changes?: number;
  message?: string;
  error?: string;
}

/**
 * Table list response
 */
export interface TablesResult {
  success: boolean;
  tables?: string[];
  error?: string;
}

/**
 * Table schema column information
 */
export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/**
 * Table schema response
 */
export interface SchemaResult {
  success: boolean;
  table?: string;
  columns?: ColumnInfo[];
  error?: string;
}

/**
 * API error response
 */
export interface ApiError {
  success: false;
  error: string;
  code?: string;
  type: string;
}

/**
 * Database connection options
 */
export interface DatabaseOptions {
  readonly?: boolean;
  timeout?: number;
  fileMustExist?: boolean;
}

/**
 * SQL validation options
 */
export interface ValidationOptions {
  maxLength?: number;
  allowMultipleStatements?: boolean;
  allowedPatterns?: RegExp[];
  blockedPatterns?: RegExp[];
}
