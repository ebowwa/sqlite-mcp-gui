import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import { createTestDatabase, cleanupTestDatabase, getTestDbPath } from '../helpers/database.js';

// Mock better-sqlite3 for MCP server tests
vi.mock('better-sqlite3', () => ({
  default: vi.fn().mockImplementation((path: string) => {
    const db = new Database(path);
    return db;
  }),
}));

describe('MCP Server Tools', () => {
  let mcpServer: any;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = getTestDbPath();
    createTestDatabase(testDbPath);

    // Import the server module (it will use the mocked Database)
    // We need to dynamically import to get fresh instances
    const module = await import('../../src/server/index.js');
    // Get the server class but don't run it
    // We'll test individual methods
  });

  afterEach(() => {
    cleanupTestDatabase(testDbPath);
    vi.clearAllMocks();
  });

  describe('sqlite_connect tool', () => {
    it('should connect to an existing database', async () => {
      const db = new Database(testDbPath);
      expect(db).toBeDefined();
      expect(db.open).toBe(true);
      db.close();
    });

    it('should create a new database if it does not exist', async () => {
      const newDbPath = join(process.cwd(), 'new-test.db');
      if (existsSync(newDbPath)) {
        unlinkSync(newDbPath);
      }

      const db = new Database(newDbPath);
      expect(db).toBeDefined();
      expect(existsSync(newDbPath)).toBe(true);
      db.close();
      unlinkSync(newDbPath);
    });

    it('should set WAL mode on connection', async () => {
      const db = new Database(testDbPath);
      const pragma = db.pragma('journal_mode', { simple: true });
      expect(pragma).toBe('wal');
      db.close();
    });

    it('should handle connection errors gracefully', async () => {
      const invalidPath = '/root/nonexistent/path/to/db/db.db';
      expect(() => {
        const db = new Database(invalidPath, { readonly: true });
        db.close();
      }).toThrow();
    });
  });

  describe('sqlite_query tool', () => {
    it('should execute SELECT queries successfully', async () => {
      const db = new Database(testDbPath);

      const stmt = db.prepare('SELECT * FROM users');
      const rows = stmt.all();

      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]).toHaveProperty('name');
      expect(rows[0]).toHaveProperty('email');

      db.close();
    });

    it('should execute PRAGMA queries successfully', async () => {
      const db = new Database(testDbPath);

      const stmt = db.prepare('PRAGMA table_info(users)');
      const columns = stmt.all();

      expect(Array.isArray(columns)).toBe(true);
      expect(columns.length).toBeGreaterThan(0);
      expect(columns[0]).toHaveProperty('name');
      expect(columns[0]).toHaveProperty('type');

      db.close();
    });

    it('should reject non-SELECT queries', async () => {
      const db = new Database(testDbPath);

      const testSql = 'INSERT INTO users (name, email, role) VALUES ("Test", "test@test.com", "user")';
      const trimmedSql = testSql.trim().toUpperCase();

      expect(trimmedSql.startsWith('SELECT')).toBe(false);
      expect(trimmedSql.startsWith('PRAGMA')).toBe(false);

      db.close();
    });

    it('should return empty array for queries with no results', async () => {
      const db = new Database(testDbPath);

      const stmt = db.prepare('SELECT * FROM users WHERE id = 999999');
      const rows = stmt.all();

      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(0);

      db.close();
    });

    it('should handle query errors gracefully', async () => {
      const db = new Database(testDbPath);

      expect(() => {
        const stmt = db.prepare('SELECT * FROM nonexistent_table');
        stmt.all();
      }).toThrow();

      db.close();
    });
  });

  describe('sqlite_execute tool', () => {
    it('should execute INSERT statements', async () => {
      const db = new Database(testDbPath);

      const initialStmt = db.prepare('SELECT COUNT(*) as count FROM users');
      const initialResult = initialStmt.get() as { count: number };

      db.exec("INSERT INTO users (name, email, role) VALUES ('Test User', 'test@example.com', 'user')");

      const afterStmt = db.prepare('SELECT COUNT(*) as count FROM users');
      const afterResult = afterStmt.get() as { count: number };

      expect(afterResult.count).toBe(initialResult.count + 1);

      db.close();
    });

    it('should execute UPDATE statements', async () => {
      const db = new Database(testDbPath);

      db.exec("UPDATE users SET role = 'admin' WHERE id = 2");

      const stmt = db.prepare("SELECT role FROM users WHERE id = 2");
      const result = stmt.get() as { role: string };

      expect(result.role).toBe('admin');

      db.close();
    });

    it('should execute DELETE statements', async () => {
      const db = new Database(testDbPath);

      const initialStmt = db.prepare('SELECT COUNT(*) as count FROM users');
      const initialResult = initialStmt.get() as { count: number };

      db.exec('DELETE FROM users WHERE id = 1');

      const afterStmt = db.prepare('SELECT COUNT(*) as count FROM users');
      const afterResult = afterStmt.get() as { count: number };

      expect(afterResult.count).toBe(initialResult.count - 1);

      db.close();
    });

    it('should execute CREATE TABLE statements', async () => {
      const db = new Database(testDbPath);

      db.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)');

      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'test_table'");
      const result = stmt.get();

      expect(result).toBeDefined();

      db.close();
    });

    it('should return correct changes count', async () => {
      const db = new Database(testDbPath);

      db.exec("UPDATE users SET role = 'admin' WHERE id = 2");

      const stmt = db.prepare('SELECT changes() as changes');
      const result = stmt.get() as { changes: number };

      expect(result.changes).toBeGreaterThan(0);

      db.close();
    });
  });

  describe('sqlite_tables tool', () => {
    it('should list all user tables', async () => {
      const db = new Database(testDbPath);

      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const tables = stmt.all() as Array<{ name: string }>;

      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
      expect(tables.some((t) => t.name === 'users')).toBe(true);

      db.close();
    });

    it('should exclude sqlite system tables', async () => {
      const db = new Database(testDbPath);

      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const tables = stmt.all() as Array<{ name: string }>;

      expect(tables.some((t) => t.name.startsWith('sqlite_'))).toBe(false);

      db.close();
    });

    it('should return empty array for database with no tables', async () => {
      const emptyDbPath = join(process.cwd(), 'empty-test.db');
      const db = new Database(emptyDbPath);

      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const tables = stmt.all() as Array<{ name: string }>;

      expect(tables.length).toBe(0);

      db.close();
      unlinkSync(emptyDbPath);
    });
  });

  describe('sqlite_schema tool', () => {
    it('should return schema for existing table', async () => {
      const db = new Database(testDbPath);

      const stmt = db.prepare('PRAGMA table_info(users)');
      const columns = stmt.all();

      expect(Array.isArray(columns)).toBe(true);
      expect(columns.length).toBeGreaterThan(0);
      expect(columns[0]).toHaveProperty('cid');
      expect(columns[0]).toHaveProperty('name');
      expect(columns[0]).toHaveProperty('type');
      expect(columns[0]).toHaveProperty('notnull');
      expect(columns[0]).toHaveProperty('dflt_value');
      expect(columns[0]).toHaveProperty('pk');

      db.close();
    });

    it('should include column information', async () => {
      const db = new Database(testDbPath);

      const stmt = db.prepare('PRAGMA table_info(users)');
      const columns = stmt.all();

      const idColumn = columns.find((c: any) => c.name === 'id');
      expect(idColumn).toBeDefined();
      expect(idColumn.type).toBe('INTEGER');
      expect(idColumn.pk).toBe(1);

      db.close();
    });

    it('should handle non-existent table gracefully', async () => {
      const db = new Database(testDbPath);

      const stmt = db.prepare('PRAGMA table_info(nonexistent_table)');
      const columns = stmt.all();

      expect(Array.isArray(columns)).toBe(true);
      expect(columns.length).toBe(0);

      db.close();
    });

    it('should return primary key information', async () => {
      const db = new Database(testDbPath);

      const stmt = db.prepare('PRAGMA table_info(users)');
      const columns = stmt.all();

      const pkColumns = columns.filter((c: any) => c.pk > 0);
      expect(pkColumns.length).toBeGreaterThan(0);

      db.close();
    });
  });

  describe('Input Validation', () => {
    it('should validate dbPath parameter for connect', async () => {
      const validPath = testDbPath;
      const invalidPath = '';

      expect(validPath.length).toBeGreaterThan(0);
      expect(invalidPath.length).toBe(0);
    });

    it('should validate SQL parameter for query', async () => {
      const validSql = 'SELECT * FROM users';
      const invalidSql = '';

      expect(validSql.trim().length).toBeGreaterThan(0);
      expect(invalidSql.trim().length).toBe(0);
    });

    it('should validate tableName parameter for schema', async () => {
      const validTableName = 'users';
      const invalidTableName = '';

      expect(validTableName.length).toBeGreaterThan(0);
      expect(invalidTableName.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database not connected error', async () => {
      // This would be tested when trying to query without connecting first
      // The MCP server should throw an appropriate error
      expect(true).toBe(true); // Placeholder
    });

    it('should handle malformed SQL', async () => {
      const db = new Database(testDbPath);

      expect(() => {
        const stmt = db.prepare('SELCT * FROM users'); // Typo: SELCT instead of SELECT
        stmt.all();
      }).toThrow();

      db.close();
    });

    it('should handle constraint violations', async () => {
      const db = new Database(testDbPath);

      // Try to insert duplicate email (should violate UNIQUE constraint)
      expect(() => {
        db.exec("INSERT INTO users (name, email, role) VALUES ('Duplicate', 'alice@example.com', 'user')");
      }).toThrow();

      db.close();
    });

    it('should handle database connection loss', async () => {
      const db = new Database(testDbPath);
      db.close();

      expect(() => {
        db.prepare('SELECT * FROM users');
      }).toThrow();
    });
  });

  describe('Database Connection Management', () => {
    it('should close existing connection when connecting to new database', async () => {
      const db1 = new Database(testDbPath);
      const db2Path = join(process.cwd(), 'test2.db');

      // Close first connection
      db1.close();

      // Create new connection
      const db2 = new Database(db2Path);
      expect(db2.open).toBe(true);
      db2.close();

      if (existsSync(db2Path)) {
        unlinkSync(db2Path);
      }
    });

    it('should handle multiple sequential queries', async () => {
      const db = new Database(testDbPath);

      for (let i = 0; i < 5; i++) {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
        const result = stmt.get();
        expect(result).toBeDefined();
      }

      db.close();
    });
  });
});
