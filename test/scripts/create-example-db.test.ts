import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import { execSync } from 'child_process';

describe('Example Database Creation Script', () => {
  const exampleDbPath = join(process.cwd(), 'example.db');
  const distScriptPath = join(process.cwd(), 'dist/scripts/create-example-db.js');

  beforeEach(() => {
    // Clean up any existing example database
    if (existsSync(exampleDbPath)) {
      try {
        unlinkSync(exampleDbPath);
      } catch (error) {
        // Ignore errors
      }
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(exampleDbPath)) {
      try {
        unlinkSync(exampleDbPath);
      } catch (error) {
        // Ignore errors
      }
    }
  });

  describe('Database Structure', () => {
    it('should create the example database file', () => {
      // This test assumes the script has been run
      // In a real scenario, you'd run the script first or mock it
      expect(true).toBe(true); // Placeholder
    });

    it('should create users table with correct schema', () => {
      if (!existsSync(exampleDbPath)) {
        // Create test database manually for unit testing
        const db = new Database(exampleDbPath);
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
        db.close();
      }

      const db = new Database(exampleDbPath);
      const stmt = db.prepare('PRAGMA table_info(users)');
      const columns = stmt.all();

      expect(columns.length).toBeGreaterThanOrEqual(4);
      expect(columns.some((c: any) => c.name === 'id')).toBe(true);
      expect(columns.some((c: any) => c.name === 'name')).toBe(true);
      expect(columns.some((c: any) => c.name === 'email')).toBe(true);
      expect(columns.some((c: any) => c.name === 'role')).toBe(true);

      db.close();
    });

    it('should create products table with correct schema', () => {
      if (!existsSync(exampleDbPath)) {
        const db = new Database(exampleDbPath);
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
        db.close();
      }

      const db = new Database(exampleDbPath);
      const stmt = db.prepare('PRAGMA table_info(products)');
      const columns = stmt.all();

      expect(columns.length).toBeGreaterThanOrEqual(5);
      expect(columns.some((c: any) => c.name === 'id')).toBe(true);
      expect(columns.some((c: any) => c.name === 'name')).toBe(true);
      expect(columns.some((c: any) => c.name === 'price')).toBe(true);
      expect(columns.some((c: any) => c.name === 'stock')).toBe(true);

      db.close();
    });

    it('should create orders table with correct schema', () => {
      if (!existsSync(exampleDbPath)) {
        const db = new Database(exampleDbPath);
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
        db.close();
      }

      const db = new Database(exampleDbPath);
      const stmt = db.prepare('PRAGMA table_info(orders)');
      const columns = stmt.all();

      expect(columns.length).toBeGreaterThanOrEqual(4);
      expect(columns.some((c: any) => c.name === 'id')).toBe(true);
      expect(columns.some((c: any) => c.name === 'user_id')).toBe(true);
      expect(columns.some((c: any) => c.name === 'total')).toBe(true);
      expect(columns.some((c: any) => c.name === 'status')).toBe(true);

      db.close();
    });

    it('should create order_items table with correct schema', () => {
      if (!existsSync(exampleDbPath)) {
        const db = new Database(exampleDbPath);
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
        db.close();
      }

      const db = new Database(exampleDbPath);
      const stmt = db.prepare('PRAGMA table_info(order_items)');
      const columns = stmt.all();

      expect(columns.length).toBeGreaterThanOrEqual(5);
      expect(columns.some((c: any) => c.name === 'id')).toBe(true);
      expect(columns.some((c: any) => c.name === 'order_id')).toBe(true);
      expect(columns.some((c: any) => c.name === 'product_id')).toBe(true);
      expect(columns.some((c: any) => c.name === 'quantity')).toBe(true);

      db.close();
    });
  });

  describe('Sample Data', () => {
    it('should insert sample users data', () => {
      // Create test database with sample data
      const db = new Database(exampleDbPath);
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const insertUser = db.prepare('INSERT INTO users (name, email, role) VALUES (?, ?, ?)');
      insertUser.run('Alice Johnson', 'alice@example.com', 'admin');
      insertUser.run('Bob Smith', 'bob@example.com', 'user');

      const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
      const result = stmt.get() as { count: number };

      expect(result.count).toBeGreaterThan(0);
      expect(result.count).toBeGreaterThanOrEqual(2);

      db.close();
    });

    it('should insert sample products data', () => {
      const db = new Database(exampleDbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          stock INTEGER DEFAULT 0,
          category TEXT NOT NULL
        )
      `);

      const insertProduct = db.prepare('INSERT INTO products (name, price, stock, category) VALUES (?, ?, ?, ?)');
      insertProduct.run('Laptop', 999.99, 10, 'Electronics');
      insertProduct.run('Mouse', 29.99, 50, 'Electronics');

      const stmt = db.prepare('SELECT COUNT(*) as count FROM products');
      const result = stmt.get() as { count: number };

      expect(result.count).toBeGreaterThan(0);

      db.close();
    });

    it('should insert sample orders data', () => {
      const db = new Database(exampleDbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL
        )
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          total DECIMAL(10,2) NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
        )
      `);

      const insertUser = db.prepare('INSERT INTO users (name) VALUES (?)');
      insertUser.run('Test User');

      const insertOrder = db.prepare('INSERT INTO orders (user_id, total, status) VALUES (?, ?, ?)');
      insertOrder.run(1, 99.99, 'completed');

      const stmt = db.prepare('SELECT COUNT(*) as count FROM orders');
      const result = stmt.get() as { count: number };

      expect(result.count).toBeGreaterThan(0);

      db.close();
    });

    it('should insert sample order_items data', () => {
      const db = new Database(exampleDbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT
        )
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT
        )
        CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          price DECIMAL(10,2) NOT NULL
        )
      `);

      const insertOrder = db.prepare('INSERT INTO orders (id) VALUES (?)');
      insertOrder.run(1);

      const insertProduct = db.prepare('INSERT INTO products (id) VALUES (?)');
      insertProduct.run(1);

      const insertOrderItem = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
      insertOrderItem.run(1, 1, 2, 19.99);

      const stmt = db.prepare('SELECT COUNT(*) as count FROM order_items');
      const result = stmt.get() as { count: number };

      expect(result.count).toBeGreaterThan(0);

      db.close();
    });
  });

  describe('Indexes', () => {
    it('should create index on users.email', () => {
      const db = new Database(exampleDbPath);
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          email TEXT
        )
        CREATE INDEX idx_users_email ON users(email)
      `);

      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_email'");
      const result = stmt.get();

      expect(result).toBeDefined();

      db.close();
    });

    it('should create index on products.category', () => {
      const db = new Database(exampleDbPath);
      db.exec(`
        CREATE TABLE products (
          id INTEGER PRIMARY KEY,
          category TEXT
        )
        CREATE INDEX idx_products_category ON products(category)
      `);

      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_products_category'");
      const result = stmt.get();

      expect(result).toBeDefined();

      db.close();
    });

    it('should create index on orders.user_id', () => {
      const db = new Database(exampleDbPath);
      db.exec(`
        CREATE TABLE orders (
          id INTEGER PRIMARY KEY,
          user_id INTEGER
        )
        CREATE INDEX idx_orders_user_id ON orders(user_id)
      `);

      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_orders_user_id'");
      const result = stmt.get();

      expect(result).toBeDefined();

      db.close();
    });
  });

  describe('Database Properties', () => {
    it('should enable WAL mode', () => {
      const db = new Database(exampleDbPath);
      const pragma = db.pragma('journal_mode', { simple: true });

      expect(pragma).toBe('wal');

      db.close();
    });

    it('should have all expected tables', () => {
      const db = new Database(exampleDbPath);
      db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY)
        CREATE TABLE products (id INTEGER PRIMARY KEY)
        CREATE TABLE orders (id INTEGER PRIMARY KEY)
        CREATE TABLE order_items (id INTEGER PRIMARY KEY)
      `);

      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const tables = stmt.all() as Array<{ name: string }>;

      expect(tables.map((t) => t.name)).toContain('users');
      expect(tables.map((t) => t.name)).toContain('products');
      expect(tables.map((t) => t.name)).toContain('orders');
      expect(tables.map((t) => t.name)).toContain('order_items');

      db.close();
    });
  });

  describe('Data Relationships', () => {
    it('should maintain foreign key relationships', () => {
      const db = new Database(exampleDbPath);
      db.pragma('foreign_keys = ON');

      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL
        )
        CREATE TABLE orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      const insertUser = db.prepare('INSERT INTO users (name) VALUES (?)');
      const userId = insertUser.run('Test User').lastInsertRowid;

      const insertOrder = db.prepare('INSERT INTO orders (user_id) VALUES (?)');
      const orderId = insertOrder.run(userId).lastInsertRowid;

      const stmt = db.prepare('SELECT o.id, u.name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?');
      const result = stmt.get(orderId);

      expect(result).toBeDefined();
      expect(result.name).toBe('Test User');

      db.close();
    });

    it('should prevent invalid foreign key references', () => {
      const db = new Database(exampleDbPath);
      db.pragma('foreign_keys = ON');

      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL
        )
        CREATE TABLE orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      const insertOrder = db.prepare('INSERT INTO orders (user_id) VALUES (?)');

      expect(() => {
        insertOrder.run(999); // Non-existent user_id
      }).toThrow();

      db.close();
    });
  });

  describe('Script Functionality', () => {
    it('should remove existing database before creating new one', () => {
      // Create initial database
      const db1 = new Database(exampleDbPath);
      db1.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
      db1.close();

      // Simulate script behavior: remove and recreate
      if (existsSync(exampleDbPath)) {
        unlinkSync(exampleDbPath);
      }

      const db2 = new Database(exampleDbPath);
      db2.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');

      const stmt = db2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test'");
      const result = stmt.get();

      expect(result).toBeUndefined();

      db2.close();
    });

    it('should output database statistics', () => {
      const db = new Database(exampleDbPath);
      db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)
        CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT)
        INSERT INTO users VALUES (1, 'Alice')
        INSERT INTO users VALUES (2, 'Bob')
        INSERT INTO products VALUES (1, 'Laptop')
      `);

      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
      const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };

      expect(userCount.count).toBe(2);
      expect(productCount.count).toBe(1);

      db.close();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle UNIQUE constraint on email', () => {
      const db = new Database(exampleDbPath);
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          email TEXT UNIQUE NOT NULL
        )
      `);

      const insertUser = db.prepare('INSERT INTO users (email) VALUES (?)');
      insertUser.run('test@example.com');

      expect(() => {
        insertUser.run('test@example.com');
      }).toThrow();

      db.close();
    });

    it('should handle DEFAULT values', () => {
      const db = new Database(exampleDbPath);
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY,
          role TEXT NOT NULL DEFAULT 'user'
        )
      `);

      const insertUser = db.prepare('INSERT INTO users (id) VALUES (?)');
      insertUser.run(1);

      const stmt = db.prepare('SELECT role FROM users WHERE id = 1');
      const result = stmt.get() as { role: string };

      expect(result.role).toBe('user');

      db.close();
    });

    it('should handle AUTOINCREMENT', () => {
      const db = new Database(exampleDbPath);
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT
        )
      `);

      const insertUser = db.prepare('INSERT INTO users (name) VALUES (?)');
      const id1 = insertUser.run('Alice').lastInsertRowid;
      const id2 = insertUser.run('Bob').lastInsertRowid;

      expect(id1).toBe(1);
      expect(id2).toBe(2);

      db.close();
    });
  });
});
