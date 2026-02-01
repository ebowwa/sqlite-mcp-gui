# REST API Reference

Complete reference documentation for the SQLite MCP GUI REST API.

## Table of Contents

- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [Database Endpoints](#database-endpoints)
- [Authentication Endpoints](#authentication-endpoints)
- [Health Endpoints](#health-endpoints)
- [Error Responses](#error-responses)
- [Rate Limiting](#rate-limiting)
- [Code Examples](#code-examples)

## Getting Started

### Base URL

```
http://localhost:3000
```

The server port can be customized using the `PORT` environment variable:

```bash
PORT=8080 npm run start:ui
```

### Making Requests

All API endpoints (except `/health`) expect JSON request bodies and return JSON responses.

#### Common Request Headers

```http
Content-Type: application/json
Authorization: Bearer <token>  # When auth is enabled
X-API-Key: <key>                # When API keys are enabled
```

## Authentication

The API supports multiple authentication methods when `AUTH_ENABLED=true`.

### Authentication Methods

| Method | Header | Description |
|--------|--------|-------------|
| JWT | `Authorization: Bearer <token>` | Get token from `/auth/login` |
| API Key | `X-API-Key: <key>` | Configure via environment |
| Basic Auth | `Authorization: Basic <base64>` | Standard HTTP Basic Auth |
| Session | Cookie: `session=<token>` | Set automatically by `/auth/login` |

### Checking Auth Status

```bash
curl http://localhost:3000/auth/config
```

Response:
```json
{
  "enabled": true,
  "methods": {
    "jwt": true,
    "apiKeys": false,
    "basicAuth": false,
    "session": true
  }
}
```

## Database Endpoints

### POST /api/query

Execute SQL queries against a SQLite database.

#### Request

```http
POST /api/query
Content-Type: application/json
```

```json
{
  "dbPath": "/path/to/database.db",
  "sql": "SELECT * FROM users WHERE active = 1 LIMIT 10"
}
```

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `dbPath` | string | Yes | Absolute or relative path to SQLite database |
| `sql` | string | Yes | SQL query to execute |

#### Response (SELECT/PRAGMA)

```json
{
  "success": true,
  "rows": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com"
    },
    {
      "id": 2,
      "name": "Jane Smith",
      "email": "jane@example.com"
    }
  ],
  "rowCount": 2
}
```

#### Response (INSERT/UPDATE/DELETE)

```json
{
  "success": true,
  "changes": 1,
  "message": "Query executed successfully"
}
```

#### Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request (missing parameters) |
| 401 | Unauthorized (when auth enabled) |
| 403 | Forbidden (insufficient permissions) |
| 500 | Database error |

#### Examples

**JavaScript/TypeScript:**

```typescript
const response = await fetch('http://localhost:3000/api/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    dbPath: '/data/users.db',
    sql: 'SELECT id, name, email FROM users LIMIT 10'
  })
})

const data = await response.json()
console.log(data.rows)
```

**cURL:**

```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "dbPath": "/data/users.db",
    "sql": "SELECT * FROM users LIMIT 10"
  }'
```

**With Authentication:**

```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "dbPath": "/data/users.db",
    "sql": "SELECT * FROM users"
  }'
```

---

### POST /api/tables

List all tables in the database.

#### Request

```http
POST /api/tables
Content-Type: application/json
```

```json
{
  "dbPath": "/path/to/database.db"
}
```

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `dbPath` | string | Yes | Absolute or relative path to SQLite database |

#### Response

```json
{
  "success": true,
  "tables": ["orders", "products", "users"]
}
```

#### Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request |
| 401 | Unauthorized |
| 500 | Database error |

#### Examples

**JavaScript:**

```javascript
const response = await fetch('http://localhost:3000/api/tables', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    dbPath: '/data/ecommerce.db'
  })
})

const { tables } = await response.json()
console.log('Available tables:', tables)
```

**cURL:**

```bash
curl -X POST http://localhost:3000/api/tables \
  -H "Content-Type: application/json" \
  -d '{"dbPath": "/data/ecommerce.db"}'
```

---

### POST /api/schema

Get schema information for a specific table.

#### Request

```http
POST /api/schema
Content-Type: application/json
```

```json
{
  "dbPath": "/path/to/database.db",
  "tableName": "users"
}
```

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `dbPath` | string | Yes | Absolute or relative path to SQLite database |
| `tableName` | string | Yes | Name of the table |

#### Response

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

#### Column Fields

| Field | Type | Description |
|-------|------|-------------|
| `cid` | integer | Column ID (0-based index) |
| `name` | string | Column name |
| `type` | string | Data type (INTEGER, TEXT, REAL, BLOB) |
| `notnull` | integer | NOT NULL constraint (1 = yes, 0 = no) |
| `dflt_value` | string\|null | Default value |
| `pk` | integer | Primary key position (0 = not PK) |

#### Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request |
| 401 | Unauthorized |
| 500 | Database error |

#### Examples

**JavaScript:**

```javascript
const response = await fetch('http://localhost:3000/api/schema', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    dbPath: '/data/users.db',
    tableName: 'users'
  })
})

const { columns } = await response.json()
columns.forEach(col => {
  console.log(`${col.name}: ${col.type}`)
})
```

**cURL:**

```bash
curl -X POST http://localhost:3000/api/schema \
  -H "Content-Type: application/json" \
  -d '{
    "dbPath": "/data/users.db",
    "tableName": "users"
  }'
```

## Authentication Endpoints

### POST /auth/login

Authenticate with username/password.

#### Request

```http
POST /auth/login
Content-Type: application/json
```

```json
{
  "username": "admin",
  "password": "password123"
}
```

#### Response (Auth Enabled)

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "username": "admin",
    "role": "admin"
  }
}
```

#### Response (Auth Disabled)

```json
{
  "success": true,
  "message": "Authentication is disabled",
  "user": {
    "id": "anonymous",
    "username": "anonymous",
    "role": "admin"
  }
}
```

#### Examples

```javascript
const response = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'password123'
  })
})

const { token } = await response.json()
// Use token in Authorization header
```

---

### POST /auth/logout

Clear the session cookie.

#### Request

```http
POST /auth/logout
```

#### Response

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### GET /auth/me

Get current user information.

#### Request

```http
GET /auth/me
Authorization: Bearer <token>
```

#### Response

```json
{
  "authenticated": true,
  "user": {
    "id": "user_123",
    "username": "admin",
    "role": "admin",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "lastLogin": "2024-01-15T10:30:00.000Z"
  },
  "method": "jwt"
}
```

---

### POST /auth/change-password

Change the current user's password.

#### Request

```http
POST /auth/change-password
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword456"
}
```

#### Response

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

### GET /auth/users

List all users (admin only).

#### Request

```http
GET /auth/users
Authorization: Bearer <token>
```

#### Response

```json
{
  "success": true,
  "users": [
    {
      "id": "user_123",
      "username": "admin",
      "role": "admin",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "lastLogin": "2024-01-15T10:30:00.000Z",
      "allowedDatabases": []
    }
  ]
}
```

---

### POST /auth/users

Create a new user (admin only).

#### Request

```http
POST /auth/users
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "username": "newuser",
  "password": "securePassword123",
  "role": "read-write"
}
```

#### Response

```json
{
  "success": true,
  "user": {
    "id": "user_789",
    "username": "newuser",
    "role": "read-write",
    "createdAt": "2024-01-16T14:20:00.000Z"
  }
}
```

---

### GET /auth/config

Get public authentication configuration.

#### Request

```http
GET /auth/config
```

#### Response

```json
{
  "enabled": true,
  "methods": {
    "jwt": true,
    "apiKeys": false,
    "basicAuth": false,
    "session": true
  }
}
```

## Health Endpoints

### GET /health

Health check endpoint.

#### Request

```http
GET /health
```

#### Response

```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2026-02-01T12:00:00.000Z"
}
```

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Health status (healthy, degraded, unhealthy) |
| `uptime` | number | Server uptime in seconds |
| `timestamp` | string | ISO 8601 timestamp |

#### Examples

```bash
curl http://localhost:3000/health
```

---

### GET /metrics

API usage metrics.

#### Request

```http
GET /metrics
Authorization: Bearer <token>
```

#### Response

```json
{
  "requests": {
    "total": 1250,
    "successful": 1200,
    "failed": 50
  },
  "queries": {
    "total": 800,
    "selects": 600,
    "modifications": 200
  },
  "performance": {
    "avgResponseTime": 45,
    "p95ResponseTime": 120,
    "p99ResponseTime": 250
  }
}
```

## Error Responses

All errors follow a consistent format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_PARAMETERS` | 400 | Required parameters missing |
| `INVALID_DATABASE` | 400 | Database file not found |
| `AUTH_FAILED` | 401 | Authentication required/failed |
| `INVALID_CREDENTIALS` | 401 | Invalid username/password |
| `AUTHZ_FAILED` | 403 | Insufficient permissions |
| `ADMIN_REQUIRED` | 403 | Admin role required |
| `DATABASE_ERROR` | 500 | SQL execution error |
| `EXECUTION_ERROR` | 500 | Query syntax error |

### Error Examples

```json
{
  "success": false,
  "error": "dbPath and sql are required",
  "code": "MISSING_PARAMETERS"
}
```

```json
{
  "success": false,
  "error": "SQL logic error: no such table: users",
  "code": "DATABASE_ERROR"
}
```

```json
{
  "success": false,
  "error": "Authentication required",
  "code": "AUTH_FAILED"
}
```

## Rate Limiting

When rate limiting is enabled (`RATE_LIMIT_ENABLED=true`), the following limits apply:

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Database operations | 100 requests | 15 minutes |
| Authentication | 10 requests | 15 minutes |
| Health check | No limit | - |

### Rate Limit Response

When rate limit is exceeded:

```json
{
  "success": false,
  "error": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 900
}
```

HTTP Status: 429 Too Many Requests

## Code Examples

### Complete Workflow Example

```typescript
class SQLiteClient {
  private baseUrl: string
  private token?: string

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl
  }

  async login(username: string, password: string) {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })

    const data = await response.json()
    if (data.success) {
      this.token = data.token
    }
    return data
  }

  async query(dbPath: string, sql: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const response = await fetch(`${this.baseUrl}/api/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dbPath, sql })
    })

    return response.json()
  }

  async getTables(dbPath: string) {
    const response = await fetch(`${this.baseUrl}/api/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbPath })
    })

    return response.json()
  }

  async getSchema(dbPath: string, tableName: string) {
    const response = await fetch(`${this.baseUrl}/api/schema`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbPath, tableName })
    })

    return response.json()
  }
}

// Usage
const client = new SQLiteClient()

// Login (if auth is enabled)
await client.login('admin', 'password123')

// List tables
const tables = await client.getTables('/data/users.db')
console.log('Tables:', tables.tables)

// Get schema
const schema = await client.getSchema('/data/users.db', 'users')
console.log('Schema:', schema.columns)

// Query data
const result = await client.query('/data/users.db', 'SELECT * FROM users LIMIT 10')
console.log('Users:', result.rows)
```

### Async/Await Wrapper

```typescript
async function executeQuery(
  dbPath: string,
  sql: string,
  token?: string
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await fetch('http://localhost:3000/api/query', {
      method: 'POST',
      headers,
      body: JSON.stringify({ dbPath, sql })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.error || 'Query failed')
    }

    return data
  } catch (error) {
    console.error('Query error:', error)
    throw error
  }
}

// Usage
try {
  const result = await executeQuery(
    '/data/users.db',
    'SELECT * FROM users WHERE active = 1'
  )
  console.log('Active users:', result.rows)
} catch (error) {
  console.error('Failed to execute query:', error)
}
```

### cURL Scripts

```bash
#!/bin/bash

API_URL="http://localhost:3000"
TOKEN=""

# Login
login() {
  RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$1\", \"password\": \"$2\"}")

  TOKEN=$(echo $RESPONSE | jq -r '.token')
  echo "Logged in. Token: $TOKEN"
}

# Query
query() {
  curl -X POST "$API_URL/api/query" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"dbPath\": \"$1\", \"sql\": \"$2\"}" | jq .
}

# List tables
tables() {
  curl -X POST "$API_URL/api/tables" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"dbPath\": \"$1\"}" | jq .
}

# Get schema
schema() {
  curl -X POST "$API_URL/api/schema" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"dbPath\": \"$1\", \"tableName\": \"$2\"}" | jq .
}

# Usage
# login "admin" "password123"
# query "/data/users.db" "SELECT * FROM users LIMIT 10"
# tables "/data/users.db"
# schema "/data/users.db" "users"
```

### Python Example

```python
import requests
import json

class SQLiteClient:
    def __init__(self, base_url='http://localhost:3000'):
        self.base_url = base_url
        self.token = None

    def login(self, username, password):
        response = requests.post(
            f'{self.base_url}/auth/login',
            json={'username': username, 'password': password}
        )
        data = response.json()
        if data.get('success'):
            self.token = data.get('token')
        return data

    def query(self, db_path, sql):
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        response = requests.post(
            f'{self.base_url}/api/query',
            headers=headers,
            json={'dbPath': db_path, 'sql': sql}
        )
        return response.json()

    def get_tables(self, db_path):
        response = requests.post(
            f'{self.base_url}/api/tables',
            headers={'Content-Type': 'application/json'},
            json={'dbPath': db_path}
        )
        return response.json()

    def get_schema(self, db_path, table_name):
        response = requests.post(
            f'{self.base_url}/api/schema',
            headers={'Content-Type': 'application/json'},
            json={'dbPath': db_path, 'tableName': table_name}
        )
        return response.json()

# Usage
client = SQLiteClient()
client.login('admin', 'password123')

tables = client.get_tables('/data/users.db')
print('Tables:', tables['tables'])

users = client.query('/data/users.db', 'SELECT * FROM users LIMIT 10')
print('Users:', users['rows'])
```

## Additional Resources

- [OpenAPI Specification](../openapi.yaml) - Full OpenAPI 3.0 spec
- [MCP Tools Documentation](../MCP_TOOLS.md) - MCP server tools
- [Troubleshooting Guide](troubleshooting.md) - Common issues and solutions
- [Postman Collection](../postman-collection.json) - Importable API collection
