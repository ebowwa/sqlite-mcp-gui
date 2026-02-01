# MCP Tools Documentation

Complete documentation for all Model Context Protocol (MCP) tools provided by the SQLite MCP GUI server.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Available Tools](#available-tools)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Examples](#examples)
- [Integration Guide](#integration-guide)

## Overview

The SQLite MCP Server provides a standardized interface for interacting with SQLite databases through the Model Context Protocol (MCP). This allows AI agents and MCP-compatible clients to perform database operations programmatically.

### Server Information

| Property | Value |
|----------|-------|
| **Name** | `sqlite-mcp-server` |
| **Version** | `1.0.0` |
| **Protocol** | MCP (Model Context Protocol) |
| **Transport** | Stdio |
| **Capabilities** | Tools |

### Features

- **Connection Management**: Connect to any SQLite database file
- **Query Execution**: Run SELECT queries and PRAGMA statements
- **Data Modification**: Execute INSERT, UPDATE, DELETE, and DDL statements
- **Schema Inspection**: List tables and retrieve table schemas
- **Error Handling**: Comprehensive error reporting with detailed messages
- **WAL Mode**: Automatic Write-Ahead Logging for better concurrency

## Getting Started

### Installation

Add the MCP server to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "node",
      "args": ["/path/to/sqlite-mcp-gui/dist/server/index.js"]
    }
  }
}
```

### Starting the Server

From the command line:

```bash
npm run start:mcp
```

Or directly:

```bash
node dist/server/index.js
```

## Available Tools

### 1. sqlite_connect

Connect to a SQLite database file. Creates a new database if it doesn't exist.

**Description**: Establishes a connection to a SQLite database file. The connection is maintained for subsequent operations. If the database file doesn't exist, it will be created automatically.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `dbPath` | string | Yes | Absolute or relative path to the SQLite database file |

**Returns**:

```json
{
  "success": true,
  "message": "Connected to database: /path/to/database.db",
  "path": "/path/to/database.db"
}
```

**Examples**:

Connect to an existing database:
```javascript
await callTool('sqlite_connect', {
  dbPath: '/data/users.db'
})
```

Connect to a new database (will be created):
```javascript
await callTool('sqlite_connect', {
  dbPath: './new-database.db'
})
```

**Notes**:
- Only one database connection is maintained at a time
- Connecting to a new database closes any existing connection
- The parent directory must exist for new database files
- WAL mode is automatically enabled for better concurrency

---

### 2. sqlite_query

Execute a SELECT or PRAGMA query on the connected database.

**Description**: Runs read-only SQL queries and returns the results. Only SELECT and PRAGMA statements are allowed for safety. Use `sqlite_execute` for data modifications.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sql` | string | Yes | SQL query to execute (must be SELECT or PRAGMA) |

**Returns**:

```json
{
  "success": true,
  "rows": [
    { "id": 1, "name": "John Doe", "email": "john@example.com" },
    { "id": 2, "name": "Jane Smith", "email": "jane@example.com" }
  ],
  "rowCount": 2
}
```

**Examples**:

Select all users:
```javascript
await callTool('sqlite_query', {
  sql: 'SELECT * FROM users LIMIT 10'
})
```

Query with filtering:
```javascript
await callTool('sqlite_query', {
  sql: 'SELECT id, name, email FROM users WHERE active = 1'
})
```

Get table schema:
```javascript
await callTool('sqlite_query', {
  sql: 'PRAGMA table_info(users)'
})
```

Join query:
```javascript
await callTool('sqlite_query', {
  sql: `
    SELECT u.name, o.total
    FROM users u
    JOIN orders o ON u.id = o.user_id
    WHERE o.status = 'completed'
  `
})
```

**Notes**:
- Must be connected to a database first
- Only SELECT and PRAGMA queries are allowed
- Returns an array of result rows
- Use `sqlite_execute` for INSERT, UPDATE, DELETE, etc.
- Complex queries with JOINs, GROUP BY, etc. are supported

---

### 3. sqlite_execute

Execute a SQL statement that modifies data or schema (INSERT, UPDATE, DELETE, CREATE, etc.).

**Description**: Runs SQL statements that modify the database. Supports DML (INSERT, UPDATE, DELETE) and DDL (CREATE, ALTER, DROP) statements.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sql` | string | Yes | SQL statement to execute |

**Returns**:

```json
{
  "success": true,
  "message": "Statement executed successfully",
  "changes": 1
}
```

**Examples**:

Insert a new record:
```javascript
await callTool('sqlite_execute', {
  sql: "INSERT INTO users (name, email) VALUES ('John Doe', 'john@example.com')"
})
```

Update records:
```javascript
await callTool('sqlite_execute', {
  sql: "UPDATE users SET active = 1 WHERE id = 5"
})
```

Delete records:
```javascript
await callTool('sqlite_execute', {
  sql: "DELETE FROM logs WHERE created_at < datetime('now', '-30 days')"
})
```

Create a new table:
```javascript
await callTool('sqlite_execute', {
  sql: 'CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY, message TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
})
```

Create an index:
```javascript
await callTool('sqlite_execute', {
  sql: 'CREATE INDEX idx_users_email ON users(email)'
})
```

**Notes**:
- Must be connected to a database first
- Returns the number of rows affected for INSERT/UPDATE/DELETE
- Returns 0 for DDL statements (CREATE, DROP, etc.)
- Multiple statements separated by semicolons are not supported
- Use transactions for multiple related operations

---

### 4. sqlite_tables

List all tables in the current database.

**Description**: Retrieves a list of all user-created tables in the database. Excludes SQLite system tables (those starting with 'sqlite_').

**Parameters**: None

**Returns**:

```json
{
  "success": true,
  "tables": ["users", "products", "orders", "audit_logs"]
}
```

**Examples**:

List all tables:
```javascript
await callTool('sqlite_tables')
```

**Notes**:
- Must be connected to a database first
- Tables are returned in alphabetical order
- System tables (sqlite_*) are excluded
- Views are not included in the results

---

### 5. sqlite_schema

Get the schema (columns and types) for a specific table.

**Description**: Retrieves detailed schema information for a table, including column names, data types, constraints, and primary key information.

**Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableName` | string | Yes | Name of the table to get schema for |

**Returns**:

```json
{
  "success": true,
  "table": "users",
  "columns": [
    {
      "cid": 0,
      "name": "id",
      "type": "INTEGER",
      "notnull": 1,
      "dflt_value": null,
      "pk": 1
    },
    {
      "cid": 1,
      "name": "name",
      "type": "TEXT",
      "notnull": 1,
      "dflt_value": null,
      "pk": 0
    },
    {
      "cid": 2,
      "name": "email",
      "type": "TEXT",
      "notnull": 0,
      "dflt_value": "''",
      "pk": 0
    }
  ]
}
```

**Column Information**:

| Field | Type | Description |
|-------|------|-------------|
| `cid` | integer | Column ID (0-based index) |
| `name` | string | Column name |
| `type` | string | Data type (INTEGER, TEXT, REAL, BLOB) |
| `notnull` | integer | NOT NULL constraint (1 = has constraint, 0 = nullable) |
| `dflt_value` | string\|null | Default value for the column |
| `pk` | integer | Primary key position (0 = not part of PK, 1+ = PK order) |

**Examples**:

Get table schema:
```javascript
await callTool('sqlite_schema', {
  tableName: 'users'
})
```

**Notes**:
- Must be connected to a database first
- Uses PRAGMA table_info() internally
- Includes all constraint information
- Useful for understanding table structure before querying

## Error Handling

All tools return errors in a consistent format:

```json
{
  "error": "Error message describing what went wrong"
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Not connected to a database` | Attempted operation without connecting | Call `sqlite_connect` first |
| `Only SELECT and PRAGMA queries are allowed` | Used non-read-only query in `sqlite_query` | Use `sqlite_execute` instead |
| `Unknown tool: tool_name` | Invalid tool name | Check tool name spelling |
| `SQL logic error: no such table` | Table doesn't exist | Check table name or create it |
| `SQL logic error: near "FROM": syntax error` | Invalid SQL syntax | Fix SQL syntax |

### Error Handling Best Practices

```javascript
try {
  const result = await callTool('sqlite_query', {
    sql: 'SELECT * FROM users'
  })

  if (result.error) {
    console.error('Query failed:', result.error)
    // Handle error appropriately
  } else {
    console.log('Query succeeded:', result.rows)
  }
} catch (error) {
  console.error('Unexpected error:', error)
}
```

## Best Practices

### 1. Connection Management

- **Always connect first**: Call `sqlite_connect` before any other operations
- **Close when done**: Although the server manages connections, it's good practice to disconnect when finished
- **One connection at a time**: The server maintains a single active connection

```javascript
// Good practice
await callTool('sqlite_connect', { dbPath: './data.db' })
// ... perform operations ...
```

### 2. Query Optimization

- **Use LIMIT**: Restrict result sets with LIMIT clause
- **Select specific columns**: Avoid SELECT * when possible
- **Use indexes**: Create indexes on frequently queried columns
- **Filter early**: Use WHERE clauses to reduce data processed

```javascript
// Good - specific columns with limit
await callTool('sqlite_query', {
  sql: 'SELECT id, name FROM users WHERE active = 1 LIMIT 100'
})

// Avoid - too much data
await callTool('sqlite_query', {
  sql: 'SELECT * FROM users'  // No LIMIT
})
```

### 3. Data Safety

- **Use transactions**: Group related operations
- **Validate input**: Sanitize user input before using in queries
- **Backup first**: Create backups before schema changes
- **Test queries**: Use SELECT before UPDATE/DELETE

```javascript
// Good - test with SELECT first
await callTool('sqlite_query', {
  sql: "SELECT * FROM users WHERE email = 'test@example.com'"
})

// Then execute
await callTool('sqlite_execute', {
  sql: "DELETE FROM users WHERE email = 'test@example.com'"
})
```

### 4. Schema Exploration

- **List tables first**: Use `sqlite_tables` to see available tables
- **Get schema**: Use `sqlite_schema` to understand structure
- **Check constraints**: Review column constraints before inserting data

```javascript
// Explore database structure
const tables = await callTool('sqlite_tables')
for (const table of tables.tables) {
  const schema = await callTool('sqlite_schema', { tableName: table })
  console.log(`Table: ${table}`, schema.columns)
}
```

### 5. Error Handling

- **Always check for errors**: Inspect response for error property
- **Log errors**: Record errors for debugging
- **Provide context**: Include relevant information in error messages
- **Retry gracefully**: Implement retry logic for transient errors

```javascript
const result = await callTool('sqlite_query', { sql: query })
if (result.error) {
  logger.error('Query failed', { query, error: result.error })
  return
}
```

## Examples

### Example 1: Complete Workflow

```javascript
// 1. Connect to database
await callTool('sqlite_connect', {
  dbPath: './ecommerce.db'
})

// 2. List tables
const tables = await callTool('sqlite_tables')
console.log('Available tables:', tables.tables)

// 3. Get table schema
const schema = await callTool('sqlite_schema', {
  tableName: 'users'
})
console.log('User table columns:', schema.columns)

// 4. Query data
const users = await callTool('sqlite_query', {
  sql: 'SELECT id, name, email FROM users WHERE active = 1 LIMIT 10'
})
console.log('Active users:', users.rows)

// 5. Insert data
await callTool('sqlite_execute', {
  sql: "INSERT INTO users (name, email) VALUES ('New User', 'new@example.com')"
})

// 6. Verify insertion
const result = await callTool('sqlite_query', {
  sql: "SELECT * FROM users WHERE email = 'new@example.com'"
})
console.log('New user:', result.rows)
```

### Example 2: Data Analysis

```javascript
// Connect
await callTool('sqlite_connect', { dbPath: './sales.db' })

// Get total sales by month
const salesByMonth = await callTool('sqlite_query', {
  sql: `
    SELECT
      strftime('%Y-%m', order_date) as month,
      SUM(total) as revenue,
      COUNT(*) as orders
    FROM orders
    WHERE status = 'completed'
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `
})

console.log('Monthly sales:', salesByMonth.rows)

// Get top customers
const topCustomers = await callTool('sqlite_query', {
  sql: `
    SELECT
      c.name,
      c.email,
      COUNT(o.id) as order_count,
      SUM(o.total) as total_spent
    FROM customers c
    JOIN orders o ON c.id = o.customer_id
    WHERE o.status = 'completed'
    GROUP BY c.id
    ORDER BY total_spent DESC
    LIMIT 10
  `
})

console.log('Top customers:', topCustomers.rows)
```

### Example 3: Schema Management

```javascript
await callTool('sqlite_connect', { dbPath: './app.db' })

// Create a new table
await callTool('sqlite_execute', {
  sql: `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      changes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `
})

// Create indexes
await callTool('sqlite_execute', {
  sql: 'CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id)'
})

await callTool('sqlite_execute', {
  sql: 'CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at)'
})

// Verify schema
const schema = await callTool('sqlite_schema', { tableName: 'audit_logs' })
console.log('Audit logs schema:', schema.columns)
```

### Example 4: Bulk Operations

```javascript
await callTool('sqlite_connect', { dbPath: './data.db' })

// Insert multiple records
const users = [
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'bob@example.com' },
  { name: 'Charlie', email: 'charlie@example.com' }
]

for (const user of users) {
  await callTool('sqlite_execute', {
    sql: `INSERT INTO users (name, email) VALUES ('${user.name}', '${user.email}')`
  })
}

// Verify insertions
const result = await callTool('sqlite_query', {
  sql: 'SELECT COUNT(*) as count FROM users'
})
console.log('Total users:', result.rows[0].count)
```

## Integration Guide

### With Claude Desktop

1. Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "node",
      "args": ["/absolute/path/to/sqlite-mcp-gui/dist/server/index.js"]
    }
  }
}
```

2. Restart Claude Desktop

3. Use in conversation:
```
Connect to the database at /data/users.db and show me all users with email addresses ending in @example.com
```

### With Custom MCP Client

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({
  command: 'node',
  args: ['./dist/server/index.js']
})

const client = new Client({
  name: 'sqlite-client',
  version: '1.0.0'
}, {
  capabilities: {}
})

await client.connect(transport)

// Connect to database
await client.callTool({
  name: 'sqlite_connect',
  arguments: { dbPath: './data.db' }
})

// Query data
const result = await client.callTool({
  name: 'sqlite_query',
  arguments: { sql: 'SELECT * FROM users' }
})

console.log(result)
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SQLITE_DB_PATH` | Default database path | None |
| `SQLITE_WAL_MODE` | Enable WAL mode | true |

## Troubleshooting

### Connection Issues

**Problem**: "Not connected to a database"
- **Solution**: Call `sqlite_connect` first

**Problem**: "Unable to open database file"
- **Solution**: Check file path and permissions

### Query Issues

**Problem**: "Only SELECT and PRAGMA queries are allowed"
- **Solution**: Use `sqlite_execute` for INSERT/UPDATE/DELETE

**Problem**: "SQL logic error"
- **Solution**: Validate SQL syntax and table/column names

### Performance Issues

**Problem**: Slow queries
- **Solution**: Add indexes, use LIMIT, optimize SELECT columns

**Problem**: Too much data returned
- **Solution**: Always use LIMIT clause, filter with WHERE

For more troubleshooting tips, see [Troubleshooting Guide](docs/troubleshooting.md).

## Additional Resources

- [OpenAPI Specification](openapi.yaml) - REST API documentation
- [API Reference](docs/api-reference.md) - Complete REST API reference
- [README.md](README.md) - Project overview and setup
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP official documentation
