/**
 * Authentication and Authorization Type Definitions
 */

import type { Request } from 'express';

/**
 * User roles in the system
 */
export type UserRole = 'admin' | 'read-write' | 'read-only';

/**
 * Permission types for access control
 */
export type Permission = 'read' | 'write' | 'execute' | 'admin';

/**
 * Authentication methods
 */
export type AuthMethod = 'jwt' | 'api-key' | 'basic' | 'session';

/**
 * Resource types for authorization
 */
export type ResourceType = 'database' | 'table' | 'query';

/**
 * User interface representing a user in the system
 */
export interface User {
  /** Unique user identifier */
  id: string;
  /** Username for login */
  username: string;
  /** Bcrypt hashed password */
  passwordHash: string;
  /** User role determining permissions */
  role: UserRole;
  /** Timestamp when user was created */
  createdAt: Date;
  /** Timestamp of last login (optional) */
  lastLogin?: Date;
  /** List of databases this user can access (optional, for non-admin users) */
  allowedDatabases?: string[];
}

/**
 * User data without sensitive information
 */
export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * Authentication context attached to requests
 */
export interface AuthContext {
  /** Authenticated user */
  user: SafeUser;
  /** Authentication method used */
  method: AuthMethod;
  /** Token or credential used (optional) */
  token?: string;
}

/**
 * Resource for authorization checks
 */
export interface Resource {
  /** Type of resource */
  type: ResourceType;
  /** Resource identifier (e.g., database path or table name) */
  identifier?: string;
}

/**
 * Authorization result
 */
export interface AuthorizationResult {
  /** Whether access is allowed */
  allowed: boolean;
  /** Reason for denial (if denied) */
  reason?: string;
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
  /** User ID */
  userId: string;
  /** Username */
  username: string;
  /** User role */
  role: UserRole;
  /** Issued at timestamp */
  iat?: number;
  /** Expiration timestamp */
  exp?: number;
}

/**
 * Login request body
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Login response
 */
export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: SafeUser;
  message?: string;
}

/**
 * Change password request body
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * Create user request body
 */
export interface CreateUserRequest {
  username: string;
  password: string;
  role: UserRole;
  allowedDatabases?: string[];
}

/**
 * Password validation result
 */
export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Password policy configuration
 */
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

/**
 * JWT configuration
 */
export interface JWTConfig {
  secret: string;
  expiresIn: string;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  secret: string;
  maxAge: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}

/**
 * API keys configuration
 */
export interface APIKeysConfig {
  enabled: boolean;
  keys: string[];
  headerName: string;
}

/**
 * Basic auth configuration
 */
export interface BasicAuthConfig {
  enabled: boolean;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  type: 'file' | 'memory';
  filePath?: string;
}

/**
 * Complete authentication configuration
 */
export interface AuthConfig {
  enabled: boolean;
  jwt: JWTConfig;
  session: SessionConfig;
  apiKeys: APIKeysConfig;
  basicAuth: BasicAuthConfig;
  storage: StorageConfig;
  passwordPolicy: PasswordPolicy;
}

/**
 * Extended Express Request with authentication context
 */
export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

/**
 * User creation options
 */
export interface CreateUserOptions {
  username: string;
  password: string;
  role: UserRole;
  allowedDatabases?: string[];
}

/**
 * User update options
 */
export interface UpdateUserOptions {
  role?: UserRole;
  allowedDatabases?: string[];
}

/**
 * Session data structure
 */
export interface SessionData {
  userId: string;
  username: string;
  role: UserRole;
  createdAt: number;
  expiresAt: number;
}

/**
 * Public authentication configuration (safe to expose to clients)
 */
export interface PublicAuthConfig {
  enabled: boolean;
  methods: {
    jwt: boolean;
    apiKeys: boolean;
    basicAuth: boolean;
    session: boolean;
  };
}
