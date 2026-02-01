# MCP Tools Documentation

This document describes all MCP (Model Context Protocol) tools available in the SQLite MCP GUI server.

## Overview

The SQLite MCP Server provides tools for interacting with SQLite databases through the Model Context Protocol.

**Server Information:**
- **Name:** `sqlite-mcp-server`
- **Version:** `1.0.0`
- **Protocol:** MCP (Model Context Protocol)
- **Transport:** Stdio

## Available Tools

### 1. sqlite_connect

Connect to a SQLite database file.

**Parameters:**
- `dbPath` (string, required): Path to the SQLite database file

**Return Value:**
```json
{
  "success": true,
  "message": "Connected to database: /path/to/database.db",
  "path": "/path/to/database.db"
}
```

### 2. sqlite_query

Execute a SELECT or PRAGMA query.

**Parameters:**
- `sql` (string, required): SQL query to execute

**Return Value:**
```json
{
  "success": true,
  "rows": [...],
  "rowCount": 10
}
```

### 3. sqlite_execute

Execute INSERT, UPDATE, DELETE, CREATE, etc.

**Parameters:**
- `sql` (string, required): SQL statement to execute

**Return Value:**
```json
{
  "success": true,
  "message": "Statement executed successfully",
  "changes": 1
}
```

### 4. sqlite_tables

List all tables in the database.

**Parameters:** None

**Return Value:**
```json
{
  "success": true,
  "tables": ["users", "products", "orders"]
}
```

### 5. sqlite_schema

Get table schema information.

**Parameters:**
- `tableName` (string, required): Name of the table

**Return Value:**
```json
{
  "success": true,
  "table": "users",
  "columns": [...]
}
```

## Error Handling

All tools return errors in this format:
```json
{
  "error": "Error message"
}
```

## Best Practices

1. Always connect to a database first using `sqlite_connect`
2. Use `sqlite_query` for SELECT queries only
3. Use `sqlite_execute` for data modifications
4. Explore tables with `sqlite_tables` before querying
5. Get schema with `sqlite_schema` to understand table structure

For more details, see [API Reference](docs/api-reference.md).
