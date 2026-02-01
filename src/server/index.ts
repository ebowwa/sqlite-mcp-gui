#!/usr/bin/env node
/**
 * Simple SQLite MCP Server
 * Provides MCP tools for SQLite database operations via stdio
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';

// Simple connection manager - one DB at a time
let db: Database.Database | null = null;
let currentDbPath: string | null = null;

// Define MCP tools
const TOOLS: Tool[] = [
  {
    name: 'sqlite_connect',
    description: 'Connect to a SQLite database file (creates if not exists)',
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
    description: 'Execute a SELECT query (read-only)',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'SELECT SQL query to execute',
        },
      },
      required: ['sql'],
    },
  },
  {
    name: 'sqlite_execute',
    description: 'Execute INSERT, UPDATE, DELETE, CREATE, etc. (modifies data)',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'SQL statement to execute (non-SELECT)',
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
    description: 'Get schema information for a specific table',
    inputSchema: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table',
        },
      },
      required: ['tableName'],
    },
  },
];

// Create MCP server
const server = new Server(
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

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'sqlite_connect': {
        const dbPath = args?.dbPath as string;
        if (!dbPath) {
          throw new Error('dbPath is required');
        }

        // Close existing connection if any
        if (db) {
          db.close();
        }

        // Open new database
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        currentDbPath = dbPath;

        return {
          content: [
            {
              type: 'text',
              text: `Connected to database: ${dbPath}`,
            },
          ],
        };
      }

      case 'sqlite_query': {
        if (!db) {
          throw new Error('Not connected to a database. Use sqlite_connect first.');
        }

        const sql = args?.sql as string;
        if (!sql) {
          throw new Error('sql is required');
        }

        // Only allow SELECT and PRAGMA
        const trimmedSql = sql.trim().toUpperCase();
        if (!trimmedSql.startsWith('SELECT') && !trimmedSql.startsWith('PRAGMA')) {
          throw new Error('Only SELECT and PRAGMA queries are allowed. Use sqlite_execute for other statements.');
        }

        const startTime = Date.now();
        const results = db.prepare(sql).all() as Record<string, unknown>[];
        const duration = Date.now() - startTime;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                rows: results.length,
                duration: `${duration}ms`,
                data: results,
              }, null, 2),
            },
          ],
        };
      }

      case 'sqlite_execute': {
        if (!db) {
          throw new Error('Not connected to a database. Use sqlite_connect first.');
        }

        const sql = args?.sql as string;
        if (!sql) {
          throw new Error('sql is required');
        }

        // Don't allow SELECT in execute
        const trimmedSql = sql.trim().toUpperCase();
        if (trimmedSql.startsWith('SELECT')) {
          throw new Error('SELECT queries not allowed in execute. Use sqlite_query instead.');
        }

        const startTime = Date.now();
        const result = db.prepare(sql).run();
        const duration = Date.now() - startTime;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                changes: result.changes,
                lastInsertRowid: result.lastInsertRowid,
                duration: `${duration}ms`,
              }, null, 2),
            },
          ],
        };
      }

      case 'sqlite_tables': {
        if (!db) {
          throw new Error('Not connected to a database. Use sqlite_connect first.');
        }

        const tables = db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
          )
          .all() as { name: string }[];

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                database: currentDbPath,
                count: tables.length,
                tables: tables.map((t) => t.name),
              }, null, 2),
            },
          ],
        };
      }

      case 'sqlite_schema': {
        if (!db) {
          throw new Error('Not connected to a database. Use sqlite_connect first.');
        }

        const tableName = args?.tableName as string;
        if (!tableName) {
          throw new Error('tableName is required');
        }

        const pragma = db.pragma(`table_info(${tableName})`) as Array<{
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: unknown;
          pk: number;
        }>;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                table: tableName,
                columns: pragma.map((col) => ({
                  name: col.name,
                  type: col.type,
                  nullable: col.notnull === 0,
                  primaryKey: col.pk > 0,
                  defaultValue: col.dflt_value,
                })),
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now listening on stdio
}

// Cleanup on exit
process.on('SIGINT', () => {
  if (db) {
    db.close();
  }
  process.exit(0);
});

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
