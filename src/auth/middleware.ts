/**
 * Authentication Middleware
 */

import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { findUserByUsernameSync } from './users.js';
import { authConfig } from './auth.config.js';
import type { AuthContext, AuthMethod, JwtPayload } from './types.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function authFailed(res: Response, message: string = 'Authentication required'): void {
  res.status(401).json({
    error: message,
    code: 'AUTH_FAILED',
  });
}

function authzFailed(res: Response, message: string = 'Insufficient permissions'): void {
  res.status(403).json({
    error: message,
    code: 'AUTHZ_FAILED',
  });
}

function authenticateJWT(req: Request): AuthContext | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, authConfig.jwt.secret) as JwtPayload;

    const user = findUserByUsername(decoded.username);
    if (!user) {
      return null;
    }

    return {
      user: { ...user, passwordHash: '' },
      method: 'jwt',
      token,
    };
  } catch (error) {
    return null;
  }
}

function authenticateAPIKey(req: Request): AuthContext | null {
  if (!authConfig.apiKeys.enabled) {
    return null;
  }

  const apiKey = req.headers[authConfig.apiKeys.headerName.toLowerCase()] as string;

  if (!apiKey) {
    return null;
  }

  if (!authConfig.apiKeys.keys.includes(apiKey)) {
    return null;
  }

  const pseudoUser = {
    id: `apikey_${apiKey.substring(0, 8)}`,
    username: `api_key_${apiKey.substring(0, 8)}`,
    passwordHash: '',
    role: 'admin' as const,
    createdAt: new Date(),
  };

  return {
    user: pseudoUser,
    method: 'api-key',
    token: apiKey,
  };
}

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

  const user = await findUserByUsername(username);
  if (!user) {
    return null;
  }

  const bcrypt = await import('bcrypt');
  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  return {
    user: { ...user, passwordHash: '' },
    method: 'basic',
  };
}

function authenticateSession(req: Request): AuthContext | null {
  const sessionCookie = req.cookies?.session;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decoded = jwt.verify(sessionCookie, authConfig.session.secret) as JwtPayload;

    const user = findUserByUsername(decoded.username);
    if (!user) {
      return null;
    }

    return {
      user: { ...user, passwordHash: '' },
      method: 'session',
      token: sessionCookie,
    };
  } catch (error) {
    return null;
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!authConfig.enabled) {
    return next();
  }

  let authContext: AuthContext | null = null;

  authContext = authenticateJWT(req);

  if (!authContext) {
    authContext = authenticateAPIKey(req);
  }

  if (!authContext) {
    authContext = authenticateSession(req);
  }

  if (!authContext) {
    authContext = await authenticateBasicAuth(req);
  }

  if (!authContext) {
    return authFailed(res);
  }

  req.auth = authContext;
  next();
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!authConfig.enabled) {
    return next();
  }

  let authContext: AuthContext | null = null;

  authContext = authenticateJWT(req);

  if (!authContext) {
    authContext = authenticateAPIKey(req);
  }

  if (!authContext) {
    authContext = authenticateSession(req);
  }

  if (!authContext) {
    authContext = await authenticateBasicAuth(req);
  }

  if (authContext) {
    req.auth = authContext;
  }

  next();
}

export function requireRole(role: 'admin' | 'read-write' | 'read-only') {
  return (req: Request, res: Response, next: NextFunction): void => {
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

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
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

export function requirePermission(permission: 'read' | 'write' | 'execute' | 'admin') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!authConfig.enabled) {
      return next();
    }

    if (!req.auth) {
      return authFailed(res);
    }

    const role = req.auth.user.role;

    if (role === 'admin') {
      return next();
    }

    const rolePermissions: Record<string, string[]> = {
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
