#!/usr/bin/env node

/**
 * SQLite MCP Server
 *
 * Model Context Protocol server for SQLite database operations.
 *
 * @module server/index
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

  private setupHandlers() {
    // List available tools
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

    // Handle tool calls
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

  private db_changes(): number {
    if (!this.db) return 0;
    const stmt = this.db.prepare('SELECT changes() as changes');
    const result = stmt.get() as { changes: number };
    return result.changes;
  }

  /**
   * Start the MCP server
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('SQLite MCP Server running on stdio');
  }
}

// Start the server
const mcpServer = new SQLiteMCPServer();
mcpServer.run().catch(console.error);
