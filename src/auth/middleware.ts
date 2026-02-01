/**
 * Authentication Middleware
 */

import type { Request, Response, NextFunction } from 'express';
import { Buffer } from 'buffer';
import bcrypt from 'bcrypt';
import { findUserByUsernameSync } from './users.js';
import { authConfig } from './auth.config.js';
import type {
  AuthContext,
  AuthenticatedRequest,
  AuthMethod,
  UserRole,
  Permission,
  SafeUser,
} from './types.js';

// Re-export AuthenticatedRequest type for use in routes
export type { AuthenticatedRequest };

/**
 * Send authentication failure response
 *
 * @param res - Express response object
 * @param message - Error message
 */
function authFailed(res: Response, message: string = 'Authentication required'): void {
  res.status(401).json({
    error: message,
    code: 'AUTH_FAILED',
  });
}

/**
 * Send authorization failure response
 *
 * @param res - Express response object
 * @param message - Error message
 */
function authzFailed(res: Response, message = 'Insufficient permissions'): void {
  res.status(403).json({
    error: message,
    code: 'AUTHZ_FAILED',
  });
}

/**
 * Authenticate using JWT token from Authorization header
 *
 * @param req - Express request object
 * @returns Authentication context or null if authentication fails
 */
async function authenticateJWT(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    // Dynamic import for jwt
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, authConfig.jwt.secret) as {
      username: string;
    };

    const user = findUserByUsernameSync(decoded.username);

    if (!user) {
      return null;
    }

    return {
      user: { ...user, passwordHash: '' } as SafeUser,
      method: 'jwt',
      token,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Authenticate using API key from headers
 *
 * @param req - Express request object
 * @returns Authentication context or null if authentication fails
 */
function authenticateAPIKey(req: Request): AuthContext | null {
  if (!authConfig.apiKeys.enabled) {
    return null;
  }

  const apiKey = req.headers[authConfig.apiKeys.headerName.toLowerCase() as keyof typeof req.headers] as string;

  if (!apiKey) {
    return null;
  }

  if (!authConfig.apiKeys.keys.includes(apiKey)) {
    return null;
  }

  const pseudoUser: SafeUser = {
    id: `apikey_${apiKey.substring(0, 8)}`,
    username: `api_key_${apiKey.substring(0, 8)}`,
    passwordHash: '',
    role: 'admin',
    createdAt: new Date(),
  };

  return {
    user: pseudoUser,
    method: 'api-key',
    token: apiKey,
  };
}

/**
 * Authenticate using HTTP Basic Authentication
 *
 * @param req - Express request object
 * @returns Authentication context or null if authentication fails
 */
async function authenticateBasicAuth(req: Request): Promise<AuthContext | null> {
  if (!authConfig.basicAuth.enabled) {
    return null;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }

  const base64Credentials = authHeader.substring(6);
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');

  if (!username || !password) {
    return null;
  }

  const user = findUserByUsernameSync(username);

  if (!user) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  return {
    user: { ...user, passwordHash: '' } as SafeUser,
    method: 'basic',
  };
}

/**
 * Authenticate using session cookie
 *
 * @param req - Express request object
 * @returns Authentication context or null if authentication fails
 */
async function authenticateSession(req: Request): Promise<AuthContext | null> {
  const sessionCookie = (req.cookies as { session?: string })?.session;

  if (!sessionCookie) {
    return null;
  }

  try {
    // Dynamic import for jwt
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(sessionCookie, authConfig.session.secret) as {
      username: string;
    };

    const user = findUserByUsernameSync(decoded.username);

    if (!user) {
      return null;
    }

    return {
      user: { ...user, passwordHash: '' } as SafeUser,
      method: 'session',
      token: sessionCookie,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Main authentication middleware
 * Attempts multiple authentication methods in order:
 * 1. JWT (Bearer token)
 * 2. API Key
 * 3. Session cookie
 * 4. Basic Auth
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // If auth is disabled, skip authentication
  if (!authConfig.enabled) {
    return next();
  }

  let authContext: AuthContext | null = null;

  // Try JWT authentication
  authContext = await authenticateJWT(req);

  // Try API key authentication
  if (!authContext) {
    authContext = authenticateAPIKey(req);
  }

  // Try session authentication
  if (!authContext) {
    authContext = await authenticateSession(req);
  }

  // Try basic authentication
  if (!authContext) {
    authContext = await authenticateBasicAuth(req);
  }

  // If all methods failed, return 401
  if (!authContext) {
    return authFailed(res);
  }

  // Attach auth context to request
  req.auth = authContext;
  next();
}

/**
 * Optional authentication middleware
 * Attaches auth context if available, but doesn't require it
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // If auth is disabled, skip authentication
  if (!authConfig.enabled) {
    return next();
  }

  let authContext: AuthContext | null = null;

  // Try all authentication methods
  authContext = await authenticateJWT(req);

  if (!authContext) {
    authContext = authenticateAPIKey(req);
  }

  if (!authContext) {
    authContext = await authenticateSession(req);
  }

  if (!authContext) {
    authContext = await authenticateBasicAuth(req);
  }

  // Attach auth context if available
  if (authContext) {
    req.auth = authContext;
  }

  next();
}

/**
 * Middleware factory to require a specific role
 * Admin users always pass this check
 *
 * @param role - Required role
 * @returns Express middleware function
 */
export function requireRole(role: UserRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!authConfig.enabled) {
      return next();
    }

    if (!req.auth) {
      return authFailed(res);
    }

    if (req.auth.user.role !== role && req.auth.user.role !== 'admin') {
      return authzFailed(res, `Role '${role}' required`);
    }

    next();
  };
}

/**
 * Middleware to require admin role
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!authConfig.enabled) {
    return next();
  }

  if (!req.auth) {
    return authFailed(res);
  }

  if (req.auth.user.role !== 'admin') {
    return authzFailed(res, 'Admin role required');
  }

  next();
}

/**
 * Middleware factory to require a specific permission
 * Admin users always pass this check
 *
 * @param permission - Required permission
 * @returns Express middleware function
 */
export function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!authConfig.enabled) {
      return next();
    }

    if (!req.auth) {
      return authFailed(res);
    }

    const role = req.auth.user.role;

    // Admins have all permissions
    if (role === 'admin') {
      return next();
    }

    // Define permissions for each role
    const rolePermissions: Record<UserRole, Permission[]> = {
      admin: ['read', 'write', 'execute', 'admin'],
      'read-write': ['read', 'write', 'execute'],
      'read-only': ['read'],
    };

    const allowedPermissions = rolePermissions[role] || [];

    if (!allowedPermissions.includes(permission)) {
      return authzFailed(res, `Permission '${permission}' required`);
    }

    next();
  };
}

/**
 * Middleware to ensure the user can read databases
 */
export const requireReadPermission = requirePermission('read');

/**
 * Middleware to ensure the user can write to databases
 */
export const requireWritePermission = requirePermission('write');

/**
 * Middleware to ensure the user can execute SQL queries
 */
export const requireExecutePermission = requirePermission('execute');
