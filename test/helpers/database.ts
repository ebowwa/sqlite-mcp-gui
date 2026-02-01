import Database from 'better-sqlite3';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

/**
 * Create a test database with sample data
 */
export function createTestDatabase(dbPath: string = join(process.cwd(), 'test.db')): Database.Database {
  // Remove existing database if it exists
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create test tables
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      stock INTEGER DEFAULT 0,
      category TEXT NOT NULL
    )
  `);

  // Insert test data
  const insertUser = db.prepare('INSERT INTO users (name, email, role) VALUES (?, ?, ?)');
  insertUser.run('Alice Johnson', 'alice@example.com', 'admin');
  insertUser.run('Bob Smith', 'bob@example.com', 'user');

  const insertProduct = db.prepare('INSERT INTO products (name, price, stock, category) VALUES (?, ?, ?, ?)');
  insertProduct.run('Laptop', 999.99, 10, 'Electronics');
  insertProduct.run('Mouse', 29.99, 50, 'Electronics');

  return db;
}

/**
 * Clean up test database
 */
export function cleanupTestDatabase(dbPath: string = join(process.cwd(), 'test.db')): void {
  if (existsSync(dbPath)) {
    try {
      unlinkSync(dbPath);
    } catch (error) {
      // Ignore errors
    }
  }
}

/**
 * Get test database path
 */
export function getTestDbPath(): string {
  return join(process.cwd(), 'test.db');
}
