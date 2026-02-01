/**
 * Authentication and Authorization Type Definitions
 */

/**
 * User roles in the system
 */
export type UserRole = 'admin' | 'read-write' | 'read-only';

/**
 * Permission types for database operations
 */
export type Permission = 'read' | 'write' | 'execute' | 'admin';

/**
 * User account information
 */
export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  lastLogin?: Date;
  allowedDatabases?: string[];
}

/**
 * JWT payload structure
 */
export interface JwtPayload {
  userId: string;
  username: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * Authentication method used
 */
export type AuthMethod = 'jwt' | 'api-key' | 'basic' | 'session';

/**
 * Authenticated user context attached to requests
 */
export interface AuthContext {
  user: User;
  method: AuthMethod;
  token?: string;
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
  user?: {
    id: string;
    username: string;
    role: UserRole;
  };
  message?: string;
}

/**
 * Resource being accessed
 */
export interface Resource {
  type: 'database' | 'table' | 'system';
  identifier?: string;
}

/**
 * Authorization check result
 */
export interface AuthzResult {
  allowed: boolean;
  reason?: string;
}
