/**
 * Role-Based Access Control (RBAC) and Authorization
 */

import type {
  User,
  Permission,
  UserRole,
  Resource,
  AuthorizationResult,
} from './types.js';

/**
 * Mapping of roles to their allowed permissions
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ['read', 'write', 'execute', 'admin'],
  'read-write': ['read', 'write', 'execute'],
  'read-only': ['read'],
};

/**
 * Check if a user has a specific permission
 *
 * @param user - The user to check
 * @param permission - The permission to check for
 * @returns True if the user has the permission
 */
export function hasPermission(user: User, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

/**
 * Check if a user can access a specific resource with a specific action
 *
 * @param user - The user to check
 * @param resource - The resource being accessed
 * @param action - The action being performed (permission type)
 * @returns Authorization result with allowed flag and optional reason
 */
export function canAccessResource(
  user: User,
  resource: Resource,
  action: Permission
): AuthorizationResult {
  // Admins can do anything
  if (user.role === 'admin') {
    return { allowed: true };
  }

  // Check if the user has the required permission
  if (!hasPermission(user, action)) {
    return {
      allowed: false,
      reason: `User with role '${user.role}' does not have '${action}' permission`,
    };
  }

  // Check database-level access restrictions
  if (resource.type === 'database' && user.allowedDatabases) {
    if (!resource.identifier) {
      return { allowed: false, reason: 'Database identifier not specified' };
    }

    if (!user.allowedDatabases.includes(resource.identifier)) {
      return {
        allowed: false,
        reason: `User is not authorized to access database: ${resource.identifier}`,
      };
    }
  }

  // Check table-level access restrictions
  if (resource.type === 'table' && user.allowedDatabases && resource.identifier) {
    const [dbPath] = resource.identifier.split(':');

    if (dbPath && !user.allowedDatabases.includes(dbPath)) {
      return {
        allowed: false,
        reason: `User is not authorized to access table in database: ${dbPath}`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Get all permissions for a specific role
 *
 * @param role - The role to get permissions for
 * @returns Array of permissions for the role
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/**
 * Check if a user can execute SQL queries
 *
 * @param user - The user to check
 * @returns True if the user can execute SQL
 */
export function canExecuteSQL(user: User): boolean {
  return hasPermission(user, 'execute');
}

/**
 * Check if a user can write to databases
 *
 * @param user - The user to check
 * @returns True if the user can write
 */
export function canWriteDatabase(user: User): boolean {
  return hasPermission(user, 'write');
}

/**
 * Check if a user can read from databases
 *
 * @param user - The user to check
 * @returns True if the user can read
 */
export function canReadDatabase(user: User): boolean {
  return hasPermission(user, 'read');
}

/**
 * Check if a user can perform administrative tasks
 *
 * @param user - The user to check
 * @returns True if the user is an admin
 */
export function canPerformAdmin(user: User): boolean {
  return hasPermission(user, 'admin');
}

/**
 * Get a human-readable description of a role
 *
 * @param role - The role to describe
 * @returns Description of the role
 */
export function getRoleDescription(role: UserRole): string {
  const descriptions: Record<UserRole, string> = {
    admin: 'Full access to all databases and administrative functions',
    'read-write': 'Can read, write, and execute SQL queries on accessible databases',
    'read-only': 'Can only read data from accessible databases',
  };

  return descriptions[role];
}

/**
 * Get all available roles in the system
 *
 * @returns Array of all role names
 */
export function getAllRoles(): UserRole[] {
  return Object.keys(ROLE_PERMISSIONS) as UserRole[];
}

/**
 * Check if a role is valid
 *
 * @param role - The role to validate
 * @returns True if the role exists
 */
export function isValidRole(role: string): role is UserRole {
  return role in ROLE_PERMISSIONS;
}

/**
 * Filter resources based on user's database access permissions
 *
 * @param user - The user to check permissions for
 * @param resources - List of resources to filter
 * @returns Filtered list of resources the user can access
 */
export function filterAccessibleResources<T extends { path?: string }>(
  user: User,
  resources: T[]
): T[] {
  // Admins can access everything
  if (user.role === 'admin') {
    return resources;
  }

  // If no database restrictions, user can access all resources
  if (!user.allowedDatabases || user.allowedDatabases.length === 0) {
    return resources;
  }

  // Filter resources based on allowed databases
  return resources.filter(resource => {
    if (!resource.path) {
      return true; // Resources without paths are accessible
    }

    return user.allowedDatabases!.some(allowedDb =>
      resource.path!.startsWith(allowedDb)
    );
  });
}

/**
 * Create a resource object for authorization checks
 *
 * @param type - The resource type
 * @param identifier - The resource identifier
 * @returns Resource object
 */
export function createResource(
  type: ResourceType,
  identifier?: string
): Resource {
  return { type, identifier };
}

/**
 * Type alias for ResourceType for convenience
 */
type ResourceType = 'database' | 'table' | 'query';

/**
 * Authorization error class for throwing authorization errors
 */
export class AuthorizationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = 'AUTHZ_FAILED', statusCode = 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Check authorization and throw an error if not allowed
 *
 * @param user - The user to check
 * @param resource - The resource being accessed
 * @param action - The action being performed
 * @throws AuthorizationError if not authorized
 */
export function requireAuthorization(
  user: User,
  resource: Resource,
  action: Permission
): void {
  const result = canAccessResource(user, resource, action);

  if (!result.allowed) {
    throw new AuthorizationError(result.reason || 'Access denied');
  }
}

/**
 * Check if user can perform action and throw error if not
 *
 * @param user - The user to check
 * @param permission - The permission required
 * @throws AuthorizationError if user lacks permission
 */
export function requirePermission(user: User, permission: Permission): void {
  if (!hasPermission(user, permission)) {
    throw new AuthorizationError(
      `User with role '${user.role}' does not have '${permission}' permission`,
      'PERMISSION_DENIED'
    );
  }
}

/**
 * Require admin role
 *
 * @param user - The user to check
 * @throws AuthorizationError if user is not admin
 */
export function requireAdminRole(user: User): void {
  if (user.role !== 'admin') {
    throw new AuthorizationError(
      'Admin role required for this operation',
      'ADMIN_REQUIRED'
    );
  }
}

/**
 * Get a summary of user permissions
 *
 * @param user - The user to get permissions summary for
 * @returns Object containing permission information
 */
export function getUserPermissionSummary(user: User): {
  role: UserRole;
  permissions: Permission[];
  canExecuteSQL: boolean;
  canRead: boolean;
  canWrite: boolean;
  isAdmin: boolean;
  allowedDatabases?: string[];
} {
  return {
    role: user.role,
    permissions: getRolePermissions(user.role),
    canExecuteSQL: canExecuteSQL(user),
    canRead: canReadDatabase(user),
    canWrite: canWriteDatabase(user),
    isAdmin: user.role === 'admin',
    allowedDatabases: user.allowedDatabases,
  };
}
