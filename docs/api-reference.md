# API Reference

Complete REST API reference for SQLite MCP GUI.

## Base URL

```
http://localhost:3000
```

Customize port using the `PORT` environment variable.

## Endpoints

### POST /api/query

Execute SQL queries.

**Request:**
```json
{
  "dbPath": "/path/to/database.db",
  "sql": "SELECT * FROM users LIMIT 10"
}
```

**Response (SELECT):**
```json
{
  "success": true,
  "rows": [...],
  "rowCount": 10
}
```

**Response (INSERT/UPDATE/DELETE):**
```json
{
  "success": true,
  "changes": 1,
  "message": "Query executed successfully"
}
```

### POST /api/tables

List all tables.

**Request:**
```json
{
  "dbPath": "/path/to/database.db"
}
```

**Response:**
```json
{
  "success": true,
  "tables": ["users", "products", "orders"]
}
```

### POST /api/schema

Get table schema.

**Request:**
```json
{
  "dbPath": "/path/to/database.db",
  "tableName": "users"
}
```

**Response:**
```json
{
  "success": true,
  "table": "users",
  "columns": [...]
}
```

### GET /health

Health check.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600
}
```

### GET /metrics

API metrics.

**Response:**
```json
{
  "requests": {"total": 1250, "successful": 1200, "failed": 50},
  "queries": {"total": 800, "selects": 600, "modifications": 200}
}
```

## cURL Examples

```bash
# Query
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"dbPath": "/path/to/db.sqlite", "sql": "SELECT * FROM users"}'

# List tables
curl -X POST http://localhost:3000/api/tables \
  -H "Content-Type: application/json" \
  -d '{"dbPath": "/path/to/db.sqlite"}'

# Get schema
curl -X POST http://localhost:3000/api/schema \
  -H "Content-Type: application/json" \
  -d '{"dbPath": "/path/to/db.sqlite", "tableName": "users"}'
```
