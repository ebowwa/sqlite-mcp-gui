# SQLite MCP GUI

A modern web-based interface for SQLite databases using the Model Context Protocol (MCP). This project provides both an MCP server for AI agent integration and a beautiful web UI for direct database interaction.

![SQLite MCP GUI](https://img.shields.io/badge/SQLite-MCP%20GUI-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Web Interface**: Clean, modern dark-themed UI for database operations
- **MCP Server**: Full Model Context Protocol implementation for AI agent integration
- **Query Execution**: Run SELECT, INSERT, UPDATE, DELETE, and CREATE statements
- **Table Browser**: Visual sidebar with all database tables
- **Schema Inspection**: View table structures and column information
- **Real-time Results**: Instant query result display with row counts
- **Responsive Design**: Mobile-friendly interface (see UI Improvements)

## Project Structure

```
sqlite-mcp-gui/
├── src/
│   ├── server/
│   │   └── index.ts          # MCP server implementation
│   ├── ui/
│   │   ├── server.ts         # Express web server
│   │   └── public/
│   │       └── index.html    # Single-page web interface
│   └── tools/                # Additional MCP tools
├── dist/                     # Compiled JavaScript output
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
   # or
   bun install
   ```

3. **Build the project**:
   ```bash
   npm run build
   # or
   bun run build
   ```

## Usage

### Starting the Web UI

The web interface provides an easy-to-use GUI for database operations:

```bash
npm run start:ui
```

The server will start on `http://localhost:3000` (or the port specified in `PORT` environment variable).

1. Open your browser and navigate to `http://localhost:3000`
2. Enter the path to your SQLite database file (e.g., `./test.db`)
3. Click "Connect" to load the database
4. Browse tables in the sidebar and execute SQL queries

### Starting the MCP Server

The MCP server is designed for integration with AI agents that support the Model Context Protocol:

```bash
npm run start:mcp
```

The server uses stdio transport and exposes the following MCP tools:

- **sqlite_connect**: Connect to a SQLite database
- **sqlite_query**: Execute SELECT/PRAGMA queries
- **sqlite_execute**: Execute INSERT/UPDATE/DELETE/CREATE statements
- **sqlite_tables**: List all tables in the database
- **sqlite_schema**: Get table schema information

### Development Mode

For development with automatic rebuilds:

```bash
npm run watch
```

In a separate terminal, start the UI:

```bash
npm run start:ui
```

## Creating a Test Database

An example database creation script is included for testing:

```bash
node dist/scripts/create-example-db.js
```

This creates an `example.db` file with sample tables:
- **users**: Sample user records
- **products**: Product catalog
- **orders**: Order history

Then connect to `./example.db` in the web UI.

## API Endpoints

The web UI exposes the following REST API endpoints:

### POST /api/query
Execute SQL queries on the connected database.

**Request**:
```json
{
  "dbPath": "/path/to/database.db",
  "sql": "SELECT * FROM users LIMIT 10"
}
```

**Response**:
```json
{
  "success": true,
  "rows": [...],
  "rowCount": 10
}
```

### POST /api/tables
Get a list of all tables in the database.

**Request**:
```json
{
  "dbPath": "/path/to/database.db"
}
```

**Response**:
```json
{
  "success": true,
  "tables": ["users", "products", "orders"]
}
```

### POST /api/schema
Get schema information for a specific table.

**Request**:
```json
{
  "dbPath": "/path/to/database.db",
  "tableName": "users"
}
```

**Response**:
```json
{
  "success": true,
  "table": "users",
  "columns": [...]
}
```

## Environment Variables

- `PORT`: Web server port (default: `3000`)

## Configuration

The TypeScript configuration can be found in `tsconfig.json`:
- Target: ES2022
- Module: ESNext
- Output directory: `./dist`

## Error Handling

The application includes comprehensive error handling:
- **Server-side**: Detailed error messages with HTTP status codes
- **Client-side**: User-friendly error display with color-coded notifications
- **Database errors**: SQLite error messages are properly propagated

## Security Considerations

⚠️ **Important**: This is a development tool. For production use, consider:
- Adding authentication/authorization
- Implementing rate limiting
- Validating and sanitizing user inputs
- Using parameterized queries for user input
- Restricting database file access

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - feel free to use this project for any purpose.

## Acknowledgments

- Built with [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- Uses [Model Context Protocol](https://modelcontextprotocol.io/) SDK
- Web UI powered by [Express](https://expressjs.com/)
