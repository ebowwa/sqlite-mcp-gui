#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, writeFileSync, readFileSync, statSync, copyFileSync } from 'fs';

// MCP Server implementation for SQLite
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
          {
            name: 'sqlite_export',
            description: 'Export query results to CSV or JSON format',
            inputSchema: {
              type: 'object',
              properties: {
                sql: {
                  type: 'string',
                  description: 'SQL query to export results from',
                },
                format: {
                  type: 'string',
                  enum: ['csv', 'json'],
                  description: 'Export format (csv or json)',
                },
                outputPath: {
                  type: 'string',
                  description: 'Path where the export file will be saved',
                },
              },
              required: ['sql', 'format', 'outputPath'],
            },
          },
          {
            name: 'sqlite_import',
            description: 'Import data from CSV or JSON into a table',
            inputSchema: {
              type: 'object',
              properties: {
                table: {
                  type: 'string',
                  description: 'Target table name for import',
                },
                format: {
                  type: 'string',
                  enum: ['csv', 'json'],
                  description: 'Import format (csv or json)',
                },
                inputPath: {
                  type: 'string',
                  description: 'Path to the file to import',
                },
                createTable: {
                  type: 'boolean',
                  description: 'Create table if it does not exist (default: false)',
                },
              },
              required: ['table', 'format', 'inputPath'],
            },
          },
          {
            name: 'sqlite_backup',
            description: 'Create a backup of the current database',
            inputSchema: {
              type: 'object',
              properties: {
                backupPath: {
                  type: 'string',
                  description: 'Path where the backup will be saved',
                },
              },
              required: ['backupPath'],
            },
          },
          {
            name: 'sqlite_stats',
            description: 'Get database statistics including size, table counts, and row counts',
            inputSchema: {
              type: 'object',
              properties: {
                includeRowCounts: {
                  type: 'boolean',
                  description: 'Include row counts for each table (may be slow for large databases)',
                },
              },
            },
          },
          {
            name: 'sqlite_search',
            description: 'Perform full-text search across all text columns in specified tables',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query string',
                },
                tables: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  description: 'Array of table names to search (empty = all tables)',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results per table (default: 10)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'sqlite_indexes',
            description: 'List all indexes in the database',
            inputSchema: {
              type: 'object',
              properties: {
                tableName: {
                  type: 'string',
                  description: 'Optional table name to filter indexes',
                },
              },
            },
          },
          {
            name: 'sqlite_create_index',
            description: 'Create an index on a table',
            inputSchema: {
              type: 'object',
              properties: {
                indexName: {
                  type: 'string',
                  description: 'Name for the new index',
                },
                tableName: {
                  type: 'string',
                  description: 'Table to create index on',
                },
                columns: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  description: 'Column(s) to index',
                },
                unique: {
                  type: 'boolean',
                  description: 'Create a unique index (default: false)',
                },
              },
              required: ['indexName', 'tableName', 'columns'],
            },
          },
          {
            name: 'sqlite_drop_index',
            description: 'Drop an index from the database',
            inputSchema: {
              type: 'object',
              properties: {
                indexName: {
                  type: 'string',
                  description: 'Name of the index to drop',
                },
              },
              required: ['indexName'],
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

          case 'sqlite_export':
            return await this.handleExport(args as { sql: string; format: 'csv' | 'json'; outputPath: string });

          case 'sqlite_import':
            return await this.handleImport(args as { table: string; format: 'csv' | 'json'; inputPath: string; createTable?: boolean });

          case 'sqlite_backup':
            return await this.handleBackup(args as { backupPath: string });

          case 'sqlite_stats':
            return await this.handleStats(args as { includeRowCounts?: boolean });

          case 'sqlite_search':
            return await this.handleSearch(args as { query: string; tables?: string[]; limit?: number });

          case 'sqlite_indexes':
            return await this.handleIndexes(args as { tableName?: string });

          case 'sqlite_create_index':
            return await this.handleCreateIndex(args as { indexName: string; tableName: string; columns: string[]; unique?: boolean });

          case 'sqlite_drop_index':
            return await this.handleDropIndex(args as { indexName: string });

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

  private async handleExport(args: { sql: string; format: 'csv' | 'json'; outputPath: string }) {
    if (!this.db) {
      throw new Error('Not connected to a database. Use sqlite_connect first.');
    }

    const { sql, format, outputPath } = args;

    // Validate format
    if (!['csv', 'json'].includes(format)) {
      throw new Error('Invalid format. Must be "csv" or "json".');
    }

    // Validate output path
    const outputDir = join(outputPath, '..');
    if (!existsSync(outputDir)) {
      throw new Error('Output directory does not exist.');
    }

    // Execute query
    const stmt = this.db.prepare(sql);
    const rows = stmt.all();

    if (!Array.isArray(rows)) {
      throw new Error('Query must return rows (use SELECT statement).');
    }

    let content: string;

    if (format === 'json') {
      content = JSON.stringify(rows, null, 2);
    } else {
      // CSV format
      if (rows.length === 0) {
        content = '';
      } else {
        const headers = Object.keys(rows[0]);
        const csvRows = [
          headers.join(','),
          ...rows.map((row: any) =>
            headers.map((header) => {
              const value = row[header];
              // Escape quotes and wrap values containing commas or quotes
              if (value === null || value === undefined) return '';
              const strValue = String(value);
              if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                return `"${strValue.replace(/"/g, '""')}"`;
              }
              return strValue;
            }).join(',')
          )
        ];
        content = csvRows.join('\n');
      }
    }

    // Write to file
    writeFileSync(outputPath, content, 'utf-8');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: `Exported ${rows.length} rows to ${outputPath}`,
              format: format,
              rowCount: rows.length,
              outputPath: outputPath,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleImport(args: { table: string; format: 'csv' | 'json'; inputPath: string; createTable?: boolean }) {
    if (!this.db) {
      throw new Error('Not connected to a database. Use sqlite_connect first.');
    }

    const { table, format, inputPath, createTable = false } = args;

    // Validate format
    if (!['csv', 'json'].includes(format)) {
      throw new Error('Invalid format. Must be "csv" or "json".');
    }

    // Validate input path exists
    if (!existsSync(inputPath)) {
      throw new Error('Input file does not exist.');
    }

    // Read file content
    const fileContent = readFileSync(inputPath, 'utf-8');

    let data: any[];

    if (format === 'json') {
      try {
        data = JSON.parse(fileContent);
        if (!Array.isArray(data)) {
          throw new Error('JSON must contain an array of objects.');
        }
      } catch (error) {
        throw new Error(`Invalid JSON file: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // Parse CSV
      const lines = fileContent.trim().split('\n');
      if (lines.length === 0) {
        throw new Error('CSV file is empty.');
      }

      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
      data = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        data.push(row);
      }
    }

    if (data.length === 0) {
      throw new Error('No data to import.');
    }

    // Check if table exists
    const tableCheck = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
    ).get(table);
    const tableExists = !!tableCheck;

    if (!tableExists) {
      if (!createTable) {
        throw new Error(`Table "${table}" does not exist. Set createTable=true to create it.`);
      }

      // Create table from first row
      const firstRow = data[0];
      const columns = Object.keys(firstRow).map((col) => `"${col}" TEXT`).join(', ');
      this.db.exec(`CREATE TABLE "${table}" (${columns})`);
    }

    // Insert data
    const columns = Object.keys(data[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const columnNames = columns.map((col) => `"${col}"`).join(', ');
    const insert = this.db.prepare(`INSERT INTO "${table}" (${columnNames}) VALUES (${placeholders})`);
    const insertMany = this.db.transaction((rows: any[]) => {
      for (const row of rows) {
        insert.run(...columns.map((col) => row[col]));
      }
    });

    insertMany(data);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: `Imported ${data.length} rows into table "${table}"`,
              table: table,
              rowCount: data.length,
              created: !tableExists,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleBackup(args: { backupPath: string }) {
    if (!this.db) {
      throw new Error('Not connected to a database. Use sqlite_connect first.');
    }

    const { backupPath } = args;

    // Validate backup path
    const backupDir = join(backupPath, '..');
    if (!existsSync(backupDir)) {
      throw new Error('Backup directory does not exist.');
    }

    // Close current connection, copy file, and reopen
    this.db.close();
    copyFileSync(this.dbPath, backupPath);
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    // Get file size
    const stats = statSync(backupPath);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: `Database backed up to ${backupPath}`,
              backupPath: backupPath,
              sizeBytes: stats.size,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleStats(args: { includeRowCounts?: boolean }) {
    if (!this.db) {
      throw new Error('Not connected to a database. Use sqlite_connect first.');
    }

    const { includeRowCounts = false } = args;

    // Get database file size
    const stats = statSync(this.dbPath);

    // Get all tables
    const tablesStmt = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tables = tablesStmt.all() as Array<{ name: string }>;

    // Get table counts
    const tableStats: Array<{ name: string; rows?: number }> = tables.map((t) => ({ name: t.name }));

    if (includeRowCounts) {
      for (const table of tableStats) {
        const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`);
        const result = countStmt.get() as { count: number };
        table.rows = result.count;
      }
    }

    // Get index count
    const indexStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
    );
    const indexResult = indexStmt.get() as { count: number };

    // Get database version and settings
    const versionStmt = this.db.prepare('SELECT sqlite_version() as version');
    const versionResult = versionStmt.get() as { version: string };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              database: {
                path: this.dbPath,
                sizeBytes: stats.size,
                sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
                sqliteVersion: versionResult.version,
              },
              tables: {
                count: tables.length,
                details: tableStats,
              },
              indexes: {
                count: indexResult.count,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleSearch(args: { query: string; tables?: string[]; limit?: number }) {
    if (!this.db) {
      throw new Error('Not connected to a database. Use sqlite_connect first.');
    }

    const { query, tables = [], limit = 10 } = args;

    // Validate inputs
    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty.');
    }

    if (limit < 1 || limit > 1000) {
      throw new Error('Limit must be between 1 and 1000.');
    }

    // Get tables to search
    let tablesToSearch: string[] = [];
    if (tables.length > 0) {
      // Validate provided tables exist
      for (const tableName of tables) {
        const exists = this.db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
        ).get(tableName);
        if (exists) {
          tablesToSearch.push(tableName);
        }
      }
    } else {
      // Search all tables
      const allTables = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all() as Array<{ name: string }>;
      tablesToSearch = allTables.map((t) => t.name);
    }

    if (tablesToSearch.length === 0) {
      throw new Error('No valid tables found to search.');
    }

    const results: Array<{ table: string; matches: any[] }> = [];
    const searchPattern = `%${query}%`;

    for (const tableName of tablesToSearch) {
      // Get table schema to identify text columns
      const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
        name: string;
        type: string;
      }>;

      const textColumns = columns.filter((col) =>
        col.type.toLowerCase().includes('text') ||
        col.type.toLowerCase().includes('char') ||
        col.type.toLowerCase().includes('varchar')
      );

      // If no text columns, check all columns
      const columnsToSearch = textColumns.length > 0 ? textColumns : columns;

      // Build WHERE clause with OR conditions
      const whereConditions = columnsToSearch.map((col) => `"${col.name}" LIKE ?`).join(' OR ');
      const params = columnsToSearch.map(() => searchPattern);

      if (whereConditions) {
        const searchStmt = this.db.prepare(
          `SELECT * FROM "${tableName}" WHERE ${whereConditions} LIMIT ?`
        );
        const matches = searchStmt.all(...params, limit) as any[];

        if (matches.length > 0) {
          results.push({
            table: tableName,
            matches: matches,
          });
        }
      }
    }

    // Count total matches
    const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              query: query,
              tablesSearched: tablesToSearch.length,
              tablesFound: results.length,
              totalMatches: totalMatches,
              results: results,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleIndexes(args: { tableName?: string }) {
    if (!this.db) {
      throw new Error('Not connected to a database. Use sqlite_connect first.');
    }

    const { tableName } = args;

    let sql = "SELECT * FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'";
    const params: any[] = [];

    if (tableName) {
      // Validate table exists
      const tableExists = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
      ).get(tableName);

      if (!tableExists) {
        throw new Error(`Table "${tableName}" does not exist.`);
      }

      sql += " AND tbl_name = ?";
      params.push(tableName);
    }

    sql += " ORDER BY tbl_name, name";

    const stmt = this.db.prepare(sql);
    const indexes = stmt.all(...params);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              count: indexes.length,
              indexes: indexes,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleCreateIndex(args: { indexName: string; tableName: string; columns: string[]; unique?: boolean }) {
    if (!this.db) {
      throw new Error('Not connected to a database. Use sqlite_connect first.');
    }

    const { indexName, tableName, columns, unique = false } = args;

    // Validate inputs
    if (!indexName || indexName.trim().length === 0) {
      throw new Error('Index name cannot be empty.');
    }

    if (!tableName || tableName.trim().length === 0) {
      throw new Error('Table name cannot be empty.');
    }

    if (!columns || columns.length === 0) {
      throw new Error('At least one column must be specified.');
    }

    // Validate table exists
    const tableExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
    ).get(tableName);

    if (!tableExists) {
      throw new Error(`Table "${tableName}" does not exist.`);
    }

    // Validate columns exist
    const tableColumns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    const columnNames = tableColumns.map((c) => c.name);

    for (const column of columns) {
      if (!columnNames.includes(column)) {
        throw new Error(`Column "${column}" does not exist in table "${tableName}".`);
      }
    }

    // Check if index already exists
    const existingIndex = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name = ?"
    ).get(indexName);

    if (existingIndex) {
      throw new Error(`Index "${indexName}" already exists.`);
    }

    // Build CREATE INDEX statement
    const columnList = columns.map((col) => `"${col}"`).join(', ');
    const sql = `CREATE ${unique ? 'UNIQUE ' : ''}INDEX "${indexName}" ON "${tableName}" (${columnList})`;

    this.db.exec(sql);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: `Index "${indexName}" created successfully`,
              indexName: indexName,
              table: tableName,
              columns: columns,
              unique: unique,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async handleDropIndex(args: { indexName: string }) {
    if (!this.db) {
      throw new Error('Not connected to a database. Use sqlite_connect first.');
    }

    const { indexName } = args;

    // Validate input
    if (!indexName || indexName.trim().length === 0) {
      throw new Error('Index name cannot be empty.');
    }

    // Check if index exists
    const existingIndex = this.db.prepare(
      "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name = ?"
    ).get(indexName) as { name: string; tbl_name: string } | undefined;

    if (!existingIndex) {
      throw new Error(`Index "${indexName}" does not exist.`);
    }

    // Drop the index
    this.db.exec(`DROP INDEX "${indexName}"`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              message: `Index "${indexName}" dropped successfully`,
              indexName: indexName,
              table: existingIndex.tbl_name,
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('SQLite MCP Server running on stdio');
  }
}

// Start the server
const mcpServer = new SQLiteMCPServer();
mcpServer.run().catch(console.error);
