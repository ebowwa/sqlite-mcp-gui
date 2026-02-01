/**
 * Authentication Routes
 *
 * Provides endpoints for login, logout, token management, and user info
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import { authenticateUser, findUserByUsername, changePassword, listUsers, createUser } from './users.js';
import { authConfig } from './auth.config.js';
import { requireAdmin, optionalAuth } from './middleware.js';
import type { LoginRequest, LoginResponse } from './types.js';

const router = Router();

/**
 * Parse cookies for session management
 */
export function setupCookieParser(app: any): void {
  app.use(cookieParser(authConfig.session.secret));
}

/**
 * POST /auth/login
 *
 * Authenticate with username/password and receive a JWT token
 *
 * Request body:
 * {
 *   "username": "admin",
 *   "password": "password123"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "token": "jwt_token_here",
 *   "user": { "id": "...", "username": "...", "role": "..." }
 * }
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  // If auth is disabled, return a special response
  if (!authConfig.enabled) {
    res.json({
      success: true,
      message: 'Authentication is disabled',
      user: {
        id: 'anonymous',
        username: 'anonymous',
        role: 'admin',
      },
    } as LoginResponse);
    return;
  }

  try {
    const { username, password } = req.body as LoginRequest;

    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
      return;
    }

    // Authenticate user
    const user = await authenticateUser(username, password);

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
      },
      authConfig.jwt.secret,
      { expiresIn: authConfig.jwt.expiresIn }
    );

    // Set session cookie
    res.cookie('session', token, {
      httpOnly: authConfig.session.httpOnly,
      secure: authConfig.session.secure,
      sameSite: authConfig.session.sameSite,
      maxAge: authConfig.session.maxAge,
    });

    // Return token and user info
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    } as LoginResponse);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * POST /auth/logout
 *
 * Clear the session cookie
 */
router.post('/logout', (req: Request, res: Response): void => {
  res.clearCookie('session');
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * GET /auth/me
 *
 * Get current user information
 * Requires authentication (returns 401 if not authenticated)
 */
router.get('/me', optionalAuth, (req: Request, res: Response): void => {
  if (!authConfig.enabled) {
    res.json({
      authenticated: false,
      message: 'Authentication is disabled',
    });
    return;
  }

  if (!req.auth) {
    res.status(401).json({
      authenticated: false,
      message: 'Not authenticated',
    });
    return;
  }

  res.json({
    authenticated: true,
    user: {
      id: req.auth.user.id,
      username: req.auth.user.username,
      role: req.auth.user.role,
      createdAt: req.auth.user.createdAt,
      lastLogin: req.auth.user.lastLogin,
    },
    method: req.auth.method,
  });
});

/**
 * POST /auth/change-password
 *
 * Change the current user's password
 *
 * Request body:
 * {
 *   "currentPassword": "old_password",
 *   "newPassword": "new_password"
 * }
 */
router.post('/change-password', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  if (!authConfig.enabled) {
    res.status(400).json({
      success: false,
      message: 'Authentication is disabled',
    });
    return;
  }

  if (!req.auth) {
    res.status(401).json({
      success: false,
      message: 'Not authenticated',
    });
    return;
  }

  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
      return;
    }

    // Verify current password
    const bcrypt = await import('bcrypt');
    const isValid = await bcrypt.compare(currentPassword, req.auth.user.passwordHash);

    if (!isValid) {
      res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
      return;
    }

    // Change password
    await changePassword(req.auth.user.id, newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * POST /auth/users
 *
 * Create a new user (admin only)
 *
 * Request body:
 * {
 *   "username": "newuser",
 *   "password": "password123",
 *   "role": "read-write"
 * }
 */
router.post('/users', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  if (!authConfig.enabled) {
    res.status(400).json({
      success: false,
      message: 'Authentication is disabled',
    });
    return;
  }

  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      res.status(400).json({
        success: false,
        message: 'Username, password, and role are required',
      });
      return;
    }

    // Validate role
    const validRoles = ['admin', 'read-write', 'read-only'];
    if (!validRoles.includes(role)) {
      res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
      });
      return;
    }

    // Create user
    const user = await createUser(username, password, role);

    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Create user error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create user',
    });
  }
});

/**
 * GET /auth/users
 *
 * List all users (admin only)
 */
router.get('/users', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  if (!authConfig.enabled) {
    res.status(400).json({
      success: false,
      message: 'Authentication is disabled',
    });
    return;
  }

  try {
    const users = await listUsers();

    // Don't expose password hashes
    const sanitizedUsers = users.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      allowedDatabases: user.allowedDatabases,
    }));

    res.json({
      success: true,
      users: sanitizedUsers,
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * GET /auth/config
 *
 * Get public authentication configuration
 * Returns whether auth is enabled and available auth methods
 */
router.get('/config', (req: Request, res: Response): void => {
  res.json({
    enabled: authConfig.enabled,
    methods: {
      jwt: true,
      apiKeys: authConfig.apiKeys.enabled,
      basicAuth: authConfig.basicAuth.enabled,
      session: true,
    },
  });
});

export default router;
