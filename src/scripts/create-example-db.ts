/**
 * Example Database Creation Script
 *
 * This script creates an example SQLite database with sample tables and data
 * for testing the SQLite MCP GUI application.
 *
 * @file create-example-db.ts
 * @author SQLite MCP GUI Team
 * @version 1.0.0
 *
 * Usage:
 *   npm run build
 *   node dist/scripts/create-example-db.js
 *
 * The database will be created at ./example.db with the following structure:
 * - users: Sample user accounts with roles
 * - products: Product catalog with categories
 * - orders: Order records linked to users
 * - order_items: Line items for orders
 *
 * @module scripts/create-example-db
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/** Directory name of current module */
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Path where the example database will be created */
const DB_PATH = join(__dirname, '../../example.db');

/** Sample users data */
const SAMPLE_USERS = [
  ['Alice Johnson', 'alice@example.com', 'admin'],
  ['Bob Smith', 'bob@example.com', 'user'],
  ['Carol White', 'carol@example.com', 'user'],
  ['David Brown', 'david@example.com', 'user'],
  ['Eve Davis', 'eve@example.com', 'admin'],
] as const;

/** Sample products data */
const SAMPLE_PRODUCTS = [
  ['Laptop Pro 15', 'High-performance laptop with 16GB RAM', 1299.99, 15, 'Electronics'],
  ['Wireless Mouse', 'Ergonomic wireless mouse', 29.99, 100, 'Electronics'],
  ['Mechanical Keyboard', 'RGB mechanical keyboard', 89.99, 45, 'Electronics'],
  ['HD Monitor 27"', '27-inch 4K display', 349.99, 30, 'Electronics'],
  ['USB-C Hub', '7-in-1 USB-C hub', 49.99, 75, 'Accessories'],
  ['Office Chair', 'Ergonomic office chair with lumbar support', 299.99, 20, 'Furniture'],
  ['Standing Desk', 'Adjustable height standing desk', 499.99, 10, 'Furniture'],
  ['Webcam 1080p', 'Full HD webcam with microphone', 79.99, 50, 'Electronics'],
  ['Noise-Canceling Headphones', 'Over-ear wireless headphones', 199.99, 35, 'Electronics'],
  ['External SSD 1TB', 'Portable solid-state drive', 129.99, 60, 'Storage'],
] as const;

/** Sample orders data */
const SAMPLE_ORDERS = [
  [1, 1359.98, 'completed'],
  [2, 89.99, 'shipped'],
  [3, 349.99, 'pending'],
  [4, 549.98, 'completed'],
  [1, 199.99, 'shipped'],
  [5, 29.99, 'pending'],
  [2, 129.99, 'completed'],
  [3, 799.98, 'shipped'],
] as const;

/** Sample order items data */
const SAMPLE_ORDER_ITEMS = [
  [1, 1, 1, 1299.99],
  [1, 2, 1, 29.99],
  [2, 3, 1, 89.99],
  [3, 4, 1, 349.99],
  [4, 6, 1, 299.99],
  [4, 8, 1, 79.99],
  [5, 9, 1, 199.99],
  [6, 2, 1, 29.99],
  [7, 10, 1, 129.99],
  [8, 1, 1, 1299.99],
  [8, 4, 1, 349.99],
  [8, 3, 1, 89.99],
] as const;

/**
 * Main function to create the example database
 */
async function createExampleDatabase(): Promise<void> {
  console.log(`Creating example database at: ${DB_PATH}`);

  // Import fs module
  const fs = await import('fs');

  // Remove existing database if it exists
  if (fs.existsSync(DB_PATH)) {
    console.log('Removing existing database...');
    fs.unlinkSync(DB_PATH);
  }

  // Create new database
  const db = new Database(DB_PATH);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  console.log('Creating tables...');

  // Create users table
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create products table
  db.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      stock INTEGER DEFAULT 0,
      category TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create orders table
  db.exec(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total DECIMAL(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create order_items table
  db.exec(`
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  console.log('Inserting sample data...');

  // Insert sample users
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, role) VALUES (?, ?, ?)
  `);
  for (const user of SAMPLE_USERS) {
    insertUser.run(...user);
  }

  // Insert sample products
  const insertProduct = db.prepare(`
    INSERT INTO products (name, description, price, stock, category) VALUES (?, ?, ?, ?, ?)
  `);
  for (const product of SAMPLE_PRODUCTS) {
    insertProduct.run(...product);
  }

  // Insert sample orders
  const insertOrder = db.prepare(`
    INSERT INTO orders (user_id, total, status) VALUES (?, ?, ?)
  `);
  for (const order of SAMPLE_ORDERS) {
    insertOrder.run(...order);
  }

  // Insert sample order items
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)
  `);
  for (const item of SAMPLE_ORDER_ITEMS) {
    insertOrderItem.run(...item);
  }

  // Create indexes for better performance
  console.log('Creating indexes...');
  db.exec(`
    CREATE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_products_category ON products(category);
    CREATE INDEX idx_orders_user_id ON orders(user_id);
    CREATE INDEX idx_orders_status ON orders(status);
    CREATE INDEX idx_order_items_order_id ON order_items(order_id);
    CREATE INDEX idx_order_items_product_id ON order_items(product_id);
  `);

  // Display statistics
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number };
  const orderItemCount = db.prepare('SELECT COUNT(*) as count FROM order_items').get() as { count: number };

  console.log('\n=== Database Statistics ===');
  console.log(`Users: ${userCount.count}`);
  console.log(`Products: ${productCount.count}`);
  console.log(`Orders: ${orderCount.count}`);
  console.log(`Order Items: ${orderItemCount.count}`);
  console.log(`\nDatabase created successfully!`);
  console.log(`Connect to it in the GUI using: ./example.db`);

  db.close();
}

// Execute the main function
createExampleDatabase().catch((error) => {
  console.error('Error creating example database:', error);
  process.exit(1);
});
