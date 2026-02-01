#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'node:readline';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import Database from 'better-sqlite3';
const program = new Command();
const configPath = join(homedir(), '.sqlite-mcp-gui.json');

interface Config {
  defaultDb?: string;
  outputFormat?: 'json' | 'csv' | 'table';
  verbose?: boolean;
}

// Load config
function loadConfig(): Config {
  if (existsSync(configPath)) {
    try {
      const data = readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return {};
}

// Save config
function saveConfig(config: Config) {
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error(chalk.red('Failed to save config:'), error);
  }
}

// Open database
function openDatabase(dbPath: string): Database.Database {
  if (!existsSync(dbPath)) {
    console.error(chalk.red(`Error: Database file not found: ${dbPath}`));
    process.exit(1);
  }
  return new Database(dbPath);
}

// Format output as table
function formatAsTable(columns: string[], rows: any[]): string {
  if (rows.length === 0) return '';

  // Calculate column widths
  const colWidths = columns.map((col) => {
    const maxValWidth = rows.reduce((max, row) => {
      const val = String(row[col] ?? 'NULL');
      return Math.max(max, val.length);
    }, col.length);
    return Math.max(col.length, maxValWidth) + 2;
  });

  // Helper to create a row
  const createRow = (values: string[]) => {
    return values.map((val, i) => {
      return val.padEnd(colWidths[i] - 1);
    }).join(' ');
  };

  // Create separator
  const separator = colWidths.map((w) => '-'.repeat(w - 1)).join('-');

  // Build table
  const header = createRow(columns);
  const dataRows = rows.map((row) => createRow(columns.map((col) => String(row[col] ?? 'NULL'))));

  return [chalk.cyan.bold(header), separator, ...dataRows].join('\n');
}

// Format output as CSV
function formatAsCSV(columns: string[], rows: any[]): string {
  const header = columns.join(',');
  const data = rows
    .map((row) =>
      columns
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return String(val);
        })
        .join(',')
    )
    .join('\n');
  return `${header}\n${data}`;
}

// Pretty print JSON
function prettyPrint(data: any, pretty: boolean): string {
  return JSON.stringify(data, null, pretty ? 2 : 0);
}

// Setup CLI
program
  .name('sqlite-mcp')
  .description('SQLite MCP GUI - Command Line Interface')
  .version('1.0.0');

// Global options
program.option('--config <path>', 'Path to config file').option('--verbose', 'Verbose logging');

// Query command
program
  .command('query <db> <sql>')
  .description('Execute a SQL query and display results')
  .option('-p, --pretty', 'Pretty print JSON output')
  .option('-c, --csv', 'Output as CSV')
  .option('-t, --table', 'Output as formatted table')
  .action((dbPath, sql, options) => {
    try {
      const config = loadConfig();
      const db = openDatabase(dbPath);

      if (options.verbose || config.verbose) {
        console.error(chalk.gray(`Executing: ${sql}`));
      }

      const stmt = db.prepare(sql);
      const rows = stmt.all();

      if (options.csv) {
        if (rows.length === 0) {
          console.log('No results');
        } else {
          const columns = Object.keys(rows[0]);
          console.log(formatAsCSV(columns, rows));
        }
      } else if (options.table) {
        if (rows.length === 0) {
          console.log(chalk.yellow('No results'));
        } else {
          const columns = Object.keys(rows[0]);
          console.log(formatAsTable(columns, rows));
        }
      } else {
        console.log(prettyPrint({ success: true, rowCount: rows.length, rows }, options.pretty));
      }

      db.close();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Tables command
program
  .command('tables <db>')
  .description('List all tables in the database')
  .option('-p, --pretty', 'Pretty print JSON output')
  .option('-c, --csv', 'Output as CSV')
  .option('-t, --table', 'Output as formatted table')
  .action((dbPath, options) => {
    try {
      const db = openDatabase(dbPath);
      const stmt = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );
      const tables = stmt.all() as Array<{ name: string }>;

      if (options.csv) {
        console.log('name\n' + tables.map((t) => t.name).join('\n'));
      } else if (options.table) {
        const tableData = tables.map((t) => ({ 'Table Name': t.name }));
        console.log(formatAsTable(['Table Name'], tableData));
      } else {
        console.log(
          prettyPrint(
            {
              success: true,
              database: dbPath,
              tableCount: tables.length,
              tables: tables.map((t) => t.name),
            },
            options.pretty
          )
        );
      }

      db.close();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Schema command
program
  .command('schema <db> <table>')
  .description('Show the schema of a specific table')
  .option('-p, --pretty', 'Pretty print JSON output')
  .option('-c, --csv', 'Output as CSV')
  .option('-t, --table', 'Output as formatted table')
  .action((dbPath, tableName, options) => {
    try {
      const db = openDatabase(dbPath);
      const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
      const columns = stmt.all();

      if (options.csv) {
        if (columns.length === 0) {
          console.log('No columns found');
        } else {
          const colNames = Object.keys(columns[0]);
          console.log(formatAsCSV(colNames, columns));
        }
      } else if (options.table) {
        if (columns.length === 0) {
          console.log(chalk.yellow('No columns found'));
        } else {
          const colNames = Object.keys(columns[0]);
          console.log(formatAsTable(colNames, columns));
        }
      } else {
        console.log(
          prettyPrint(
            {
              success: true,
              table: tableName,
              database: dbPath,
              columnCount: columns.length,
              columns,
            },
            options.pretty
          )
        );
      }

      db.close();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Stats command
program
  .command('stats <db>')
  .description('Show database statistics')
  .option('-p, --pretty', 'Pretty print JSON output')
  .action((dbPath, options) => {
    try {
      const db = openDatabase(dbPath);

      // Get database size
      const stats = db.pragma('page_count', { simple: true });
      const pageSize = db.pragma('page_size', { simple: true });
      const dbSize = stats * pageSize;

      // Get table info
      const tablesStmt = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );
      const tables = tablesStmt.all() as Array<{ name: string }>;

      // Get row counts for each table
      const tableStats: any[] = [];
      for (const table of tables) {
        const countStmt = db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`);
        const { count } = countStmt.get() as { count: number };
        tableStats.push({
          table: table.name,
          rows: count,
        });
      }

      const statsData = {
        success: true,
        database: dbPath,
        size: {
          bytes: dbSize,
          kb: Math.round(dbSize / 1024),
          mb: Math.round(dbSize / (1024 * 1024) * 100) / 100,
        },
        pageCount: stats,
        pageSize: pageSize,
        totalTables: tables.length,
        tables: tableStats,
      };

      console.log(prettyPrint(statsData, options.pretty));

      db.close();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Backup command
program
  .command('backup <db> <output>')
  .description('Create a backup of the database')
  .option('-p, --pretty', 'Pretty print JSON output')
  .action((dbPath, outputPath, options) => {
    try {
      const db = openDatabase(dbPath);

      // Copy the database file
      copyFileSync(dbPath, outputPath);

      const result = {
        success: true,
        message: 'Database backup created successfully',
        source: dbPath,
        destination: outputPath,
        timestamp: new Date().toISOString(),
      };

      console.log(prettyPrint(result, options.pretty));
      console.log(chalk.green(`✓ Backup created: ${outputPath}`));

      db.close();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Export command
program
  .command('export <db> <sql> <output>')
  .description('Export query results to a file')
  .option('-f, --format <format>', 'Output format (csv or json)', 'json')
  .option('-p, --pretty', 'Pretty print JSON output (for JSON format)')
  .action((dbPath, sql, outputPath, options) => {
    try {
      const db = openDatabase(dbPath);
      const stmt = db.prepare(sql);
      const rows = stmt.all();

      let content: string;
      if (options.format === 'csv') {
        if (rows.length === 0) {
          console.log(chalk.yellow('No results to export'));
          db.close();
          return;
        }
        const columns = Object.keys(rows[0]);
        content = formatAsCSV(columns, rows);
      } else {
        content = prettyPrint(rows, options.pretty);
      }

      writeFileSync(outputPath, content);
      console.log(chalk.green(`✓ Exported ${rows.length} rows to ${outputPath}`));

      db.close();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Shell command - Interactive mode
program
  .command('shell <db>')
  .description('Start interactive SQL shell')
  .action((dbPath) => {
    try {
      const db = openDatabase(dbPath);

      console.log(chalk.cyan.bold(`\nSQLite MCP GUI - Interactive Shell`));
      console.log(chalk.gray(`Database: ${dbPath}\n`));
      console.log(chalk.yellow('Type ".help" for commands, ".exit" or ".quit" to exit\n'));

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.green('sqlite> '),
        completer: (line: string) => {
          const commands = ['.tables', '.schema', '.stats', '.help', '.exit', '.quit', '.export'];
          const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .all() as Array<{ name: string }>;
          const tableNames = tables.map((t) => t.name);

          const hits = commands
            .concat(tableNames)
            .filter((cmd) => cmd.startsWith(line));
          return [hits, line];
        },
      });

      // Helper to get all table names
      const getTables = () => {
        const stmt = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        );
        return stmt.all() as Array<{ name: string }>;
      };

      rl.on('line', (line) => {
        const trimmed = line.trim();

        if (!trimmed) {
          rl.prompt();
          return;
        }

        // Handle shell commands
        if (trimmed === '.exit' || trimmed === '.quit') {
          console.log(chalk.cyan('Goodbye!'));
          db.close();
          rl.close();
          process.exit(0);
        }

        if (trimmed === '.help') {
          console.log(chalk.cyan('\nAvailable Commands:'));
          console.log('  .tables              List all tables');
          console.log('  .schema [table]      Show schema (all tables or specific table)');
          console.log('  .stats               Show database statistics');
          console.log('  .export <sql> <file> Export query results to file');
          console.log('  .help                Show this help message');
          console.log('  .exit, .quit         Exit the shell\n');
          console.log(chalk.cyan('SQL Commands:'));
          console.log('  Any valid SQL query (SELECT, INSERT, UPDATE, DELETE, etc.)');
          console.log('  Results will be displayed in a formatted table\n');
          rl.prompt();
          return;
        }

        if (trimmed === '.tables') {
          const tables = getTables();
          if (tables.length === 0) {
            console.log(chalk.yellow('No tables found'));
          } else {
            console.log(chalk.cyan('Tables:'));
            tables.forEach((t) => console.log(`  ${t.name}`));
          }
          rl.prompt();
          return;
        }

        if (trimmed.startsWith('.schema')) {
          const args = trimmed.split(/\s+/);
          const tableName = args[1];

          if (tableName) {
            const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
            const columns = stmt.all();
            if (columns.length === 0) {
              console.log(chalk.yellow(`Table "${tableName}" not found or has no columns`));
            } else {
              console.log(chalk.cyan(`\nSchema for "${tableName}":\n`));
              const colNames = Object.keys(columns[0]);
              console.log(formatAsTable(colNames, columns));
            }
          } else {
            const tables = getTables();
            tables.forEach((t) => {
              const stmt = db.prepare(`PRAGMA table_info(${t.name})`);
              const columns = stmt.all();
              console.log(chalk.cyan(`\nSchema for "${t.name}":\n`));
              const colNames = Object.keys(columns[0]);
              console.log(formatAsTable(colNames, columns));
            });
          }
          rl.prompt();
          return;
        }

        if (trimmed === '.stats') {
          const page_count = db.pragma('page_count', { simple: true });
          const page_size = db.pragma('page_size', { simple: true });
          const tables = getTables();

          console.log(chalk.cyan.bold('\nDatabase Statistics:\n'));
          console.log(`  Database: ${dbPath}`);
          console.log(`  Size: ${Math.round((page_count * page_size) / (1024 * 1024) * 100) / 100} MB`);
          console.log(`  Tables: ${tables.length}`);
          console.log('');

          tables.forEach((t) => {
            const countStmt = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`);
            const { count } = countStmt.get() as { count: number };
            console.log(`  ${chalk.cyan(t.name)}: ${count} rows`);
          });
          console.log('');
          rl.prompt();
          return;
        }

        if (trimmed.startsWith('.export')) {
          const args = trimmed.split(/\s+/);
          if (args.length < 3) {
            console.log(chalk.red('Usage: .export <sql> <output_file>'));
          } else {
            const sql = args.slice(1, -1).join(' ');
            const outputFile = args[args.length - 1];
            try {
              const stmt = db.prepare(sql);
              const rows = stmt.all();
              if (rows.length > 0) {
                const columns = Object.keys(rows[0]);
                const content = formatAsCSV(columns, rows);
                writeFileSync(outputFile, content);
                console.log(chalk.green(`✓ Exported ${rows.length} rows to ${outputFile}`));
              } else {
                console.log(chalk.yellow('No results to export'));
              }
            } catch (err) {
              console.log(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
            }
          }
          rl.prompt();
          return;
        }

        // Execute SQL
        try {
          const upperSql = trimmed.toUpperCase();

          if (upperSql.startsWith('SELECT') || upperSql.startsWith('PRAGMA')) {
            const stmt = db.prepare(trimmed);
            const rows = stmt.all();

            if (rows.length === 0) {
              console.log(chalk.yellow('No results'));
            } else {
              const columns = Object.keys(rows[0]);
              console.log(formatAsTable(columns, rows));
              console.log(chalk.gray(`\n${rows.length} row(s) returned`));
            }
          } else {
            const result = db.exec(trimmed);
            const changesStmt = db.prepare('SELECT changes() as changes');
            const { changes } = changesStmt.get() as { changes: number };
            console.log(chalk.green(`✓ Query executed successfully, ${changes} row(s) affected`));
          }
        } catch (error) {
          console.log(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
        }

        rl.prompt();
      });

      rl.on('close', () => {
        console.log(chalk.cyan('\nGoodbye!'));
        db.close();
        process.exit(0);
      });

      rl.prompt();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Config command
program
  .command('config')
  .description('Manage configuration')
  .option('--set-default-db <path>', 'Set default database path')
  .option('--set-format <format>', 'Set default output format (json, csv, table)')
  .option('--show', 'Show current configuration')
  .action((options) => {
    try {
      const config = loadConfig();

      if (options.setDefaultDb) {
        config.defaultDb = options.setDefaultDb;
        saveConfig(config);
        console.log(chalk.green(`✓ Default database set to: ${options.setDefaultDb}`));
      }

      if (options.setFormat) {
        if (!['json', 'csv', 'table'].includes(options.setFormat)) {
          console.error(chalk.red('Error: Format must be json, csv, or table'));
          process.exit(1);
        }
        config.outputFormat = options.setFormat as 'json' | 'csv' | 'table';
        saveConfig(config);
        console.log(chalk.green(`✓ Default output format set to: ${options.setFormat}`));
      }

      if (options.show || (!options.setDefaultDb && !options.setFormat)) {
        console.log(chalk.cyan('\nCurrent Configuration:\n'));
        console.log(prettyPrint(config, true));
        console.log('');
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Parse arguments
program.parse();
