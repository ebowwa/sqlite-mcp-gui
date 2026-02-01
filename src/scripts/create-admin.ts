#!/usr/bin/env node
/**
 * Create Admin User Script
 *
 * This script creates a new admin user for the SQLite MCP GUI.
 * It can be run from the command line to create users with various roles.
 *
 * Usage:
 *   node dist/scripts/create-admin.js
 *   AUTH_ENABLED=true node dist/scripts/create-admin.js
 */

import { createReadStream, createWriteStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import { createUser } from '../auth/users.js';
import { validatePassword } from '../auth/auth.config.js';
import type { UserRole } from '../auth/types.js';

/**
 * Read a line from stdin
 */
function question(query: string): Promise<string> {
  const rl = createInterface({
    input: createReadStream(0),
    output: createWriteStream(1),
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

/**
 * Create admin user interactively
 */
async function createAdminUser(): Promise<void> {
  console.log('=== SQLite MCP GUI - User Creation ===\n');

  // Get username
  const username = await question('Enter username: ');
  if (!username || username.trim().length === 0) {
    console.error('Error: Username cannot be empty');
    process.exit(1);
  }

  // Get password
  const password = await question('Enter password: ');
  if (!password || password.length === 0) {
    console.error('Error: Password cannot be empty');
    process.exit(1);
  }

  // Confirm password
  const confirmPassword = await question('Confirm password: ');
  if (password !== confirmPassword) {
    console.error('Error: Passwords do not match');
    process.exit(1);
  }

  // Validate password
  const validation = validatePassword(password);
  if (!validation.valid) {
    console.error('Error: Password does not meet requirements:');
    validation.errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }

  // Get role
  const roleInput = await question('Enter role (admin/read-write/read-only) [admin]: ');
  const role = roleInput.trim() || 'admin';

  const validRoles: UserRole[] = ['admin', 'read-write', 'read-only'];
  if (!validRoles.includes(role as UserRole)) {
    console.error(`Error: Invalid role. Must be one of: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  // Create user
  try {
    console.log('\nCreating user...');
    const user = await createUser(username, password, role as UserRole);

    console.log('\n✓ User created successfully!');
    console.log(`  ID: ${user.id}`);
    console.log(`  Username: ${user.username}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Created: ${user.createdAt.toISOString()}`);
  } catch (error: any) {
    console.error(`\n✗ Error creating user: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Check if auth is enabled
  const authEnabled = process.env.AUTH_ENABLED === 'true';

  if (!authEnabled) {
    console.warn('Warning: AUTH_ENABLED is not set to true');
    console.warn('The user will be created, but authentication is disabled.');
    console.warn('Set AUTH_ENABLED=true to enable authentication.\n');
  }

  try {
    await createAdminUser();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main();
