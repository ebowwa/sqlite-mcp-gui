/**
 * Mock better-sqlite3 Database class
 */
export class MockDatabase {
  private data: Map<string, any[]> = new Map();
  private isOpen = true;
  public pragmaCalls: string[] = [];

  constructor(private dbPath: string) {
    // Initialize with empty tables
  }

  prepare(sql: string) {
    const upperSql = sql.toUpperCase();

    // Handle SELECT queries
    if (upperSql.includes('SELECT')) {
      return {
        all: () => {
          if (upperSql.includes('sqlite_master')) {
            return [
              { name: 'users', type: 'table' },
              { name: 'products', type: 'table' },
            ];
          }
          if (upperSql.includes('PRAGMA table_info')) {
            const match = sql.match(/PRAGMA table_info\((\w+)\)/);
            const tableName = match ? match[1] : '';
            if (tableName === 'users') {
              return [
                { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
                { cid: 1, name: 'name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
                { cid: 2, name: 'email', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
              ];
            }
            return [];
          }
          if (upperSql.includes('changes()')) {
            return [{ changes: 1 }];
          }
          return this.data.get('default') || [];
        },
        get: () => {
          if (upperSql.includes('changes()')) {
            return { changes: 1 };
          }
          return {};
        },
        run: () => ({ changes: 1, lastInsertRowid: 1 }),
      };
    }

    // Handle INSERT/UPDATE/DELETE
    return {
      run: () => ({ changes: 1, lastInsertRowid: 1 }),
      all: () => [],
      get: () => ({}),
    };
  }

  exec(sql: string): void {
    // Track execution
  }

  pragma(pragma: string): string {
    this.pragmaCalls.push(pragma);
    return pragma === 'journal_mode = WAL' ? 'wal' : pragma;
  }

  close(): void {
    this.isOpen = false;
  }

  // Helper to set test data
  setData(table: string, data: any[]): void {
    this.data.set(table, data);
  }
}

/**
 * Mock Database constructor
 */
export function createMockDatabase(dbPath: string): MockDatabase {
  return new MockDatabase(dbPath);
}
