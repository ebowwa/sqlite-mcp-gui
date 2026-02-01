# SQLite MCP GUI

A modern web-based interface for SQLite databases using the Model Context Protocol (MCP). This project provides both an MCP server for AI agent integration and a beautiful web UI for direct database interaction.

![SQLite MCP GUI](https://img.shields.io/badge/SQLite-MCP%20GUI-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

### Core Functionality
- **Web Interface**: Clean, modern dark-themed UI for database operations
- **MCP Server**: Full Model Context Protocol implementation for AI agent integration
- **Query Execution**: Run SELECT, INSERT, UPDATE, DELETE, and CREATE statements
- **Table Browser**: Visual sidebar with all database tables
- **Schema Inspection**: View table structures and column information
- **Real-time Results**: Instant query result display with row counts
- **CLI Tool**: Full-featured command-line interface

### Advanced Features
- **Authentication System**: JWT, API key, Basic auth, and Session-based auth
- **WebSocket Server**: Real-time query progress, multi-user collaboration
- **Import/Export**: Support for CSV, JSON, SQL dump, and Excel formats
- **Monitoring**: Prometheus metrics, health checks, structured logging
- **Query History**: LocalStorage-persisted query history and saved queries
- **SQL Syntax Highlighting**: Professional CodeMirror editor
- **Result Pagination**: Navigate through large result sets
- **Role-based Access Control**: Admin, read-write, and read-only roles

## Project Structure

```
sqlite-mcp-gui/
├── src/
│   ├── server/
│   │   └── index.ts              # MCP server (312 lines)
│   ├── ui/
│   │   ├── server.ts             # Express web server (full integration)
│   │   ├── import-export-routes.ts # Import/Export API (1035 lines)
│   │   └── public/
│   │       └── index.html        # Single-page web interface (1925 lines)
│   ├── auth/
│   │   ├── types.ts              # Auth type definitions
│   │   ├── auth.config.ts        # Auth configuration
│   │   ├── middleware.ts         # JWT, API key, Basic, Session middleware
│   │   ├── permissions.ts        # Role-based permissions
│   │   ├── users.ts              # User CRUD operations
│   │   ├── routes.ts             # Auth routes (login, logout, users)
│   │   └── index.ts              # Module exports
│   ├── websocket/
│   │   ├── types.ts              # WebSocket message types
│   │   ├── server.ts             # WebSocket server (498 lines)
│   │   ├── index.ts              # Module exports
│   │   └── example.ts            # Usage examples
│   ├── cli/
│   │   └── index.ts              # CLI tool (708 lines)
│   ├── import-export/
│   │   └── import-export.ts      # Import/Export system (1517 lines)
│   └── monitoring/
│       ├── logger.ts             # Structured logging
│       ├── metrics.ts            # Prometheus metrics (370 lines)
│       ├── health.ts             # Health check endpoints (470 lines)
│       ├── middleware.ts         # Request tracking, slow query detection
│       └── index.ts              # Module exports
├── dist/                         # Compiled JavaScript output
├── package.json
├── tsconfig.json
└── README.md
```

## Prerequisites

- **Node.js** v18+ or **Bun** runtime
- **SQLite3** (installed via better-sqlite3 package)
- Package manager: npm, yarn, pnpm, or bun

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd sqlite-mcp-gui
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

## Usage

### Starting the Web UI

```bash
npm run start:ui
```

The server will start on `http://localhost:3000` with full feature integration.

**Default Admin User**: `admin` / `admin123`

1. Open your browser and navigate to `http://localhost:3000`
2. Login with admin credentials or create a new user
3. Enter the path to your SQLite database file (e.g., `./test.db`)
4. Click "Connect" to load the database
5. Browse tables, execute queries, import/export data

### Starting the MCP Server

```bash
npm run start:mcp
```

The server uses stdio transport and exposes the following MCP tools:

- **sqlite_connect**: Connect to a SQLite database
- **sqlite_query**: Execute SELECT/PRAGMA queries
- **sqlite_execute**: Execute INSERT/UPDATE/DELETE/CREATE statements
- **sqlite_tables**: List all tables in the database
- **sqlite_schema**: Get table schema information

### CLI Tool

```bash
npm run cli -- --help
```

**Available Commands**:
- `query <db> <sql>` - Execute SQL queries
- `tables <db>` - List all tables
- `schema <db> <table>` - Show table schema
- `stats <db>` - Database statistics
- `backup <db> <output>` - Create backup
- `export <db> <sql> <output>` - Export results
- `shell <db>` - Interactive SQL shell

### Development Mode

```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `GET /auth/me` - Current user info
- `POST /auth/change-password` - Change password
- `GET /auth/users` - List users (admin)
- `POST /auth/users` - Create user (admin)

### Database Operations
- `POST /api/query` - Execute SQL
- `POST /api/tables` - List tables
- `POST /api/schema` - Table schema

### Import/Export
- `POST /api/import` - Import from CSV/JSON/SQL/Excel
- `POST /api/export` - Export to file
- `GET /api/export/:dbPath` - Download export
- `GET /api/export/:dbPath/all` - Export all tables

### Health & Metrics
- `GET /health` - System health check
- `GET /ready` - Readiness probe
- `GET /metrics` - Prometheus metrics
- `GET /api/metrics/summary` - Metrics summary

### WebSocket
- `WS /ws` - WebSocket connection for real-time updates

## Environment Variables

```bash
# Server
PORT=3000                    # Web server port

# Authentication
ENABLE_AUTH=true             # Enable/disable authentication
JWT_SECRET=your-secret-key   # JWT signing secret
SESSION_SECRET=your-session-secret

# WebSocket
WS_PATH=/ws                  # WebSocket path
ENABLE_WEBSOCKET=true        # Enable/disable WebSocket

# Monitoring
ENABLE_MONITORING=true       # Enable/disable monitoring
```

## CLI Examples

```bash
# Execute a query
npm run cli -- query ./database.db "SELECT * FROM users"

# List tables
npm run cli -- tables ./database.db

# Show schema
npm run cli -- schema ./database.db users

# Database statistics
npm run cli -- stats ./database.db

# Create backup
npm run cli -- backup ./database.db ./backup.db

# Export to CSV
npm run cli -- export ./database.db "SELECT * FROM users" ./export.csv --format csv

# Interactive shell
npm run cli -- shell ./database.db
```

## Security Features

- **bcrypt** password hashing with salt rounds (10)
- **JWT** token authentication with configurable expiration
- **Role-based access control** (admin, read-write, read-only)
- **API key** authentication for programmatic access
- **Session-based** authentication with HttpOnly cookies
- **Password policy** enforcement
- **CORS** ready
- **Input validation** and sanitization

## Monitoring Features

- **Prometheus metrics** for HTTP requests, database queries, errors
- **Health checks** for disk space, memory, CPU, dependencies
- **Structured logging** with correlation IDs
- **Slow query detection** and alerting
- **Request tracking** with response times

## Import/Export Features

- **Formats**: CSV, JSON, SQL dump, Excel
- **Batch processing** for large files
- **Progress tracking** with WebSocket updates
- **Data validation** with custom rules
- **Column mapping** and transformation
- **Error handling** with rollback support

## License

MIT License - feel free to use this project for any purpose.

## Built With

- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite database
- [Model Context Protocol](https://modelcontextprotocol.io/) - AI integration
- [Express](https://expressjs.com/) - Web server
- [WebSocket](https://github.com/websockets/ws) - Real-time communication
- [Prometheus](https://prometheus.io/) - Metrics collection
- [CodeMirror](https://codemirror.net/) - SQL editor
