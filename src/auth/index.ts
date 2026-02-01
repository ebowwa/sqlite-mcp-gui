/**
 * Authentication Module Index
 *
 * Exports all authentication-related functionality
 */

// Types
export type {
  User,
  SafeUser,
  UserRole,
  Permission,
  AuthMethod,
  ResourceType,
  AuthContext,
  Resource,
  AuthorizationResult,
  JWTPayload,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  CreateUserRequest,
  PasswordValidationResult,
  PasswordPolicy,
  JWTConfig,
  SessionConfig,
  APIKeysConfig,
  BasicAuthConfig,
  StorageConfig,
  AuthConfig,
  AuthenticatedRequest,
  CreateUserOptions,
  UpdateUserOptions,
  SessionData,
  PublicAuthConfig,
} from './types.js';

// Configuration
export { authConfig, validatePassword, checkSecurityConfiguration } from './auth.config.js';

// Middleware
export {
  authenticate,
  optionalAuth,
  requireRole,
  requireAdmin,
  requirePermission,
  requireReadPermission,
  requireWritePermission,
  requireExecutePermission,
} from './middleware.js';

// User management
export {
  createUser,
  findUserByUsername,
  findUserByUsernameSync,
  authenticateUser,
  changePassword,
  updateUserRole,
  updateUserDatabases,
  deleteUser,
  listUsers,
  getUserById,
  isStoreInitialized,
  getUserCount,
  resetUserStore,
  getUserStore,
} from './users.js';

// Permissions
export {
  hasPermission,
  canAccessResource,
  getRolePermissions,
  canExecuteSQL,
  canWriteDatabase,
  canReadDatabase,
  canPerformAdmin,
  getRoleDescription,
  getAllRoles,
  isValidRole,
  filterAccessibleResources,
  createResource,
  AuthorizationError,
  requireAuthorization,
  requirePermission as requirePermissionFn,
  requireAdminRole,
  getUserPermissionSummary,
} from './permissions.js';

// Routes
export { default as authRoutes, setupCookieParser } from './routes.js';

// Re-export the router for direct mounting
export { default as Router } from './routes.js';
