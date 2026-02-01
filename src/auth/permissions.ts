/**
 * Role-Based Access Control (RBAC) and Authorization
 */

import type { User, UserRole, Permission, Resource, AuthzResult } from './types';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ['read', 'write', 'execute', 'admin'],
  'read-write': ['read', 'write', 'execute'],
  'read-only': ['read'],
};

export function hasPermission(user: User, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

export function canAccessResource(user: User, resource: Resource, action: Permission): AuthzResult {
  if (user.role === 'admin') {
    return { allowed: true };
  }

  if (!hasPermission(user, action)) {
    return {
      allowed: false,
      reason: `User with role '${user.role}' does not have '${action}' permission`,
    };
  }

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

export function getRolePermissions(role: UserRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function canExecuteSQL(user: User): boolean {
  return hasPermission(user, 'execute');
}

export function canWriteDatabase(user: User): boolean {
  return hasPermission(user, 'write');
}

export function canReadDatabase(user: User): boolean {
  return hasPermission(user, 'read');
}

export function canPerformAdmin(user: User): boolean {
  return hasPermission(user, 'admin');
}

export function getRoleDescription(role: UserRole): string {
  const descriptions: Record<UserRole, string> = {
    admin: 'Full access to all databases and administrative functions',
    'read-write': 'Can read, write, and execute SQL queries on accessible databases',
    'read-only': 'Can only read data from accessible databases',
  };
  return descriptions[role];
}
