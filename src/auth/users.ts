/**
 * User Management System
 */

import bcrypt from 'bcrypt';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { User, UserRole } from './types';
import { authConfig } from './auth.config';

interface UserStore {
  users: Map<string, User>;
  load(): Promise<void>;
  save(): Promise<void>;
  create(username: string, password: string, role: UserRole): Promise<User>;
  findByUsername(username: string): User | undefined;
  findById(id: string): User | undefined;
  updateLastLogin(userId: string): Promise<void>;
  validatePassword(user: User, password: string): Promise<boolean>;
  listAll(): User[];
}

class FileBackedUserStore implements UserStore {
  users: Map<string, User> = new Map();
  private filePath?: string;

  constructor() {
    this.filePath = authConfig.storage.filePath;
  }

  async load(): Promise<void> {
    if (!this.filePath || !existsSync(this.filePath)) {
      await this.createDefaultAdmin();
      return;
    }

    try {
      const data = readFileSync(this.filePath, 'utf-8');
      const usersData = JSON.parse(data) as Array<User & { createdAt: string; lastLogin?: string }>;

      this.users.clear();
      for (const userData of usersData) {
        const user: User = {
          ...userData,
          createdAt: new Date(userData.createdAt),
          lastLogin: userData.lastLogin ? new Date(userData.lastLogin) : undefined,
        };
        this.users.set(user.id, user);
      }
    } catch (error) {
      console.error('Failed to load users from file:', error);
      await this.createDefaultAdmin();
    }
  }

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

  async create(username: string, password: string, role: UserRole): Promise<User> {
    const existing = this.findByUsername(username);
    if (existing) {
      throw new Error(`User '${username}' already exists`);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user: User = {
      id: this.generateId(),
      username,
      passwordHash,
      role,
      createdAt: new Date(),
    };

    this.users.set(user.id, user);
    await this.save();

    return user;
  }

  findByUsername(username: string): User | undefined {
    return Array.from(this.users.values()).find(u => u.username === username);
  }

  findById(id: string): User | undefined {
    return this.users.get(id);
  }

  async updateLastLogin(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.lastLogin = new Date();
      await this.save();
    }
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  listAll(): User[] {
    return Array.from(this.users.values());
  }

  private generateId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private async createDefaultAdmin(): Promise<void> {
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
    console.warn('   ⚠️  Please change this password immediately after first login!');
  }
}

let userStoreInstance: UserStore | null = null;

export async function getUserStore(): Promise<UserStore> {
  if (!userStoreInstance) {
    userStoreInstance = new FileBackedUserStore();
    await userStoreInstance.load();
  }
  return userStoreInstance;
}

export function resetUserStore(): void {
  userStoreInstance = null;
}

export async function createUser(username: string, password: string, role: UserRole): Promise<User> {
  const store = await getUserStore();
  return store.create(username, password, role);
}

export async function findUserByUsername(username: string): Promise<User | undefined> {
  const store = await getUserStore();
  return store.findByUsername(username);
}

/**
 * Synchronous version of findUserByUsername for use in middleware
 * This assumes the user store has already been initialized
 */
export function findUserByUsernameSync(username: string): User | undefined {
  if (!userStoreInstance) {
    return undefined;
  }
  return userStoreInstance.findByUsername(username);
}

export async function authenticateUser(username: string, password: string): Promise<User | null> {
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

export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const store = await getUserStore();
  const user = store.findById(userId);

  if (!user) {
    throw new Error('User not found');
  }

  const salt = await bcrypt.genSalt(10);
  user.passwordHash = await bcrypt.hash(newPassword, salt);
  await store.save();
}

export async function listUsers(): Promise<User[]> {
  const store = await getUserStore();
  return store.listAll();
}
