# Troubleshooting Guide

Common issues and solutions for SQLite MCP GUI.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Server Startup Issues](#server-startup-issues)
- [Database Connection Issues](#database-connection-issues)
- [Query Execution Issues](#query-execution-issues)
- [Authentication Issues](#authentication-issues)
- [Performance Issues](#performance-issues)
- [MCP Server Issues](#mcp-server-issues)
- [Web UI Issues](#web-ui-issues)

## Installation Issues

### Problem: Module not found errors

**Error Message:**
```
Error: Cannot find module 'better-sqlite3'
```

**Cause:** Dependencies not installed.

**Solution:**
```bash
npm install
# or
bun install
```

### Problem: Build errors

**Error Message:**
```
TypeError: Unknown file extension ".ts"
```

**Cause:** Project not built.

**Solution:**
```bash
npm run build
```

### Problem: Permission errors

**Error Message:**
```
EACCES: permission denied
```

**Cause:** Insufficient permissions to install packages.

**Solution:**
```bash
# Using sudo (not recommended)
sudo npm install

# Or fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

---

## Server Startup Issues

### Problem: Port already in use

**Error Message:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Cause:** Another process is using port 3000.

**Solutions:**

1. **Kill the existing process:**
   ```bash
   # Find process using port 3000
   lsof -i :3000

   # Kill the process
   kill -9 <PID>
   ```

2. **Use a different port:**
   ```bash
   PORT=3001 npm run start:ui
   ```

### Problem: Server fails to start

**Error Message:**
```
Cannot start server
```

**Cause:** Various issues - missing files, configuration errors, etc.

**Solutions:**

1. **Check if built:**
   ```bash
   ls -la dist/
   ```

2. **Rebuild:**
   ```bash
   rm -rf dist/
   npm run build
   ```

3. **Check Node.js version:**
   ```bash
   node --version  # Should be v18+
   ```

### Problem: Server stops unexpectedly

**Cause:** Unhandled errors or crashes.

**Solutions:**

1. **Run with error logging:**
   ```bash
   node dist/ui/server.js 2>&1 | tee server.log
   ```

2. **Check logs:**
   ```bash
   tail -f server.log
   ```

3. **Use process manager (PM2):**
   ```bash
   npm install -g pm2
   pm2 start dist/ui/server.js --name sqlite-gui
   pm2 logs sqlite-gui
   ```

---

## Database Connection Issues

### Problem: Database file not found

**Error Message:**
```
Error: Unable to open database file: /path/to/database.db
```

**Cause:** File doesn't exist or incorrect path.

**Solutions:**

1. **Check file exists:**
   ```bash
   ls -la /path/to/database.db
   ```

2. **Use absolute path:**
   ```javascript
   dbPath: '/full/path/to/database.db'
   ```

3. **Use relative path from server directory:**
   ```javascript
   dbPath: './data/database.db'
   ```

4. **Create database if needed:**
   ```bash
   touch database.db
   ```

### Problem: Permission denied accessing database

**Error Message:**
```
Error: SQLITEDB_LOCKED or permission denied
```

**Cause:** File permissions issue or database locked.

**Solutions:**

1. **Check permissions:**
   ```bash
   ls -la database.db
   ```

2. **Fix permissions:**
   ```bash
   chmod 664 database.db
   chown $USER:$USER database.db
   ```

3. **Close other connections:**
   - Close other applications using the database
   - Restart the server

### Problem: Database is locked

**Error Message:**
```
SQLITE_LOCKED: database is locked
```

**Cause:** Another process has locked the database.

**Solutions:**

1. **Wait and retry:**
   ```javascript
   async function queryWithRetry(dbPath, sql, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await query(dbPath, sql)
       } catch (error) {
         if (i === maxRetries - 1) throw error
         await new Promise(resolve => setTimeout(resolve, 1000))
       }
     }
   }
   ```

2. **Enable WAL mode (already enabled by default):**
   ```sql
   PRAGMA journal_mode=WAL;
   ```

3. **Check for locking processes:**
   ```bash
   lsof database.db
   ```

---

## Query Execution Issues

### Problem: SQL syntax error

**Error Message:**
```
SQL logic error: near "FROM": syntax error
```

**Cause:** Invalid SQL syntax.

**Solutions:**

1. **Validate SQL syntax:**
   - Use a SQL linter/formatter
   - Test query in SQLite client first

2. **Common SQL mistakes:**
   ```sql
   -- Wrong
   SELCT * FROM users;

   -- Correct
   SELECT * FROM users;
   ```

3. **Escape strings properly:**
   ```javascript
   // Wrong - SQL injection risk
   sql: `SELECT * FROM users WHERE name = '${userName}'`

   // Better - use parameterized queries (when available)
   // For now, escape manually:
   sql: `SELECT * FROM users WHERE name = '${userName.replace(/'/g, "''")}'`
   ```

### Problem: Table doesn't exist

**Error Message:**
```
SQL logic error: no such table: users
```

**Cause:** Table name misspelled or doesn't exist.

**Solutions:**

1. **List available tables:**
   ```bash
   curl -X POST http://localhost:3000/api/tables \
     -H "Content-Type: application/json" \
     -d '{"dbPath": "/path/to/database.db"}'
   ```

2. **Check table name:**
   - Table names are case-insensitive in SQLite
   - Verify spelling

3. **Create table if needed:**
   ```javascript
   await execute('/path/to/database.db', `
     CREATE TABLE IF NOT EXISTS users (
       id INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       email TEXT
     )
   `)
   ```

### Problem: No results returned

**Cause:** Query executed successfully but returned empty results.

**Solutions:**

1. **Verify data exists:**
   ```sql
   SELECT COUNT(*) FROM table_name;
   ```

2. **Check WHERE clause:**
   ```sql
   -- Verify filter conditions
   SELECT * FROM users WHERE active = 1;
   ```

3. **Remove LIMIT:**
   ```sql
   -- Check if LIMIT is filtering results
   SELECT * FROM users;  -- No LIMIT
   ```

### Problem: Query returns too many results

**Cause:** Missing LIMIT clause on large tables.

**Solutions:**

1. **Always use LIMIT:**
   ```sql
   SELECT * FROM users LIMIT 100;
   ```

2. **Add pagination:**
   ```sql
   SELECT * FROM users LIMIT 10 OFFSET 0;   -- Page 1
   SELECT * FROM users LIMIT 10 OFFSET 10;  -- Page 2
   ```

3. **Add specific WHERE conditions:**
   ```sql
   SELECT * FROM users WHERE created_at > '2024-01-01' LIMIT 100;
   ```

---

## Authentication Issues

### Problem: Login fails

**Error Message:**
```
Invalid username or password
```

**Cause:** Incorrect credentials or auth not configured.

**Solutions:**

1. **Check if auth is enabled:**
   ```bash
   curl http://localhost:3000/auth/config
   ```

2. **Reset admin password:**
   - Delete user database file
   - Restart server (will create default admin user)

3. **Create new admin user via CLI:**
   ```bash
   npm run create-user --username admin --password newpass123 --role admin
   ```

### Problem: Token expired

**Error Message:**
```
401 Unauthorized
```

**Cause:** JWT token has expired.

**Solutions:**

1. **Login again to get new token:**
   ```javascript
   const response = await fetch('http://localhost:3000/auth/login', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ username, password })
   })
   ```

2. **Increase token expiration:**
   - Set `JWT_EXPIRES_IN` environment variable
   - Example: `JWT_EXPIRES_IN=7d`

### Problem: Permission denied

**Error Message:**
```
403 Forbidden - Insufficient permissions
```

**Cause:** User role doesn't have required permissions.

**Solutions:**

1. **Check user role:**
   ```bash
   curl http://localhost:3000/auth/me \
     -H "Authorization: Bearer <token>"
   ```

2. **Required permissions:**
   - `admin`: All operations
   - `read-write`: Query and execute
   - `read-only`: Query only

3. **Upgrade user role:**
   - Need admin user to change roles
   - Use `/auth/users` endpoint to update

### Problem: Authentication not working

**Cause:** Auth not enabled or misconfigured.

**Solutions:**

1. **Enable authentication:**
   ```bash
   export AUTH_ENABLED=true
   npm run start:ui
   ```

2. **Check auth configuration:**
   - Verify `AUTH_ENABLED` environment variable
   - Check auth config file exists

---

## Performance Issues

### Problem: Slow queries

**Cause:** Missing indexes, large result sets, unoptimized queries.

**Solutions:**

1. **Add indexes:**
   ```sql
   CREATE INDEX idx_users_email ON users(email);
   CREATE INDEX idx_users_created_at ON users(created_at);
   ```

2. **Use EXPLAIN QUERY PLAN:**
   ```sql
   EXPLAIN QUERY PLAN SELECT * FROM users WHERE email = 'test@example.com';
   ```

3. **Optimize SELECT:**
   ```sql
   -- Instead of
   SELECT * FROM users;

   -- Use
   SELECT id, name FROM users LIMIT 100;
   ```

4. **Use LIMIT:**
   ```sql
   SELECT * FROM large_table LIMIT 1000;
   ```

### Problem: Server high memory usage

**Cause:** Large queries, memory leaks, many connections.

**Solutions:**

1. **Limit query results:**
   ```sql
   SELECT * FROM huge_table LIMIT 10000;
   ```

2. **Close unused connections:**
   ```javascript
   // MCP server maintains one connection
   // Connect to new database closes old one
   ```

3. **Monitor memory:**
   ```bash
   # Check process memory
   ps aux | grep node

   # Use memory profiler
   npm install -g clinic
   clinic doctor -- node dist/ui/server.js
   ```

### Problem: Slow response times

**Cause:** Network latency, slow disk I/O, large payloads.

**Solutions:**

1. **Reduce payload size:**
   - Select specific columns
   - Use LIMIT
   - Paginate results

2. **Enable compression:**
   ```javascript
   import compression from 'compression'
   app.use(compression())
   ```

3. **Use CDN for static assets:**
   - Serve static files via CDN
   - Enable browser caching

---

## MCP Server Issues

### Problem: Claude Desktop can't connect

**Error Message:**
```
MCP server connection failed
```

**Cause:** Incorrect path or configuration.

**Solutions:**

1. **Check claude_desktop_config.json:**
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

2. **Use absolute paths:**
   - Don't use `~` for home directory
   - Use `/Users/username/...` on macOS
   - Use `C:/Users/username/...` on Windows

3. **Restart Claude Desktop:**
   - Fully quit and restart Claude Desktop
   - Check Claude Desktop logs

### Problem: MCP tool not found

**Error Message:**
```
Unknown tool: sqlite_connect
```

**Cause:** Server not running or not loaded properly.

**Solutions:**

1. **Verify server is built:**
   ```bash
   ls -la dist/server/index.js
   ```

2. **Test server manually:**
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/server/index.js
   ```

3. **Check server logs:**
   - Look for startup errors
   - Verify tools are registered

### Problem: MCP server crashes

**Cause:** Unhandled errors in tool execution.

**Solutions:**

1. **Test tool individually:**
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"sqlite_connect","arguments":{"dbPath":"./test.db"}}}' | node dist/server/index.js
   ```

2. **Add error logging:**
   - Check stderr output
   - Enable debug mode if available

3. **Wrap in process manager:**
   ```bash
   pm2 start dist/server/index.js --name sqlite-mcp --auto-restart
   ```

---

## Web UI Issues

### Problem: Page won't load

**Cause:** Server not running or port blocked.

**Solutions:**

1. **Check server is running:**
   ```bash
   curl http://localhost:3000
   ```

2. **Check browser console:**
   - Open Developer Tools (F12)
   - Look for JavaScript errors
   - Check Network tab for failed requests

3. **Clear browser cache:**
   - Ctrl+Shift+Delete (Windows/Linux)
   - Cmd+Shift+Delete (macOS)

### Problem: Queries not executing

**Cause:** JavaScript errors or API issues.

**Solutions:**

1. **Check browser console:**
   ```javascript
   // Look for error messages
   ```

2. **Verify API endpoint:**
   ```bash
   curl -X POST http://localhost:3000/api/query \
     -H "Content-Type: application/json" \
     -d '{"dbPath":"./test.db","sql":"SELECT 1"}'
   ```

3. **Check network requests:**
   - Open Network tab in DevTools
   - Look for failed requests
   - Check request/response payloads

### Problem: Tables not showing

**Cause:** Database connection issue or API error.

**Solutions:**

1. **Verify database path:**
   - Use absolute path
   - Check file exists

2. **Check API response:**
   ```bash
   curl -X POST http://localhost:3000/api/tables \
     -H "Content-Type: application/json" \
     -d '{"dbPath":"./test.db"}'
   ```

3. **Check browser console for errors:**
   - Look for JavaScript exceptions
   - Check for network failures

---

## Getting Help

If none of the solutions above work:

1. **Check logs:**
   ```bash
   # Server logs
   pm2 logs sqlite-gui

   # Or if running directly
   node dist/ui/server.js 2>&1 | tee debug.log
   ```

2. **Enable debug mode:**
   ```bash
   DEBUG=* npm run start:ui
   ```

3. **Check GitHub Issues:**
   - Search for similar issues
   - Create new issue with details

4. **Provide debugging information:**
   - Node.js version: `node --version`
   - OS: `uname -a`
   - Error messages
   - Steps to reproduce
   - Configuration details

---

## Prevention Tips

### Best Practices

1. **Always use LIMIT in queries:**
   ```sql
   SELECT * FROM users LIMIT 1000;
   ```

2. **Backup databases before modifications:**
   ```bash
   cp database.db database.db.backup
   ```

3. **Test queries in SQLite client first:**
   ```bash
   sqlite3 database.db
   ```

4. **Use transactions for multiple operations:**
   ```sql
   BEGIN TRANSACTION;
   -- your operations
   COMMIT;
   ```

5. **Monitor server health:**
   ```bash
   curl http://localhost:3000/health
   ```

6. **Keep dependencies updated:**
   ```bash
   npm update
   npm audit fix
   ```

7. **Use environment variables for configuration:**
   ```bash
   export PORT=3000
   export AUTH_ENABLED=true
   npm run start:ui
   ```
