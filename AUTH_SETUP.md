# Authentication and Authorization Setup Guide

This guide explains how to configure and use the authentication system in SQLite MCP GUI.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [User Management](#user-management)
- [Authentication Methods](#authentication-methods)
- [Authorization](#authorization)
- [API Usage](#api-usage)
- [Security Best Practices](#security-best-practices)

## Overview

The SQLite MCP GUI includes a comprehensive authentication and authorization system with:

- **Multiple Authentication Methods**: JWT tokens, API keys, HTTP Basic Auth, and session cookies
- **Role-Based Access Control (RBAC)**: Admin, read-write, and read-only roles
- **Secure Password Storage**: Bcrypt hashing with configurable policies
- **Flexible User Storage**: In-memory or file-based persistence
- **Optional Authentication**: Can be disabled for development

## Quick Start

### 1. Enable Authentication

Set the `AUTH_ENABLED` environment variable to `true`:

```bash
export AUTH_ENABLED=true
npm run build
npm run start:ui
```

### 2. Create Your First Admin User

When authentication is enabled, a default admin user is automatically created:

- **Username**: `admin`
- **Password**: `admin123`

**IMPORTANT**: Change this password immediately after first login!

### 3. Login

Access the web UI at `http://localhost:3000` and login with the default credentials.

### 4. Change Default Password

After logging in, change the default password using the API:

```bash
curl -X POST http://localhost:3000/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "currentPassword": "admin123",
    "newPassword": "YourSecurePassword123!"
  }'
```

## Configuration

### Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```bash
# Enable/disable authentication
AUTH_ENABLED=true

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=24h

# Session Configuration
SESSION_SECRET=your-super-secret-session-key-change-this
SESSION_MAX_AGE=86400000

# API Key Configuration
API_KEYS_ENABLED=true
API_KEY_HEADER=X-API-Key
DEFAULT_API_KEYS=key1,key2,key3

# Basic Auth Configuration
BASIC_AUTH_ENABLED=false

# User Storage
USERS_FILE_PATH=./users.json

# Password Policy
PASSWORD_MIN_LENGTH=8
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SPECIAL=false
```

### Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_ENABLED` | Enable/disable authentication | `false` |
| `JWT_SECRET` | Secret key for JWT signing | `change-this-secret-in-production` |
| `JWT_EXPIRES_IN` | JWT token expiration time | `24h` |
| `SESSION_SECRET` | Secret for session cookies | `change-this-session-secret-in-production` |
| `SESSION_MAX_AGE` | Session cookie max age (ms) | `86400000` |
| `API_KEYS_ENABLED` | Enable API key authentication | `true` |
| `API_KEY_HEADER` | Header name for API keys | `X-API-Key` |
| `DEFAULT_API_KEYS` | Comma-separated API keys | (empty) |
| `BASIC_AUTH_ENABLED` | Enable HTTP Basic Auth | `false` |
| `USERS_FILE_PATH` | Path to user storage file | (empty = in-memory) |
| `PASSWORD_MIN_LENGTH` | Minimum password length | `8` |
| `PASSWORD_REQUIRE_UPPERCASE` | Require uppercase letters | `true` |
| `PASSWORD_REQUIRE_LOWERCASE` | Require lowercase letters | `true` |
| `PASSWORD_REQUIRE_NUMBERS` | Require numbers | `true` |
| `PASSWORD_REQUIRE_SPECIAL` | Require special characters | `false` |

## User Management

### Creating Users

#### Using the CLI Script

```bash
AUTH_ENABLED=true npm run build
node dist/scripts/create-admin.js
```

Follow the prompts to create a new user.

#### Using the API

```bash
curl -X POST http://localhost:3000/auth/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -d '{
    "username": "newuser",
    "password": "SecurePassword123!",
    "role": "read-write"
  }'
```

### User Roles

| Role | Permissions | Description |
|------|-------------|-------------|
| `admin` | read, write, execute, admin | Full access to all databases and administrative functions |
| `read-write` | read, write, execute | Can read, write, and execute SQL queries on accessible databases |
| `read-only` | read | Can only read data from accessible databases |

### Listing Users

```bash
curl http://localhost:3000/auth/users \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

### Changing Passwords

```bash
curl -X POST http://localhost:3000/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "currentPassword": "oldpassword",
    "newPassword": "newpassword"
  }'
```

## Authentication Methods

### 1. JWT Token Authentication

Include the JWT token in the `Authorization` header:

```bash
curl http://localhost:3000/api/tables \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dbPath": "/path/to/database.db"}'
```

### 2. API Key Authentication

Include the API key in the configured header (default: `X-API-Key`):

```bash
curl http://localhost:3000/api/tables \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dbPath": "/path/to/database.db"}'
```

### 3. HTTP Basic Authentication

Enable Basic Auth by setting `BASIC_AUTH_ENABLED=true`:

```bash
curl http://localhost:3000/api/tables \
  -u "username:password" \
  -H "Content-Type: application/json" \
  -d '{"dbPath": "/path/to/database.db"}'
```

### 4. Session Cookie Authentication

The web UI automatically uses session cookies. After logging in via the web interface, the session cookie is stored and sent with subsequent requests.

## Authorization

### Resource-Level Permissions

Users can be restricted to specific databases:

```typescript
// When creating a user programmatically
const user = await createUser('restricteduser', 'password', 'read-only');
user.allowedDatabases = ['/path/to/allowed.db'];
```

### Action Permissions

Different roles have different action permissions:

| Action | Admin | Read-Write | Read-Only |
|--------|-------|------------|-----------|
| SELECT queries | ✓ | ✓ | ✓ |
| INSERT/UPDATE/DELETE | ✓ | ✓ | ✗ |
| CREATE/ALTER/DROP | ✓ | ✓ | ✗ |
| User management | ✓ | ✗ | ✗ |
| System administration | ✓ | ✗ | ✗ |

## API Usage

### Login Endpoint

**POST** `/auth/login`

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

Response:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_1234567890_abc123",
    "username": "admin",
    "role": "admin"
  }
}
```

### Logout Endpoint

**POST** `/auth/logout`

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Current User

**GET** `/auth/me`

```bash
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Response:
```json
{
  "authenticated": true,
  "user": {
    "id": "user_1234567890_abc123",
    "username": "admin",
    "role": "admin",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "lastLogin": "2024-01-01T12:00:00.000Z"
  },
  "method": "jwt"
}
```

### Auth Configuration

**GET** `/auth/config`

```bash
curl http://localhost:3000/auth/config
```

Response:
```json
{
  "enabled": true,
  "methods": {
    "jwt": true,
    "apiKeys": true,
    "basicAuth": false,
    "session": true
  }
}
```

## Security Best Practices

### 1. Production Deployment

- **Always** enable authentication in production (`AUTH_ENABLED=true`)
- Use strong, random secrets for `JWT_SECRET` and `SESSION_SECRET`
- Use environment variables or a secure vault for secrets
- Enable HTTPS in production
- Change default passwords immediately

### 2. Secret Management

Generate secure secrets:

```bash
# Generate JWT secret (32 bytes, base64 encoded)
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Password Policy

Configure a strong password policy:

```bash
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SPECIAL=true
```

### 4. User Storage

For production, use file-based storage to persist users:

```bash
USERS_FILE_PATH=/var/lib/sqlite-mcp-gui/users.json
```

Ensure the file directory has appropriate permissions:

```bash
sudo mkdir -p /var/lib/sqlite-mcp-gui
sudo chown YOUR_USER:YOUR_GROUP /var/lib/sqlite-mcp-gui
chmod 700 /var/lib/sqlite-mcp-gui
```

### 5. API Keys

- Rotate API keys regularly
- Use different API keys for different applications/services
- Never commit API keys to version control
- Use environment variables for API keys

### 6. Session Security

In production, enable secure cookies:

```bash
NODE_ENV=production
```

This automatically sets:
- `secure: true` (cookies only sent over HTTPS)
- `httpOnly: true` (cookies not accessible via JavaScript)
- `sameSite: 'lax'` (CSRF protection)

### 7. Monitoring and Auditing

- Monitor login attempts for suspicious activity
- Regularly audit user permissions
- Review and remove unused accounts
- Keep authentication logs for security auditing

### 8. Backup and Recovery

Regularly backup the user storage file:

```bash
# Backup users.json
cp /var/lib/sqlite-mcp-gui/users.json /backup/users.json.$(date +%Y%m%d)

# Or use a cron job
0 2 * * * cp /var/lib/sqlite-mcp-gui/users.json /backup/users.json.$(date +\%Y\%m\%d)
```

## Troubleshooting

### Authentication Not Working

1. Check if authentication is enabled:
   ```bash
   curl http://localhost:3000/auth/config
   ```

2. Verify environment variables are set:
   ```bash
   echo $AUTH_ENABLED
   echo $JWT_SECRET
   ```

3. Check server logs for error messages

### Login Fails

1. Verify username and password
2. Check if user exists in the user store
3. Ensure password meets policy requirements

### JWT Token Invalid

1. Check if `JWT_SECRET` matches between token generation and validation
2. Verify token hasn't expired (`JWT_EXPIRES_IN`)
3. Ensure system time is correct

### Permission Denied

1. Check user role has required permissions
2. Verify user has access to the specific database
3. Review resource-level permissions

## Examples

### Example 1: Setup Production Environment

```bash
# 1. Set environment variables
export AUTH_ENABLED=true
export JWT_SECRET=$(openssl rand -base64 32)
export SESSION_SECRET=$(openssl rand -base64 32)
export NODE_ENV=production
export USERS_FILE_PATH=/var/lib/sqlite-mcp-gui/users.json

# 2. Build and start
npm run build
npm run start:ui

# 3. Create admin user
node dist/scripts/create-admin.js

# 4. Login and change password
# (via web UI or API)
```

### Example 2: API-Only Usage

```bash
# Set up API key
export DEFAULT_API_KEYS=sk_live_1234567890abcdef
export AUTH_ENABLED=true

# Use API key in requests
curl http://localhost:3000/api/tables \
  -H "X-API-Key: sk_live_1234567890abcdef" \
  -H "Content-Type: application/json" \
  -d '{"dbPath": "/data/mydb.db"}'
```

### Example 3: Multi-User Setup

```bash
# 1. Create admin user
node dist/scripts/create-admin.js
# Username: admin
# Password: AdminPass123!
# Role: admin

# 2. Create read-write user
curl -X POST http://localhost:3000/auth/users \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "analyst",
    "password": "AnalystPass123!",
    "role": "read-write"
  }'

# 3. Create read-only user
curl -X POST http://localhost:3000/auth/users \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "viewer",
    "password": "ViewerPass123!",
    "role": "read-only"
  }'
```

## Support

For issues or questions about authentication:

1. Check the troubleshooting section above
2. Review server logs for detailed error messages
3. Consult the main README.md for general setup
4. Open an issue on GitHub with detailed information

## License

MIT License - See LICENSE file for details
