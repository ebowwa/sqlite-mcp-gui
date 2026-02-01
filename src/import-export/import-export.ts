/**
 * Import/Export Utilities for SQLite Database
 *
 * Supports CSV, JSON, SQL dump, and Excel formats
 *
 * @module import-export
 */

import { readFileSync, writeFileSync, existsSync, createReadStream, createWriteStream } from 'fs';
import { Readable } from 'stream';

/**
 * Supported import/export formats
 */
export type DataFormat = 'csv' | 'json' | 'sql' | 'excel';

/**
 * Progress status for import/export operations
 */
export type ProgressStatus = 'processing' | 'completed' | 'error';

/**
 * Progress information callback
 */
export interface ProgressInfo {
  totalRows: number;
  processedRows: number;
  percentage: number;
  status: ProgressStatus;
  error?: string;
}

/**
 * Column type mapping for SQLite
 */
export type ColumnType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB';

/**
 * Table mapping configuration
 */
export interface TableMapping {
  sourceTable?: string;
  targetTable: string;
  columnMapping?: Record<string, string>; // source -> target
  primaryKey?: string[];
  foreignKeys?: Record<string, { table: string; column: string }>;
}

/**
 * Validation rule
 */
export interface ValidationRule {
  column: string;
  type: 'required' | 'unique' | 'pattern' | 'range' | 'enum';
  pattern?: RegExp;
  min?: number;
  max?: number;
  values?: any[];
  message?: string;
}

/**
 * Import options
 */
export interface ImportOptions {
  /** Data format */
  format: DataFormat;
  /** Target table name */
  tableName?: string;
  /** Number of rows to process per batch */
  batchSize?: number;
  /** Number of rows to skip at start */
  skipRows?: number;
  /** CSV delimiter */
  delimiter?: string;
  /** File encoding */
  encoding?: BufferEncoding;
  /** Create table if not exists */
  createTable?: boolean;
  /** Drop table before import */
  dropTable?: boolean;
  /** Table mapping configuration */
  mapping?: TableMapping;
  /** Validation rules */
  validation?: ValidationRule[];
  /** Progress callback */
  onProgress?: (progress: ProgressInfo) => void;
  /** Continue on error */
  continueOnError?: boolean;
  /** Transform function for each row */
  transform?: (row: Record<string, any>) => Record<string, any>;
}

/**
 * Export options
 */
export interface ExportOptions {
  /** Data format */
  format: DataFormat;
  /** Source table name */
  tableName?: string;
  /** Custom SQL query */
  query?: string;
  /** Number of rows to process per batch */
  batchSize?: number;
  /** CSV delimiter */
  delimiter?: string;
  /** Pretty print JSON */
  pretty?: boolean;
  /** Include schema in export */
  includeSchema?: boolean;
  /** Table mapping configuration */
  mapping?: TableMapping;
  /** Progress callback */
  onProgress?: (progress: ProgressInfo) => void;
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean;
  message: string;
  rowsImported: number;
  tableCreated?: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Export result
 */
export interface ExportResult {
  success: boolean;
  message: string;
  rowsExported: number;
  filePath?: string;
}

/**
 * Database interface
 */
export interface Database {
  prepare(sql: string): Statement;
  exec(sql: string): void;
}

/**
 * Statement interface
 */
export interface Statement {
  run(...params: any[]): RunResult;
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

/**
 * Run result interface
 */
export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Statistics result
 */
export interface ImportExportStats {
  rowCount: number;
  columnCount: number;
  tableSize: number;
}

/**
 * Parse CSV content into records
 */
function parseCSV(content: string, delimiter: string = ','): Record<string, any>[] {
  const lines = content.trim().split('\n');
  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const results: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    const row: Record<string, any> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    results.push(row);
  }

  return results;
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

/**
 * Convert records to CSV string
 */
function stringifyCSV(records: Record<string, any>[], delimiter: string = ','): string {
  if (records.length === 0) {
    return '';
  }

  const headers = Object.keys(records[0]);
  const headerRow = headers.join(delimiter);

  const dataRows = records.map(row =>
    headers.map(h => {
      const val = row[h];
      const strVal = String(val === null || val === undefined ? '' : val);

      if (strVal.includes(delimiter) || strVal.includes('"') || strVal.includes('\n')) {
        return `"${strVal.replace(/"/g, '""')}"`;
      }
      return strVal;
    }).join(delimiter)
  );

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Validate a row against validation rules
 */
function validateRow(
  row: Record<string, any>,
  rules: ValidationRule[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const rule of rules) {
    const value = row[rule.column];

    switch (rule.type) {
      case 'required':
        if (value === null || value === undefined || value === '') {
          errors.push(rule.message || `Column '${rule.column}' is required`);
        }
        break;

      case 'pattern':
        if (value && rule.pattern && !rule.pattern.test(String(value))) {
          errors.push(rule.message || `Column '${rule.column}' does not match pattern`);
        }
        break;

      case 'range':
        if (value !== null && value !== undefined) {
          const num = Number(value);
          if (rule.min !== undefined && num < rule.min) {
            errors.push(rule.message || `Column '${rule.column}' must be >= ${rule.min}`);
          }
          if (rule.max !== undefined && num > rule.max) {
            errors.push(rule.message || `Column '${rule.column}' must be <= ${rule.max}`);
          }
        }
        break;

      case 'enum':
        if (value !== null && value !== undefined && rule.values && !rule.values.includes(value)) {
          errors.push(rule.message || `Column '${rule.column}' must be one of: ${rule.values.join(', ')}`);
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Apply table mapping to a row
 */
function applyMapping(
  row: Record<string, any>,
  mapping: TableMapping
): Record<string, any> {
  const mapped: Record<string, any> = {};

  if (mapping.columnMapping) {
    for (const [source, target] of Object.entries(mapping.columnMapping)) {
      mapped[target] = row[source];
    }
  } else {
    Object.assign(mapped, row);
  }

  return mapped;
}

/**
 * Data importer for various file formats
 */
export class DataImporter {
  private db: Database;
  private options: Required<Omit<ImportOptions, 'onProgress' | 'mapping' | 'validation' | 'transform'>> & {
    onProgress?: (progress: ProgressInfo) => void;
    mapping?: TableMapping;
    validation?: ValidationRule[];
    transform?: (row: Record<string, any>) => Record<string, any>;
  };

  constructor(db: Database, options: ImportOptions) {
    this.db = db;
    this.options = {
      batchSize: 1000,
      skipRows: 0,
      delimiter: ',',
      encoding: 'utf8',
      createTable: false,
      dropTable: false,
      continueOnError: false,
      ...options,
    };
  }

  /**
   * Import data from a file
   */
  async importFromFile(filePath: string): Promise<ImportResult> {
    try {
      if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = readFileSync(filePath, this.options.encoding);

      switch (this.options.format) {
        case 'csv':
          return await this.importFromCSV(content);
        case 'json':
          return await this.importFromJSON(content);
        case 'sql':
          return await this.importFromSQL(content);
        case 'excel':
          return await this.importFromExcel(filePath);
        default:
          throw new Error(`Unsupported format: ${this.options.format}`);
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        rowsImported: 0,
      };
    }
  }

  /**
   * Import data from CSV format
   */
  async importFromCSV(content: string): Promise<ImportResult> {
    const lines = content.trim().split('\n');
    const skipLines = this.options.skipRows || 0;

    if (lines.length <= skipLines) {
      throw new Error('No data found in CSV file');
    }

    let records = parseCSV(content, this.options.delimiter);

    // Skip rows if needed
    if (skipLines > 0) {
      records = records.slice(skipLines);
    }

    if (records.length === 0) {
      throw new Error('No data found in CSV file');
    }

    // Apply mapping if provided
    if (this.options.mapping) {
      records = records.map(row => applyMapping(row, this.options.mapping!));
    }

    // Validate records
    const validationErrors: string[] = [];
    if (this.options.validation) {
      records = records.filter(row => {
        const result = validateRow(row, this.options.validation!);
        if (!result.valid) {
          validationErrors.push(...result.errors);
        }
        return result.valid || this.options.continueOnError;
      });
    }

    // Apply transform if provided
    if (this.options.transform) {
      records = records.map(this.options.transform);
    }

    const tableName = this.options.tableName || 'imported_data';
    const columns = Object.keys(records[0]);

    // Create table if requested
    if (this.options.createTable) {
      this.createTableFromData(tableName, columns, records);
    } else if (this.options.dropTable) {
      this.db.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
      this.createTableFromData(tableName, columns, records);
    }

    // Batch insert
    const batchSize = this.options.batchSize;
    const totalRows = records.length;
    let processedRows = 0;
    const errors: string[] = [];

    this.reportProgress(totalRows, processedRows, 'processing');

    try {
      const insert = this.buildInsertStatement(tableName, columns);
      const insertMany = this.db.prepare(insert);

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        const transaction = (this.db as any).transaction((rows: Record<string, any>[]) => {
          for (const row of rows) {
            try {
              insertMany.run(row);
            } catch (err) {
              if (!this.options.continueOnError) {
                throw err;
              }
              errors.push(err instanceof Error ? err.message : String(err));
            }
          }
        });

        transaction(batch);
        processedRows += batch.length;
        this.reportProgress(totalRows, processedRows, 'processing');
      }

      this.reportProgress(totalRows, totalRows, 'completed');

      const result: ImportResult = {
        success: true,
        message: `Successfully imported ${totalRows} rows into table '${tableName}'`,
        rowsImported: totalRows,
        tableCreated: this.options.createTable || this.options.dropTable,
      };

      if (errors.length > 0) {
        result.errors = errors;
        result.warnings = validationErrors;
      } else if (validationErrors.length > 0) {
        result.warnings = validationErrors;
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.reportProgress(totalRows, processedRows, 'error', errorMsg);
      throw error;
    }
  }

  /**
   * Import data from JSON format
   */
  async importFromJSON(content: string): Promise<ImportResult> {
    let data: any;

    try {
      data = JSON.parse(content);
    } catch (error) {
      throw new Error('Invalid JSON format');
    }

    let records: Record<string, any>[];

    if (Array.isArray(data)) {
      records = data;
    } else if (typeof data === 'object' && data.data && Array.isArray(data.data)) {
      records = data.data;
    } else if (typeof data === 'object') {
      records = [data];
    } else {
      throw new Error('JSON must be an array or object with data array');
    }

    if (records.length === 0) {
      throw new Error('No data found in JSON file');
    }

    // Apply mapping if provided
    if (this.options.mapping) {
      records = records.map(row => applyMapping(row, this.options.mapping!));
    }

    // Validate records
    const validationErrors: string[] = [];
    if (this.options.validation) {
      records = records.filter(row => {
        const result = validateRow(row, this.options.validation!);
        if (!result.valid) {
          validationErrors.push(...result.errors);
        }
        return result.valid || this.options.continueOnError;
      });
    }

    // Apply transform if provided
    if (this.options.transform) {
      records = records.map(this.options.transform);
    }

    const tableName = this.options.tableName || 'imported_data';
    const columns = Object.keys(records[0]);

    if (this.options.createTable) {
      this.createTableFromData(tableName, columns, records);
    } else if (this.options.dropTable) {
      this.db.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
      this.createTableFromData(tableName, columns, records);
    }

    const batchSize = this.options.batchSize;
    const totalRows = records.length;
    let processedRows = 0;
    const errors: string[] = [];

    this.reportProgress(totalRows, processedRows, 'processing');

    try {
      const insert = this.buildInsertStatement(tableName, columns);
      const insertMany = this.db.prepare(insert);

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        const transaction = (this.db as any).transaction((rows: Record<string, any>[]) => {
          for (const row of rows) {
            try {
              insertMany.run(row);
            } catch (err) {
              if (!this.options.continueOnError) {
                throw err;
              }
              errors.push(err instanceof Error ? err.message : String(err));
            }
          }
        });

        transaction(batch);
        processedRows += batch.length;
        this.reportProgress(totalRows, processedRows, 'processing');
      }

      this.reportProgress(totalRows, totalRows, 'completed');

      const result: ImportResult = {
        success: true,
        message: `Successfully imported ${totalRows} rows into table '${tableName}'`,
        rowsImported: totalRows,
        tableCreated: this.options.createTable || this.options.dropTable,
      };

      if (errors.length > 0) {
        result.errors = errors;
        result.warnings = validationErrors;
      } else if (validationErrors.length > 0) {
        result.warnings = validationErrors;
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.reportProgress(totalRows, processedRows, 'error', errorMsg);
      throw error;
    }
  }

  /**
   * Import data from SQL dump format
   */
  async importFromSQL(content: string): Promise<ImportResult> {
    this.reportProgress(1, 0, 'processing');

    try {
      // Execute SQL statements
      this.db.exec(content);
      this.reportProgress(1, 1, 'completed');

      return {
        success: true,
        message: 'Successfully executed SQL statements',
        rowsImported: 0, // SQL dumps don't report row count easily
        tableCreated: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.reportProgress(1, 0, 'error', errorMsg);
      throw error;
    }
  }

  /**
   * Import data from Excel format
   */
  async importFromExcel(filePath: string): Promise<ImportResult> {
    try {
      // Dynamic import of xlsx library
      const XLSX = await import('xlsx').catch(() => null);

      if (!XLSX) {
        throw new Error('Excel support requires xlsx package. Install with: npm install xlsx');
      }

      const workbook = XLSX.readFile(filePath);
      const sheetName = this.options.tableName || workbook.SheetNames[0];

      if (!workbook.Sheets[sheetName]) {
        throw new Error(`Sheet '${sheetName}' not found in Excel file`);
      }

      const worksheet = workbook.Sheets[sheetName];
      let records: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet);

      if (records.length === 0) {
        throw new Error('No data found in Excel file');
      }

      // Apply mapping if provided
      if (this.options.mapping) {
        records = records.map(row => applyMapping(row, this.options.mapping!));
      }

      // Validate records
      const validationErrors: string[] = [];
      if (this.options.validation) {
        records = records.filter(row => {
          const result = validateRow(row, this.options.validation!);
          if (!result.valid) {
            validationErrors.push(...result.errors);
          }
          return result.valid || this.options.continueOnError;
        });
      }

      // Apply transform if provided
      if (this.options.transform) {
        records = records.map(this.options.transform);
      }

      const tableName = this.options.tableName || sheetName;
      const columns = Object.keys(records[0]);

      if (this.options.createTable) {
        this.createTableFromData(tableName, columns, records);
      } else if (this.options.dropTable) {
        this.db.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
        this.createTableFromData(tableName, columns, records);
      }

      const batchSize = this.options.batchSize;
      const totalRows = records.length;
      let processedRows = 0;
      const errors: string[] = [];

      this.reportProgress(totalRows, processedRows, 'processing');

      try {
        const insert = this.buildInsertStatement(tableName, columns);
        const insertMany = this.db.prepare(insert);

        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);

          const transaction = (this.db as any).transaction((rows: Record<string, any>[]) => {
            for (const row of rows) {
              try {
                insertMany.run(row);
              } catch (err) {
                if (!this.options.continueOnError) {
                  throw err;
                }
                errors.push(err instanceof Error ? err.message : String(err));
              }
            }
          });

          transaction(batch);
          processedRows += batch.length;
          this.reportProgress(totalRows, processedRows, 'processing');
        }

        this.reportProgress(totalRows, totalRows, 'completed');

        const result: ImportResult = {
          success: true,
          message: `Successfully imported ${totalRows} rows into table '${tableName}'`,
          rowsImported: totalRows,
          tableCreated: this.options.createTable || this.options.dropTable,
        };

        if (errors.length > 0) {
          result.errors = errors;
          result.warnings = validationErrors;
        } else if (validationErrors.length > 0) {
          result.warnings = validationErrors;
        }

        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.reportProgress(totalRows, processedRows, 'error', errorMsg);
        throw error;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot find module')) {
        throw new Error('Excel support requires xlsx package. Install with: npm install xlsx');
      }
      throw error;
    }
  }

  /**
   * Create table from data
   */
  private createTableFromData(
    tableName: string,
    columns: string[],
    sampleData: Record<string, any>[]
  ): void {
    // Drop table if exists
    this.db.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();

    // Infer column types from sample data
    const columnDefs = columns.map(col => {
      const sampleValues = sampleData.slice(0, 100).map(row => row[col]);
      const type = this.inferColumnType(sampleValues);

      // Add constraints from mapping
      let columnDef = `${col} ${type}`;

      if (this.options.mapping?.primaryKey?.includes(col)) {
        columnDef += ' PRIMARY KEY';
      }

      return columnDef;
    }).join(', ');

    // Add foreign key constraints if specified
    let fkClause = '';
    if (this.options.mapping?.foreignKeys) {
      const fkDefs = Object.entries(this.options.mapping.foreignKeys)
        .filter(([col]) => columns.includes(col))
        .map(([col, ref]) => `, FOREIGN KEY (${col}) REFERENCES ${ref.table}(${ref.column})`)
        .join('');
      fkClause = fkDefs;
    }

    this.db.prepare(`CREATE TABLE ${tableName} (${columnDefs}${fkClause})`).run();
  }

  /**
   * Infer column type from values
   */
  private inferColumnType(values: any[]): ColumnType {
    const nonNullValues = values.filter(
      v => v !== null && v !== undefined && v !== ''
    );

    if (nonNullValues.length === 0) {
      return 'TEXT';
    }

    const allIntegers = nonNullValues.every(v => Number.isInteger(Number(v)));
    const allNumbers = nonNullValues.every(v => !isNaN(Number(v)));

    if (allIntegers) {
      return 'INTEGER';
    }

    if (allNumbers) {
      return 'REAL';
    }

    // Check for boolean
    const allBooleans = nonNullValues.every(
      v => typeof v === 'boolean' || v === 'true' || v === 'false' || v === 1 || v === 0
    );

    if (allBooleans) {
      return 'INTEGER';
    }

    return 'TEXT';
  }

  /**
   * Build INSERT statement
   */
  private buildInsertStatement(tableName: string, columns: string[]): string {
    const placeholders = columns.map(() => '?').join(', ');
    const columnList = columns.join(', ');
    return `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`;
  }

  /**
   * Report progress
   */
  private reportProgress(
    totalRows: number,
    processedRows: number,
    status: ProgressStatus,
    error?: string
  ): void {
    if (this.options.onProgress) {
      this.options.onProgress({
        totalRows,
        processedRows,
        percentage: totalRows > 0 ? Math.round((processedRows / totalRows) * 100) : 100,
        status,
        error,
      });
    }
  }

  /**
   * Rollback import (drop created table)
   */
  rollback(tableName?: string): void {
    const table = tableName || this.options.tableName || 'imported_data';

    if (this.options.createTable || this.options.dropTable) {
      this.db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    }
  }
}

/**
 * Data exporter for various file formats
 */
export class DataExporter {
  private db: Database;
  private options: Required<Omit<ExportOptions, 'onProgress' | 'mapping'>> & {
    onProgress?: (progress: ProgressInfo) => void;
    mapping?: TableMapping;
  };

  constructor(db: Database, options: ExportOptions) {
    this.db = db;
    this.options = {
      batchSize: 1000,
      delimiter: ',',
      pretty: false,
      includeSchema: false,
      ...options,
    };
  }

  /**
   * Export data to a file
   */
  async exportToFile(filePath: string): Promise<ExportResult> {
    try {
      let content: string;

      switch (this.options.format) {
        case 'csv':
          content = await this.exportToCSV();
          break;
        case 'json':
          content = await this.exportToJSON();
          break;
        case 'sql':
          content = await this.exportToSQL();
          break;
        case 'excel':
          return await this.exportToExcel(filePath);
        default:
          throw new Error(`Unsupported format: ${this.options.format}`);
      }

      writeFileSync(filePath, content, 'utf8');

      return {
        success: true,
        message: `Successfully exported data to ${filePath}`,
        rowsExported: this.getRowCount(),
        filePath,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        rowsExported: 0,
      };
    }
  }

  /**
   * Export data to CSV format
   */
  async exportToCSV(): Promise<string> {
    const rows = this.fetchData();

    if (rows.length === 0) {
      return '';
    }

    return stringifyCSV(rows, this.options.delimiter);
  }

  /**
   * Export data to JSON format
   */
  async exportToJSON(): Promise<string> {
    const rows = this.fetchData();

    if (this.options.pretty) {
      return JSON.stringify(rows, null, 2);
    }

    return JSON.stringify(rows);
  }

  /**
   * Export data to SQL dump format
   */
  async exportToSQL(): Promise<string> {
    const lines: string[] = [];

    lines.push('-- SQLite Database Dump');
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push('--');
    lines.push('');

    // Export schema if requested
    if (this.options.includeSchema) {
      const schema = this.exportSchema();
      lines.push(schema);
      lines.push('');
    }

    // Export data
    const rows = this.fetchData();

    if (rows.length > 0) {
      const tableName = this.options.tableName || 'data';
      const columns = Object.keys(rows[0]);

      rows.forEach(row => {
        const values = columns
          .map(col => {
            const val = row[col];

            if (val === null) {
              return 'NULL';
            }

            if (typeof val === 'number') {
              return String(val);
            }

            if (typeof val === 'boolean') {
              return val ? '1' : '0';
            }

            // Escape single quotes
            return `'${String(val).replace(/'/g, "''")}'`;
          })
          .join(', ');

        lines.push(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values});`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Export data to Excel format
   */
  async exportToExcel(filePath: string): Promise<ExportResult> {
    try {
      // Dynamic import of xlsx library
      const XLSX = await import('xlsx').catch(() => null);

      if (!XLSX) {
        throw new Error('Excel support requires xlsx package. Install with: npm install xlsx');
      }

      const rows = this.fetchData();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        this.options.tableName || 'Data'
      );

      XLSX.writeFile(workbook, filePath);

      return {
        success: true,
        message: `Successfully exported data to ${filePath}`,
        rowsExported: rows.length,
        filePath,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot find module')) {
        throw new Error('Excel support requires xlsx package. Install with: npm install xlsx');
      }
      throw error;
    }
  }

  /**
   * Export database schema
   */
  private exportSchema(): string {
    const lines: string[] = [];

    if (this.options.tableName) {
      const sql = this.db
        .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`)
        .get(this.options.tableName) as { sql: string } | undefined;

      if (sql) {
        lines.push('-- Table Schema');
        lines.push(sql.sql);
        lines.push('');
      }
    } else {
      const tables = this.db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
        )
        .all() as { sql: string }[];

      lines.push('-- Table Schemas');
      tables.forEach(table => {
        lines.push(table.sql);
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Fetch data from database
   */
  private fetchData(): Record<string, any>[] {
    let sql: string;

    if (this.options.query) {
      sql = this.options.query;
    } else if (this.options.tableName) {
      sql = `SELECT * FROM ${this.options.tableName}`;
    } else {
      throw new Error('Either query or tableName must be specified');
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all();

    // Apply mapping if provided
    if (this.options.mapping?.columnMapping) {
      return rows.map((row: any) => {
        const mapped: Record<string, any> = {};

        for (const [source, target] of Object.entries(this.options.mapping!.columnMapping!)) {
          mapped[target] = row[source];
        }

        return mapped;
      });
    }

    return rows;
  }

  /**
   * Get row count
   */
  private getRowCount(): number {
    try {
      if (this.options.query) {
        // For custom queries, execute and count
        const rows = this.fetchData();
        return rows.length;
      } else if (this.options.tableName) {
        const stmt = this.db.prepare(
          `SELECT COUNT(*) as count FROM ${this.options.tableName}`
        );
        const result = stmt.get() as { count: number };
        return result.count;
      }

      return 0;
    } catch {
      return 0;
    }
  }
}

/**
 * Get import/export statistics for a table
 */
export function getImportExportStats(
  db: Database,
  tableName: string
): ImportExportStats {
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
  const { count: rowCount } = countStmt.get() as { count: number };

  const pragmaStmt = db.prepare(`PRAGMA table_info(${tableName})`);
  const columns = pragmaStmt.all();

  const tableSize = rowCount * columns.length;

  return {
    rowCount,
    columnCount: columns.length,
    tableSize,
  };
}

/**
 * Stream-based CSV importer for large files
 */
export class StreamingCSVImporter extends DataImporter {
  private stream: Readable;

  constructor(db: Database, stream: Readable, options: ImportOptions) {
    super(db, { ...options, format: 'csv' });
    this.stream = stream;
  }

  /**
   * Import from stream
   */
  async importFromStream(): Promise<ImportResult> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let headers: string[] = [];
      let batchSize = 0;
      const batch: Record<string, any>[] = [];
      let totalRows = 0;
      let processedRows = 0;
      const errors: string[] = [];

      this.stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      this.stream.on('end', async () => {
        try {
          const content = Buffer.concat(chunks).toString(this.options.encoding);
          const lines = content.split('\n');

          if (lines.length === 0) {
            throw new Error('No data found in CSV stream');
          }

          headers = parseCSVLine(lines[0], this.options.delimiter);
          const tableName = this.options.tableName || 'imported_data';

          if (this.options.createTable) {
            // Create table with headers
            const columnDefs = headers.map(h => `${h} TEXT`).join(', ');
            this.db.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
            this.db.prepare(`CREATE TABLE ${tableName} (${columnDefs})`).run();
          }

          const insert = this.buildInsertStatement(tableName, headers);
          const insertMany = this.db.prepare(insert);

          // Process data rows
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = parseCSVLine(lines[i], this.options.delimiter);
            const row: Record<string, any> = {};

            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });

            batch.push(row);
            batchSize++;
            totalRows++;

            if (batchSize >= this.options.batchSize) {
              const transaction = (this.db as any).transaction((rows: Record<string, any>[]) => {
                for (const r of rows) {
                  insertMany.run(r);
                }
              });

              transaction(batch);
              processedRows += batch.length;
              batch.length = 0;
              batchSize = 0;

              this.reportProgress(totalRows, processedRows, 'processing');
            }
          }

          // Insert remaining rows
          if (batch.length > 0) {
            const transaction = (this.db as any).transaction((rows: Record<string, any>[]) => {
              for (const r of rows) {
                insertMany.run(r);
              }
            });

            transaction(batch);
            processedRows += batch.length;
          }

          this.reportProgress(totalRows, processedRows, 'completed');

          resolve({
            success: true,
            message: `Successfully imported ${totalRows} rows into table '${tableName}'`,
            rowsImported: totalRows,
            tableCreated: this.options.createTable,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.reportProgress(totalRows, processedRows, 'error', errorMsg);
          reject(error);
        }
      });

      this.stream.on('error', (error: Error) => {
        reject(error);
      });
    });
  }
}

/**
 * Batch processing utility for large import/export operations
 */
export class BatchProcessor {
  private db: Database;
  private batchSize: number;

  constructor(db: Database, batchSize: number = 1000) {
    this.db = db;
    this.batchSize = batchSize;
  }

  /**
   * Process records in batches
   */
  async processBatch<T, R>(
    records: T[],
    processor: (batch: T[]) => Promise<R[]>
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < records.length; i += this.batchSize) {
      const batch = records.slice(i, i + this.batchSize);
      const batchResults = await processor(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Batch insert with transaction
   */
  batchInsert(tableName: string, records: Record<string, any>[]): number {
    if (records.length === 0) {
      return 0;
    }

    const columns = Object.keys(records[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const columnList = columns.join(', ');
    const insert = `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(insert);

    let inserted = 0;

    const transaction = (this.db as any).transaction((rows: Record<string, any>[]) => {
      for (const row of rows) {
        stmt.run(row);
        inserted++;
      }
    });

    for (let i = 0; i < records.length; i += this.batchSize) {
      const batch = records.slice(i, i + this.batchSize);
      transaction(batch);
    }

    return inserted;
  }

  /**
   * Batch update with transaction
   */
  batchUpdate(
    tableName: string,
    updates: Record<string, any>[],
    conditionColumn: string
  ): number {
    if (updates.length === 0) {
      return 0;
    }

    const columns = Object.keys(updates[0]).filter(c => c !== conditionColumn);
    const setClause = columns.map(c => `${c} = ?`).join(', ');
    const update = `UPDATE ${tableName} SET ${setClause} WHERE ${conditionColumn} = ?`;
    const stmt = this.db.prepare(update);

    let updated = 0;

    const transaction = (this.db as any).transaction((rows: Record<string, any>[]) => {
      for (const row of rows) {
        const values = columns.map(c => row[c]);
        values.push(row[conditionColumn]);
        stmt.run(...values);
        updated++;
      }
    });

    for (let i = 0; i < updates.length; i += this.batchSize) {
      const batch = updates.slice(i, i + this.batchSize);
      transaction(batch);
    }

    return updated;
  }

  /**
   * Batch delete with transaction
   */
  batchDelete(tableName: string, ids: any[], idColumn: string = 'id'): number {
    if (ids.length === 0) {
      return 0;
    }

    const deleteStmt = `DELETE FROM ${tableName} WHERE ${idColumn} = ?`;
    const stmt = this.db.prepare(deleteStmt);

    let deleted = 0;

    const transaction = (this.db as any).transaction((items: any[]) => {
      for (const id of items) {
        stmt.run(id);
        deleted++;
      }
    });

    for (let i = 0; i < ids.length; i += this.batchSize) {
      const batch = ids.slice(i, i + this.batchSize);
      transaction(batch);
    }

    return deleted;
  }
}

/**
 * Validation utilities
 */
export class DataValidator {
  private rules: ValidationRule[];

  constructor(rules: ValidationRule[]) {
    this.rules = rules;
  }

  /**
   * Validate a single record
   */
  validate(record: Record<string, any>): { valid: boolean; errors: string[] } {
    return validateRow(record, this.rules);
  }

  /**
   * Validate multiple records
   */
  validateBatch(records: Record<string, any>): {
    valid: boolean;
    errors: Record<number, string[]>;
  } {
    const errors: Record<number, string[]> = {};
    let valid = true;

    for (let i = 0; i < records.length; i++) {
      const result = validateRow(records[i], this.rules);

      if (!result.valid) {
        errors[i] = result.errors;
        valid = false;
      }
    }

    return { valid, errors };
  }

  /**
   * Add a validation rule
   */
  addRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove a validation rule
   */
  removeRule(column: string): void {
    this.rules = this.rules.filter(r => r.column !== column);
  }

  /**
   * Clear all validation rules
   */
  clearRules(): void {
    this.rules = [];
  }
}

/**
 * Export all tables to individual files
 */
export async function exportAllTables(
  db: Database,
  outputDir: string,
  format: DataFormat,
  options?: Partial<ExportOptions>
): Promise<ExportResult[]> {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all() as { name: string }[];

  const results: ExportResult[] = [];

  for (const table of tables) {
    const exporter = new DataExporter(db, {
      format,
      tableName: table.name,
      ...options,
    });

    const filePath = `${outputDir}/${table.name}.${format === 'excel' ? 'xlsx' : format}`;
    const result = await exporter.exportToFile(filePath);
    results.push(result);
  }

  return results;
}

/**
 * Import multiple files into database
 */
export async function importMultipleFiles(
  db: Database,
  files: { filePath: string; format: DataFormat; tableName?: string }[],
  options?: Partial<ImportOptions>
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];

  for (const file of files) {
    const importer = new DataImporter(db, {
      format: file.format,
      tableName: file.tableName,
      ...options,
    });

    const result = await importer.importFromFile(file.filePath);
    results.push(result);

    if (!result.success && !options?.continueOnError) {
      break;
    }
  }

  return results;
}
