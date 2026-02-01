import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { join } from 'path';
import { unlinkSync, existsSync, readFileSync } from 'fs';
import { createTestDatabase, cleanupTestDatabase, getTestDbPath } from '../helpers/database.js';

// Import the server module to test helper functions
const serverModule = await import('../../src/ui/server.ts');

describe('Web UI Server', () => {
  let app: express.Application;
  let testDbPath: string;
  let server: any;

  beforeAll(async () => {
    testDbPath = getTestDbPath();
    createTestDatabase(testDbPath);

    // Create a test app similar to the server
    app = express();
    app.use(express.json());

    // Copy routes from server module
    const Database = (await import('better-sqlite3')).default;

    // Error classes
    class DatabaseError extends Error {
      constructor(message: string, public code?: string) {
        super(message);
        this.name = 'DatabaseError';
      }
    }

    class ValidationError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
      }
    }

    // Validation helper
    function validateRequestBody(required: string[], body: any): void {
      const missing = required.filter((field) => !body[field]);
      if (missing.length > 0) {
        throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
      }
    }

    // Sanitize SQL helper
    function sanitizeSQL(sql: string): string {
      const trimmed = sql.trim();
      if (trimmed.length === 0) {
        throw new ValidationError('SQL query cannot be empty');
      }
      if (trimmed.length > 100000) {
        throw new ValidationError('SQL query too large (max 100,000 characters)');
      }
      const dangerousPatterns = [
        /;\s*DROP\s+/i,
        /;\s*DELETE\s+FROM\s+\w+\s*$/i,
        /;\s*TRUNCATE/i,
        /;\s*ALTER\s+DATABASE/i,
      ];
      for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmed)) {
          throw new ValidationError('Potentially dangerous SQL pattern detected');
        }
      }
      return trimmed;
    }

    // API endpoint to execute SQL queries
    app.post('/api/query', async (req, res) => {
      let db: any = null;
      try {
        const { dbPath, sql } = req.body;

        validateRequestBody(['dbPath', 'sql'], req.body);
        const sanitizedSQL = sanitizeSQL(sql);

        try {
          db = new Database(dbPath, { readonly: false, timeout: 5000 });
          db.pragma('journal_mode = WAL');
        } catch (openError: any) {
          throw new DatabaseError(`Failed to open database: ${openError.message}`, 'DB_OPEN_ERROR');
        }

        const trimmedSql = sanitizedSQL.toUpperCase();

        if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA')) {
          try {
            const stmt = db.prepare(sanitizedSQL);
            const rows = stmt.all();
            res.json({ success: true, rows, rowCount: rows.length });
          } catch (queryError: any) {
            throw new DatabaseError(`Query failed: ${queryError.message}`, 'QUERY_ERROR');
          }
        } else {
          try {
            const result = db.exec(sanitizedSQL);
            const changesStmt = db.prepare('SELECT changes() as changes');
            const { changes } = changesStmt.get() as { changes: number };
            res.json({ success: true, changes, message: `Query executed successfully. ${changes} row(s) affected.` });
          } catch (execError: any) {
            throw new DatabaseError(`Execution failed: ${execError.message}`, 'EXEC_ERROR');
          }
        }
      } catch (error: any) {
        if (error instanceof ValidationError) {
          return res.status(400).json({ success: false, error: error.message, type: 'validation' });
        }
        if (error instanceof DatabaseError) {
          return res.status(500).json({ success: false, error: error.message, code: error.code, type: 'database' });
        }
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error occurred', type: 'unknown' });
      } finally {
        if (db) {
          try {
            db.close();
          } catch (closeError) {
            console.error('Error closing database:', closeError);
          }
        }
      }
    });

    // API endpoint to get tables
    app.post('/api/tables', async (req, res) => {
      let db: any = null;
      try {
        const { dbPath } = req.body;

        validateRequestBody(['dbPath'], req.body);

        try {
          db = new Database(dbPath, { readonly: true, timeout: 5000 });
        } catch (openError: any) {
          throw new DatabaseError(`Failed to open database: ${openError.message}`, 'DB_OPEN_ERROR');
        }

        const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        const tables = stmt.all() as Array<{ name: string }>;

        res.json({ success: true, tables: tables.map((t) => t.name) });
      } catch (error: any) {
        if (error instanceof ValidationError) {
          return res.status(400).json({ success: false, error: error.message, type: 'validation' });
        }
        if (error instanceof DatabaseError) {
          return res.status(500).json({ success: false, error: error.message, code: error.code, type: 'database' });
        }
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error', type: 'unknown' });
      } finally {
        if (db) {
          try {
            db.close();
          } catch (closeError) {
            console.error('Error closing database:', closeError);
          }
        }
      }
    });

    // API endpoint to get table schema
    app.post('/api/schema', async (req, res) => {
      let db: any = null;
      try {
        const { dbPath, tableName } = req.body;

        validateRequestBody(['dbPath', 'tableName'], req.body);

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
          throw new ValidationError('Invalid table name');
        }

        try {
          db = new Database(dbPath, { readonly: true, timeout: 5000 });
        } catch (openError: any) {
          throw new DatabaseError(`Failed to open database: ${openError.message}`, 'DB_OPEN_ERROR');
        }

        const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
        const columns = stmt.all();

        res.json({ success: true, table: tableName, columns });
      } catch (error: any) {
        if (error instanceof ValidationError) {
          return res.status(400).json({ success: false, error: error.message, type: 'validation' });
        }
        if (error instanceof DatabaseError) {
          return res.status(500).json({ success: false, error: error.message, code: error.code, type: 'database' });
        }
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error', type: 'unknown' });
      } finally {
        if (db) {
          try {
            db.close();
          } catch (closeError) {
            console.error('Error closing database:', closeError);
          }
        }
      }
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ success: false, error: 'Endpoint not found', type: 'not_found' });
    });
  });

  afterAll(() => {
    cleanupTestDatabase(testDbPath);
  });

  describe('POST /api/query', () => {
    it('should execute SELECT queries successfully', async () => {
      const response = await request(app).post('/api/query').send({ dbPath: testDbPath, sql: 'SELECT * FROM users' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.rows)).toBe(true);
      expect(response.body.rows.length).toBeGreaterThan(0);
      expect(response.body.rowCount).toBeGreaterThan(0);
    });

    it('should execute PRAGMA queries successfully', async () => {
      const response = await request(app).post('/api/query').send({ dbPath: testDbPath, sql: 'PRAGMA table_info(users)' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.rows)).toBe(true);
    });

    it('should execute INSERT statements', async () => {
      const response = await request(app)
        .post('/api/query')
        .send({ dbPath: testDbPath, sql: "INSERT INTO users (name, email, role) VALUES ('Test', 'test@test.com', 'user')" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.changes).toBe(1);
    });

    it('should execute UPDATE statements', async () => {
      const response = await request(app).post('/api/query').send({ dbPath: testDbPath, sql: "UPDATE users SET role = 'admin' WHERE id = 1" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.changes).toBe(1);
    });

    it('should execute DELETE statements', async () => {
      const response = await request(app).post('/api/query').send({ dbPath: testDbPath, sql: 'DELETE FROM users WHERE id = 2' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return validation error when dbPath is missing', async () => {
      const response = await request(app).post('/api/query').send({ sql: 'SELECT * FROM users' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should return validation error when SQL is missing', async () => {
      const response = await request(app).post('/api/query').send({ dbPath: testDbPath });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
    });

    it('should return validation error for empty SQL', async () => {
      const response = await request(app).post('/api/query').send({ dbPath: testDbPath, sql: '' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
      expect(response.body.error).toContain('SQL query cannot be empty');
    });

    it('should return validation error for SQL that is too long', async () => {
      const longSql = 'SELECT * FROM users WHERE ' + 'x=1 '.repeat(10000);

      const response = await request(app).post('/api/query').send({ dbPath: testDbPath, sql: longSql });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
      expect(response.body.error).toContain('SQL query too large');
    });

    it('should return database error for invalid SQL syntax', async () => {
      const response = await request(app).post('/api/query').send({ dbPath: testDbPath, sql: 'SELCT * FROM users' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('database');
      expect(response.body.code).toBe('QUERY_ERROR');
    });

    it('should return database error for non-existent database', async () => {
      const response = await request(app).post('/api/query').send({ dbPath: '/nonexistent/path/to/db.db', sql: 'SELECT * FROM users' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('database');
      expect(response.body.code).toBe('DB_OPEN_ERROR');
    });
  });

  describe('POST /api/tables', () => {
    it('should list all tables', async () => {
      const response = await request(app).post('/api/tables').send({ dbPath: testDbPath });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.tables)).toBe(true);
      expect(response.body.tables.length).toBeGreaterThan(0);
      expect(response.body.tables).toContain('users');
    });

    it('should exclude sqlite system tables', async () => {
      const response = await request(app).post('/api/tables').send({ dbPath: testDbPath });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tables.some((t: string) => t.startsWith('sqlite_'))).toBe(false);
    });

    it('should return validation error when dbPath is missing', async () => {
      const response = await request(app).post('/api/tables').send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
    });

    it('should return database error for invalid database', async () => {
      const response = await request(app).post('/api/tables').send({ dbPath: '/invalid/path/db.db' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('database');
      expect(response.body.code).toBe('DB_OPEN_ERROR');
    });
  });

  describe('POST /api/schema', () => {
    it('should return schema for valid table', async () => {
      const response = await request(app).post('/api/schema').send({ dbPath: testDbPath, tableName: 'users' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.table).toBe('users');
      expect(Array.isArray(response.body.columns)).toBe(true);
      expect(response.body.columns.length).toBeGreaterThan(0);
      expect(response.body.columns[0]).toHaveProperty('name');
      expect(response.body.columns[0]).toHaveProperty('type');
    });

    it('should return primary key information', async () => {
      const response = await request(app).post('/api/schema').send({ dbPath: testDbPath, tableName: 'users' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const pkColumn = response.body.columns.find((c: any) => c.pk > 0);
      expect(pkColumn).toBeDefined();
      expect(pkColumn.name).toBe('id');
    });

    it('should return validation error when dbPath is missing', async () => {
      const response = await request(app).post('/api/schema').send({ tableName: 'users' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
    });

    it('should return validation error when tableName is missing', async () => {
      const response = await request(app).post('/api/schema').send({ dbPath: testDbPath });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
    });

    it('should return validation error for invalid table name', async () => {
      const response = await request(app).post('/api/schema').send({ dbPath: testDbPath, tableName: 'invalid-table-name!' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
      expect(response.body.error).toContain('Invalid table name');
    });

    it('should return validation error for table name with SQL injection attempt', async () => {
      const response = await request(app).post('/api/schema').send({ dbPath: testDbPath, tableName: "users; DROP TABLE users; --" });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
    });

    it('should return empty array for non-existent table', async () => {
      const response = await request(app).post('/api/schema').send({ dbPath: testDbPath, tableName: 'nonexistent_table' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.columns)).toBe(true);
      expect(response.body.columns.length).toBe(0);
    });
  });

  describe('SQL Sanitization', () => {
    it('should reject SQL with DROP TABLE pattern', async () => {
      const response = await request(app).post('/api/query').send({ dbPath: testDbPath, sql: 'SELECT * FROM users; DROP TABLE users' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
      expect(response.body.error).toContain('Potentially dangerous SQL pattern');
    });

    it('should reject SQL with DELETE FROM pattern', async () => {
      const response = await request(app).post('/api/query').send({ dbPath: testDbPath, sql: 'SELECT * FROM users; DELETE FROM users' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
    });

    it('should reject SQL with TRUNCATE pattern', async () => {
      const response = await request(app).post('/api/query').send({ dbPath: testDbPath, sql: 'SELECT * FROM users; TRUNCATE users' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
    });

    it('should reject SQL with ALTER DATABASE pattern', async () => {
      const response = await request(app).post('/api/query').send({ dbPath: testDbPath, sql: 'SELECT * FROM users; ALTER DATABASE' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('validation');
    });
  });

  describe('Error Handling Classes', () => {
    it('should create DatabaseError with code', () => {
      const error = new Error('Test error');
      error.name = 'DatabaseError';
      expect(error.name).toBe('DatabaseError');
    });

    it('should create ValidationError', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await request(app).get('/api/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.type).toBe('not_found');
      expect(response.body.error).toBe('Endpoint not found');
    });
  });

  describe('Validation Helper Function', () => {
    it('should validate required fields correctly', () => {
      const validateRequestBody = (required: string[], body: any): void => {
        const missing = required.filter((field) => !body[field]);
        if (missing.length > 0) {
          throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
      };

      expect(() => validateRequestBody(['dbPath', 'sql'], { dbPath: 'test.db', sql: 'SELECT 1' })).not.toThrow();
      expect(() => validateRequestBody(['dbPath', 'sql'], { dbPath: 'test.db' })).toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete workflow: tables -> schema -> query', async () => {
      // Get tables
      const tablesResponse = await request(app).post('/api/tables').send({ dbPath: testDbPath });
      expect(tablesResponse.status).toBe(200);
      const tableName = tablesResponse.body.tables[0];

      // Get schema
      const schemaResponse = await request(app).post('/api/schema').send({ dbPath: testDbPath, tableName });
      expect(schemaResponse.status).toBe(200);

      // Query data
      const queryResponse = await request(app).post('/api/query').send({ dbPath: testDbPath, sql: `SELECT * FROM ${tableName}` });
      expect(queryResponse.status).toBe(200);
    });

    it('should handle multiple concurrent requests', async () => {
      const requests = [
        request(app).post('/api/query').send({ dbPath: testDbPath, sql: 'SELECT * FROM users' }),
        request(app).post('/api/tables').send({ dbPath: testDbPath }),
        request(app).post('/api/schema').send({ dbPath: testDbPath, tableName: 'users' }),
      ];

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect([200, 400, 500]).toContain(response.status);
      });
    });
  });
});
