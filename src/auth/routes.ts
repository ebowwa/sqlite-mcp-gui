/**
 * Authentication Routes
 *
 * Provides endpoints for login, logout, token management, and user info
 */

import express from 'express';
import cookieParser from 'cookie-parser';

// Extract types from express
type Router = express.Router;
type Request = express.Request;
type Response = express.Response;
type NextFunction = (err?: Error | string | any) => void;

const router = express.Router();
import {
  authenticateUser,
  changePassword,
  listUsers,
  createUser,
  getUserById,
  updateUserRole,
  updateUserDatabases,
  deleteUser,
} from './users.js';
import { authConfig, checkSecurityConfiguration } from './auth.config.js';
import {
  requireAdmin,
  optionalAuth,
  type AuthenticatedRequest,
} from './middleware.js';
import type {
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  CreateUserRequest,
  PublicAuthConfig,
  SafeUser,
  UserRole,
} from './types.js';


/**
 * Setup cookie parser middleware for session management
 *
 * @param app - Express application
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
router.post(
  '/login',
  async (req: Request, res: Response): Promise<void> => {
    // If auth is disabled, return a special response
    if (!authConfig.enabled) {
      res.json({
        success: true,
        message: 'Authentication is disabled',
        user: {
          id: 'anonymous',
          username: 'anonymous',
          role: 'admin' as UserRole,
          createdAt: new Date(),
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
        } as LoginResponse);
        return;
      }

      // Authenticate user
      const user = await authenticateUser(username, password);

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Invalid username or password',
        } as LoginResponse);
        return;
      }

      // Dynamic import for jwt
      const jwt = (await import('jsonwebtoken')).default;

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
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          allowedDatabases: user.allowedDatabases,
        },
      } as LoginResponse);
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      } as LoginResponse);
    }
  }
);

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
router.get(
  '/me',
  optionalAuth as any,
  (req: AuthenticatedRequest, res: Response): void => {
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
        allowedDatabases: req.auth.user.allowedDatabases,
      },
      method: req.auth.method,
    });
  }
);

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
router.post(
  '/change-password',
  optionalAuth as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
      const { currentPassword, newPassword } =
        req.body as ChangePasswordRequest;

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          success: false,
          message: 'Current password and new password are required',
        });
        return;
      }

      // Get user with password hash
      const bcrypt = (await import('bcrypt')).default;
      const userWithHash = await (
        await import('./users.js')
      ).findUserByUsername(req.auth.user.username);

      if (!userWithHash) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Verify current password
      const isValid = await bcrypt.compare(
        currentPassword,
        userWithHash.passwordHash
      );

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

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  }
);

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
router.post(
  '/users',
  requireAdmin as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!authConfig.enabled) {
      res.status(400).json({
        success: false,
        message: 'Authentication is disabled',
      });
      return;
    }

    try {
      const { username, password, role, allowedDatabases } =
        req.body as CreateUserRequest;

      if (!username || !password || !role) {
        res.status(400).json({
          success: false,
          message: 'Username, password, and role are required',
        });
        return;
      }

      // Validate role
      const validRoles: UserRole[] = ['admin', 'read-write', 'read-only'];

      if (!validRoles.includes(role)) {
        res.status(400).json({
          success: false,
          message: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
        });
        return;
      }

      // Create user
      const user = await createUser(username, password, role, allowedDatabases);

      res.status(201).json({
        success: true,
        user,
      });
    } catch (error) {
      console.error('Create user error:', error);

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create user';

      res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }
  }
);

/**
 * GET /auth/users
 *
 * List all users (admin only)
 */
router.get(
  '/users',
  requireAdmin as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!authConfig.enabled) {
      res.status(400).json({
        success: false,
        message: 'Authentication is disabled',
      });
      return;
    }

    try {
      const users = await listUsers();

      res.json({
        success: true,
        users,
      });
    } catch (error) {
      console.error('List users error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
);

/**
 * GET /auth/users/:userId
 *
 * Get a specific user (admin only)
 */
router.get(
  '/users/:userId',
  requireAdmin as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!authConfig.enabled) {
      res.status(400).json({
        success: false,
        message: 'Authentication is disabled',
      });
      return;
    }

    try {
      const { userId } = req.params;
      const user = await getUserById(userId);

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        user,
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
);

/**
 * PATCH /auth/users/:userId/role
 *
 * Update a user's role (admin only)
 */
router.patch(
  '/users/:userId/role',
  requireAdmin as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!authConfig.enabled) {
      res.status(400).json({
        success: false,
        message: 'Authentication is disabled',
      });
      return;
    }

    try {
      const { userId } = req.params;
      const { role } = req.body as { role: UserRole };

      if (!role) {
        res.status(400).json({
          success: false,
          message: 'Role is required',
        });
        return;
      }

      const validRoles: UserRole[] = ['admin', 'read-write', 'read-only'];

      if (!validRoles.includes(role)) {
        res.status(400).json({
          success: false,
          message: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
        });
        return;
      }

      await updateUserRole(userId, role);

      const user = await getUserById(userId);

      res.json({
        success: true,
        user,
      });
    } catch (error) {
      console.error('Update user role error:', error);

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update user role';

      res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }
  }
);

/**
 * PATCH /auth/users/:userId/databases
 *
 * Update a user's allowed databases (admin only)
 */
router.patch(
  '/users/:userId/databases',
  requireAdmin as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!authConfig.enabled) {
      res.status(400).json({
        success: false,
        message: 'Authentication is disabled',
      });
      return;
    }

    try {
      const { userId } = req.params;
      const { allowedDatabases } = req.body as { allowedDatabases: string[] };

      if (!Array.isArray(allowedDatabases)) {
        res.status(400).json({
          success: false,
          message: 'allowedDatabases must be an array',
        });
        return;
      }

      await updateUserDatabases(userId, allowedDatabases);

      const user = await getUserById(userId);

      res.json({
        success: true,
        user,
      });
    } catch (error) {
      console.error('Update user databases error:', error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to update user databases';

      res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }
  }
);

/**
 * DELETE /auth/users/:userId
 *
 * Delete a user (admin only)
 */
router.delete(
  '/users/:userId',
  requireAdmin as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!authConfig.enabled) {
      res.status(400).json({
        success: false,
        message: 'Authentication is disabled',
      });
      return;
    }

    try {
      const { userId } = req.params;

      // Prevent deleting yourself
      if (req.auth && req.auth.user.id === userId) {
        res.status(400).json({
          success: false,
          message: 'Cannot delete your own account',
        });
        return;
      }

      const deleted = await deleteUser(userId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
);

/**
 * GET /auth/config
 *
 * Get public authentication configuration
 * Returns whether auth is enabled and available auth methods
 */
router.get('/config', (req: Request, res: Response): void => {
  const config: PublicAuthConfig = {
    enabled: authConfig.enabled,
    methods: {
      jwt: true,
      apiKeys: authConfig.apiKeys.enabled,
      basicAuth: authConfig.basicAuth.enabled,
      session: true,
    },
  };

  res.json(config);
});

/**
 * GET /auth/health
 *
 * Health check endpoint for the authentication system
 * Returns security configuration warnings if any
 */
router.get('/health', (req: Request, res: Response): void => {
  const securityCheck = checkSecurityConfiguration();

  res.json({
    healthy: true,
    authEnabled: authConfig.enabled,
    secure: securityCheck.secure,
    warnings: securityCheck.warnings,
    storageType: authConfig.storage.type,
  });
});

export default router;
