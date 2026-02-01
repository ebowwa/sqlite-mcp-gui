#!/usr/bin/env node

/**
 * SQLite MCP Server
 *
 * Model Context Protocol (MCP) server for SQLite database operations.
 * Provides tools for connecting to databases, executing queries, and managing schema.
 *
 * @module server/index
 *
 * @example
 * // Start the MCP server
 * npm run start:mcp
 *
 * @example
 * // Use with Claude Desktop
 * // Add to claude_desktop_config.json:
 * // {
 * //   "mcpServers": {
 * //     "sqlite": {
 * //       "command": "node",
 * //       "args": ["/path/to/dist/server/index.js"]
 * //     }
 * //   }
 * // }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * MCP Server implementation for SQLite
 *
 * Provides 5 tools for database operations:
 * - sqlite_connect: Connect to a database
 * - sqlite_query: Execute SELECT/PRAGMA queries
 * - sqlite_execute: Execute INSERT/UPDATE/DELETE/CREATE/etc
 * - sqlite_tables: List all tables
 * - sqlite_schema: Get table schema
 */
class SQLiteMCPServer {
  private server: Server;
  private db: Database.Database | null = null;
  private dbPath: string = '';

  constructor() {
    this.server = new Server(
      {
        name: 'sqlite-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Setup request handlers for the MCP server.
   *
   * Registers handlers for:
   * - ListToolsRequestSchema: Returns available tools and their schemas
   * - CallToolRequestSchema: Handles tool execution
   */
  private setupHandlers() {
    /**
     * List available MCP tools
     *
     * Returns tool definitions including names, descriptions, and input schemas.
     */
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'sqlite_connect',
            description: 'Connect to a SQLite database file. Creates a new database if it does not exist.',
            inputSchema: {
              type: 'object',
              properties: {
                dbPath: {
                  type: 'string',
                  description: 'Path to the SQLite database file',
                },
              },
              required: ['dbPath'],
            },
          },
          {
            name: 'sqlite_query',
            description: 'Execute a SQL query on the connected database. Returns results as JSON.',
            inputSchema: {
              type: 'object',
              properties: {
                sql: {
                  type: 'string',
                  description: 'SQL query to execute (SELECT statements preferred)',
                },
              },
              required: ['sql'],
            },
          },
          {
            name: 'sqlite_execute',
            description: 'Execute a SQL statement that modifies data (INSERT, UPDATE, DELETE, CREATE, etc.)',
            inputSchema: {
              type: 'object',
              properties: {
                sql: {
                  type: 'string',
                  description: 'SQL statement to execute',
                },
              },
              required: ['sql'],
            },
          },
          {
            name: 'sqlite_tables',
            description: 'List all tables in the current database',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'sqlite_schema',
            description: 'Get the schema (columns and types) for a specific table',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Name of the table to get schema for',
                },
              },
              required: ['tableName'],
            },
          },
        ],
      };
    });

    /**
     * Handle tool execution requests
     *
     * Routes tool calls to appropriate handler methods.
     * All errors are caught and returned as error responses.
     *
     * @param request - The tool call request containing tool name and arguments
     * @returns Tool execution result or error
     */
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'sqlite_connect':
            return await this.handleConnect(args as { dbPath: string });

          case 'sqlite_query':
            return await this.handleQuery(args as { sql: string });

          case 'sqlite_execute':
            return await this.handleExecute(args as { sql: string });

          case 'sqlite_tables':
            return await this.handleTables();

          case 'sqlite_schema':
            return await this.handleSchema(args as { tableName: string });

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: errorMessage }, null, 2),
            },
          ],
        };
      }
    });
  }

  /**
   * Handle sqlite_connect tool call
   *
   * Connects to a SQLite database file. Creates the database if it doesn't exist.
   * Enables WAL (Write-Ahead Logging) mode for better concurrency.
   * Closes any existing database connection before connecting.
   *
   * @param args.dbPath - Path to the SQLite database file
   * @returns Connection success response with database path
   *
   * @example
   * // Connect to database
   * sqlite_connect({ dbPath: '/path/to/database.db' })
   * // Returns: { success: true, message: "Connected to database: ...", path: "..." }
   */
  private async handleConnect(args: { dbPath: string }) {
    const { dbPath } = args;

    // Close existing connection if any
    if (this.db) {
      this.db.close();
    }

    // Create new connection
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: `Connected to database: ${dbPath}`,
              path: dbPath,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle sqlite_query tool call
   *
   * Executes a SELECT or PRAGMA query on the connected database.
   * Only allows read-only queries for safety.
   *
   * @param args.sql - SQL query (must be SELECT or PRAGMA)
   * @returns Query results as JSON with row count
   * @throws {Error} If not connected to database or query type is invalid
   *
   * @example
   * // Execute SELECT query
   * sqlite_query({ sql: 'SELECT * FROM users LIMIT 10' })
   * // Returns: { success: true, rows: [...], rowCount: 10 }
   *
   * @example
   * // Execute PRAGMA query
   * sqlite_query({ sql: 'PRAGMA table_info(users)' })
   * // Returns: { success: true, rows: [...], rowCount: 3 }
   */
  private async handleQuery(args: { sql: string }) {
    if (!this.db) {
      throw new Error('Not connected to a database. Use sqlite_connect first.');
    }

    const { sql } = args;

    // Validate it's a SELECT query
    const trimmedSql = sql.trim().toUpperCase();
    if (!trimmedSql.startsWith('SELECT') && !trimmedSql.startsWith('PRAGMA')) {
      throw new Error('Only SELECT and PRAGMA queries are allowed. Use sqlite_execute for other statements.');
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              rows: rows,
              rowCount: Array.isArray(rows) ? rows.length : 0,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle sqlite_execute tool call
   *
   * Executes a SQL statement that modifies data or schema.
   * Supports INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, etc.
   *
   * @param args.sql - SQL statement to execute
   * @returns Execution result with number of rows affected
   * @throws {Error} If not connected to database
   *
   * @example
   * // Insert data
   * sqlite_execute({ sql: "INSERT INTO users (name) VALUES ('John')" })
   * // Returns: { success: true, message: "...", changes: 1 }
   *
   * @example
   * // Create table
   * sqlite_execute({ sql: 'CREATE TABLE logs (id INTEGER PRIMARY KEY)' })
   * // Returns: { success: true, message: "...", changes: 0 }
   *
   * @example
   * // Update data
   * sqlite_execute({ sql: 'UPDATE users SET active = 1 WHERE id = 5' })
   * // Returns: { success: true, message: "...", changes: 1 }
   */
  private async handleExecute(args: { sql: string }) {
    if (!this.db) {
      throw new Error('Not connected to a database. Use sqlite_connect first.');
    }

    const { sql } = args;
    const result = this.db.exec(sql);

    // For INSERT/UPDATE/DELETE, get changes count
    const changes = this.db_changes();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: 'Statement executed successfully',
              changes: changes,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle sqlite_tables tool call
   *
   * Lists all user-created tables in the database.
   * Excludes SQLite system tables (those starting with 'sqlite_').
   *
   * @returns Array of table names in alphabetical order
   * @throws {Error} If not connected to database
   *
   * @example
   * // List all tables
   * sqlite_tables()
   * // Returns: { success: true, tables: ['users', 'products', 'orders'] }
   */
  private async handleTables() {
    if (!this.db) {
      throw new Error('Not connected to a database. Use sqlite_connect first.');
    }

    const stmt = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tables = stmt.all() as Array<{ name: string }>;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              tables: tables.map((t) => t.name),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Handle sqlite_schema tool call
   *
   * Retrieves schema information for a specific table.
   * Returns column details including name, type, constraints, and primary key status.
   *
   * @param args.tableName - Name of the table to get schema for
   * @returns Table schema with column information
   * @throws {Error} If not connected to database
   *
   * @example
   * // Get table schema
   * sqlite_schema({ tableName: 'users' })
   * // Returns: {
   * //   success: true,
   * //   table: 'users',
   * //   columns: [
   * //     { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
   * //     { cid: 1, name: 'name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 }
   * //   ]
   * // }
   */
  private async handleSchema(args: { tableName: string }) {
    if (!this.db) {
      throw new Error('Not connected to a database. Use sqlite_connect first.');
    }

    const { tableName } = args;

    const stmt = this.db.prepare(`PRAGMA table_info(${tableName})`);
    const columns = stmt.all();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              table: tableName,
              columns: columns,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Get the number of rows affected by the last INSERT/UPDATE/DELETE
   *
   * @returns Number of rows changed, or 0 if no database connection
   *
   * @private
   */
  private db_changes(): number {
    if (!this.db) return 0;
    const stmt = this.db.prepare('SELECT changes() as changes');
    const result = stmt.get() as { changes: number };
    return result.changes;
  }

  /**
   * Start the MCP server.
   *
   * Connects to stdio transport and begins listening for MCP protocol messages.
   * Logs startup message to stderr (which MCP clients ignore).
   *
   * @example
   * // Start the server
   * const server = new SQLiteMCPServer();
   * await server.run();
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('SQLite MCP Server running on stdio');
  }
}

// Start the server
/**
 * Initialize and start the SQLite MCP Server.
 *
 * This is the entry point when running the MCP server from the command line.
 * The server communicates over stdio using the MCP protocol.
 *
 * @example
 * // Run via npm
 * * npm run start:mcp
 *
 * @example
 * // Run directly
 * * node dist/server/index.js
 */
const mcpServer = new SQLiteMCPServer();
mcpServer.run().catch(console.error);
