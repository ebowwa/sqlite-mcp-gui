/**
 * User Management System
 */

import bcrypt from 'bcrypt';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { authConfig, validatePassword } from './auth.config.js';
import type { User, UserRole, SafeUser } from './types.js';

/**
 * In-memory store for users that can be persisted to disk
 */
class FileBackedUserStore {
  private users: Map<string, User> = new Map();
  private filePath?: string;

  constructor() {
    this.filePath = authConfig.storage.filePath;
  }

  /**
   * Load users from the configured storage file
   * Creates a default admin user if no file exists or on error
   */
  async load(): Promise<void> {
    if (!this.filePath || !existsSync(this.filePath)) {
      await this.createDefaultAdmin();
      return;
    }

    try {
      const data = readFileSync(this.filePath, 'utf-8');
      const usersData: unknown[] = JSON.parse(data);

      this.users.clear();

      for (const userData of usersData) {
        const user: User = {
          ...(userData as Partial<User>),
          createdAt: new Date((userData as any).createdAt),
          lastLogin: (userData as any).lastLogin
            ? new Date((userData as any).lastLogin)
            : undefined,
        } as User;

        this.users.set(user.id, user);
      }
    } catch (error) {
      console.error('Failed to load users from file:', error);
      await this.createDefaultAdmin();
    }
  }

  /**
   * Save users to the configured storage file
   */
  async save(): Promise<void> {
    if (!this.filePath) {
      return;
    }

    try {
      const usersArray = Array.from(this.users.values());
      const data = JSON.stringify(usersArray, null, 2);
      writeFileSync(this.filePath, data);
    } catch (error) {
      console.error('Failed to save users to file:', error);
    }
  }

  /**
   * Create a new user
   *
   * @param username - Username for the new user
   * @param password - Plain text password
   * @param role - User role
   * @param allowedDatabases - Optional list of databases user can access
   * @returns The created user
   * @throws Error if user already exists
   */
  async create(
    username: string,
    password: string,
    role: UserRole,
    allowedDatabases?: string[]
  ): Promise<User> {
    const existing = this.findByUsername(username);

    if (existing) {
      throw new Error(`User '${username}' already exists`);
    }

    // Validate password against policy
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw new Error(
        `Password validation failed: ${passwordValidation.errors.join(', ')}`
      );
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user: User = {
      id: this.generateId(),
      username,
      passwordHash,
      role,
      createdAt: new Date(),
      ...(allowedDatabases && { allowedDatabases }),
    };

    this.users.set(user.id, user);
    await this.save();

    return user;
  }

  /**
   * Find a user by username
   *
   * @param username - Username to search for
   * @returns User or undefined if not found
   */
  findByUsername(username: string): User | undefined {
    return Array.from(this.users.values()).find(u => u.username === username);
  }

  /**
   * Find a user by ID
   *
   * @param id - User ID to search for
   * @returns User or undefined if not found
   */
  findById(id: string): User | undefined {
    return this.users.get(id);
  }

  /**
   * Update a user's last login timestamp
   *
   * @param userId - ID of the user to update
   */
  async updateLastLogin(userId: string): Promise<void> {
    const user = this.users.get(userId);

    if (user) {
      user.lastLogin = new Date();
      await this.save();
    }
  }

  /**
   * Validate a password against a user's stored hash
   *
   * @param user - User to validate password for
   * @param password - Plain text password to check
   * @returns True if password matches
   */
  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  /**
   * Update a user's password
   *
   * @param userId - ID of the user to update
   * @param newPassword - New plain text password
   */
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const user = this.users.get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Validate password against policy
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(
        `Password validation failed: ${passwordValidation.errors.join(', ')}`
      );
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await this.save();
  }

  /**
   * Update a user's role
   *
   * @param userId - ID of the user to update
   * @param newRole - New role
   */
  async updateRole(userId: string, newRole: UserRole): Promise<void> {
    const user = this.users.get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    user.role = newRole;
    await this.save();
  }

  /**
   * Update a user's allowed databases
   *
   * @param userId - ID of the user to update
   * @param allowedDatabases - List of databases user can access
   */
  async updateAllowedDatabases(
    userId: string,
    allowedDatabases: string[]
  ): Promise<void> {
    const user = this.users.get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    user.allowedDatabases = allowedDatabases;
    await this.save();
  }

  /**
   * Delete a user
   *
   * @param userId - ID of the user to delete
   * @returns True if user was deleted
   */
  async delete(userId: string): Promise<boolean> {
    const deleted = this.users.delete(userId);

    if (deleted) {
      await this.save();
    }

    return deleted;
  }

  /**
   * Get all users
   *
   * @returns Array of all users
   */
  listAll(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * Generate a unique user ID
   *
   * @returns Unique ID string
   */
  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Create a default admin user if no users exist
   * WARNING: This should only be used in development or first-time setup
   */
  async createDefaultAdmin(): Promise<void> {
    // Only create default admin if no users exist
    if (this.users.size > 0) {
      return;
    }

    const adminUser: User = {
      id: this.generateId(),
      username: 'admin',
      passwordHash: await bcrypt.hash('admin123', await bcrypt.genSalt(10)),
      role: 'admin',
      createdAt: new Date(),
    };

    this.users.set(adminUser.id, adminUser);
    await this.save();

    console.warn('⚠️  Default admin user created:');
    console.warn('   Username: admin');
    console.warn('   Password: admin123');
    console.warn(
      '   ⚠️  Please change this password immediately after first login!'
    );
  }

  /**
   * Get the count of users
   *
   * @returns Number of users
   */
  count(): number {
    return this.users.size;
  }
}

// Singleton instance of the user store
let userStoreInstance: FileBackedUserStore | null = null;

/**
 * Get or create the user store instance
 * Initializes the store on first call
 *
 * @returns The user store instance
 */
export async function getUserStore(): Promise<FileBackedUserStore> {
  if (!userStoreInstance) {
    userStoreInstance = new FileBackedUserStore();
    await userStoreInstance.load();
  }

  return userStoreInstance;
}

/**
 * Reset the user store instance
 * Primarily useful for testing
 */
export function resetUserStore(): void {
  userStoreInstance = null;
}

/**
 * Create a new user
 *
 * @param username - Username for the new user
 * @param password - Plain text password
 * @param role - User role
 * @param allowedDatabases - Optional list of databases user can access
 * @returns The created user (without password hash)
 */
export async function createUser(
  username: string,
  password: string,
  role: UserRole,
  allowedDatabases?: string[]
): Promise<SafeUser> {
  const store = await getUserStore();
  const user = await store.create(username, password, role, allowedDatabases);

  // Return user without password hash
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

/**
 * Find a user by username
 *
 * @param username - Username to search for
 * @returns User or undefined if not found
 */
export async function findUserByUsername(
  username: string
): Promise<User | undefined> {
  const store = await getUserStore();
  return store.findByUsername(username);
}

/**
 * Synchronous version of findUserByUsername for use in middleware
 * This assumes the user store has already been initialized
 *
 * @param username - Username to search for
 * @returns User or undefined if not found
 */
export function findUserByUsernameSync(username: string): User | undefined {
  if (!userStoreInstance) {
    return undefined;
  }

  return userStoreInstance.findByUsername(username);
}

/**
 * Authenticate a user with username and password
 *
 * @param username - Username
 * @param password - Plain text password
 * @returns User object if authentication successful, null otherwise
 */
export async function authenticateUser(
  username: string,
  password: string
): Promise<User | null> {
  const store = await getUserStore();
  const user = store.findByUsername(username);

  if (!user) {
    return null;
  }

  const isValid = await store.validatePassword(user, password);

  if (!isValid) {
    return null;
  }

  await store.updateLastLogin(user.id);
  return user;
}

/**
 * Change a user's password
 *
 * @param userId - ID of the user
 * @param newPassword - New plain text password
 */
export async function changePassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const store = await getUserStore();
  await store.updatePassword(userId, newPassword);
}

/**
 * Update a user's role
 *
 * @param userId - ID of the user
 * @param newRole - New role
 */
export async function updateUserRole(
  userId: string,
  newRole: UserRole
): Promise<void> {
  const store = await getUserStore();
  await store.updateRole(userId, newRole);
}

/**
 * Update a user's allowed databases
 *
 * @param userId - ID of the user
 * @param allowedDatabases - List of databases user can access
 */
export async function updateUserDatabases(
  userId: string,
  allowedDatabases: string[]
): Promise<void> {
  const store = await getUserStore();
  await store.updateAllowedDatabases(userId, allowedDatabases);
}

/**
 * Delete a user
 *
 * @param userId - ID of the user to delete
 * @returns True if user was deleted
 */
export async function deleteUser(userId: string): Promise<boolean> {
  const store = await getUserStore();
  return store.delete(userId);
}

/**
 * List all users
 *
 * @returns Array of users (without password hashes)
 */
export async function listUsers(): Promise<SafeUser[]> {
  const store = await getUserStore();
  const users = store.listAll();

  // Remove password hashes from results
  return users.map(user => {
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  });
}

/**
 * Get a user by ID
 *
 * @param userId - ID of the user
 * @returns User (without password hash) or undefined if not found
 */
export async function getUserById(userId: string): Promise<SafeUser | undefined> {
  const store = await getUserStore();
  const user = store.findById(userId);

  if (!user) {
    return undefined;
  }

  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

/**
 * Check if the user store has been initialized
 *
 * @returns True if store is initialized
 */
export function isStoreInitialized(): boolean {
  return userStoreInstance !== null;
}

/**
 * Get the count of users
 *
 * @returns Number of users in the system
 */
export async function getUserCount(): Promise<number> {
  const store = await getUserStore();
  return store.count();
}
