# Test Suite for SQLite MCP GUI

This directory contains comprehensive tests for the SQLite MCP GUI project.

## Test Structure

```
test/
├── fixtures/           # Test data and sample inputs
│   └── sample-data.ts
├── helpers/            # Test utilities and database helpers
│   ├── database.ts    # Database creation and cleanup utilities
│   └── mocks.ts       # Mock objects for testing
├── server/            # MCP Server tests
│   └── index.test.ts  # Tests for MCP tools (sqlite_connect, sqlite_query, etc.)
├── ui/                # Web UI server tests
│   └── server.test.ts # Tests for API endpoints and error handling
├── scripts/           # Script tests
│   └── create-example-db.test.ts # Tests for database creation script
├── setup.ts           # Test setup and teardown
└── README.md          # This file
```

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Coverage

### MCP Server Tools (`test/server/index.test.ts`)

- **sqlite_connect**: Database connection, WAL mode, error handling
- **sqlite_query**: SELECT/PRAGMA queries, input validation, error handling
- **sqlite_execute**: INSERT/UPDATE/DELETE/CREATE statements, changes count
- **sqlite_tables**: Table listing, excluding system tables
- **sqlite_schema**: Column information, primary keys, data types
- **Input Validation**: Parameter validation, SQL validation
- **Error Handling**: Connection errors, malformed SQL, constraint violations

### Web UI Server (`test/ui/server.test.ts`)

- **POST /api/query**: SQL execution, result formatting, error handling
- **POST /api/tables**: Table listing, database access errors
- **POST /api/schema**: Schema retrieval, table name validation
- **SQL Sanitization**: SQL injection prevention, dangerous pattern detection
- **Error Handling**: Validation errors, database errors, 404 errors
- **Integration Tests**: Complete workflows, concurrent requests

### Example Database Script (`test/scripts/create-example-db.test.ts`)

- **Database Structure**: Table creation, schema validation
- **Sample Data**: User, product, order, and order_items data
- **Indexes**: Performance indexes validation
- **Relationships**: Foreign key constraints
- **Edge Cases**: UNIQUE constraints, DEFAULT values, AUTOINCREMENT

## Test Fixtures

### Sample Data (`test/fixtures/sample-data.ts`)

- Predefined users, products, and orders
- Valid and invalid SQL query examples
- SQL injection attempt samples

### Database Helpers (`test/helpers/database.ts`)

- `createTestDatabase()`: Create in-memory test database with sample data
- `cleanupTestDatabase()`: Clean up test database files
- `getTestDbPath()`: Get test database file path

### Mocks (`test/helpers/mocks.ts`)

- `MockDatabase`: Mock implementation of better-sqlite3 Database
- Mock query execution and result handling

## Notes

- Tests use Vitest as the testing framework
- better-sqlite3 is mocked for MCP server tests to avoid file I/O
- Real databases are used for Web UI server tests
- Test databases are automatically cleaned up before and after each test
- Tests cover both happy paths and error scenarios

## Troubleshooting

If tests fail to run:

1. Ensure all dependencies are installed: `npm install`
2. Check that vitest is properly installed: `npm list vitest`
3. Verify TypeScript compilation: `npm run build`
4. Check test database files are not locked: `rm -f test.db example.db`
