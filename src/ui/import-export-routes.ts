/**
 * Import/Export API Routes
 *
 * Provides endpoints for importing and exporting data in various formats:
 * - CSV, JSON, SQL dump, Excel (XLSX)
 *
 * Endpoints:
 * - POST /api/import - Import data from various formats
 * - POST /api/export - Export data to various formats
 * - GET /api/import/status/:id - Get import operation status
 * - GET /api/export/formats - List supported export formats
 * - POST /api/import/validate - Validate import data
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  DataImporter,
  DataExporter,
  DataValidator,
  type DataFormat,
  type ImportOptions,
  type ExportOptions,
  type ImportResult,
  type ExportResult,
  type ProgressInfo,
  type ValidationRule,
  type TableMapping,
  getImportExportStats,
} from '../import-export/import-export.js';
import {
  authenticate,
  requireWritePermission,
  requireReadPermission,
  type AuthenticatedRequest,
} from '../auth/middleware.js';

const router = Router();

/**
 * In-memory store for import operation status
 * In production, this should be replaced with a proper cache/database
 */
interface ImportOperation {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: ProgressInfo;
  result?: ImportResult;
  createdAt: Date;
  completedAt?: Date;
  userId?: string;
  dbPath?: string;
}

const importOperations = new Map<string, ImportOperation>();

/**
 * Supported formats for import and export
 */
const SUPPORTED_FORMATS: DataFormat[] = ['csv', 'json', 'sql', 'excel'];

/**
 * Helper function to get database instance from dbPath
 */
async function getDatabase(dbPath: string) {
  const Database = (await import('better-sqlite3')).default;
  return new Database(dbPath);
}

/**
 * Helper function to clean up temp files
 */
async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore cleanup errors
    console.warn(`Failed to cleanup temp file: ${filePath}`);
  }
}

/**
 * POST /api/import
 *
 * Import data from CSV, JSON, SQL, or Excel files
 *
 * Request body (JSON):
 * {
 *   "file": "base64_encoded_file_content",
 *   "dbPath": "/path/to/database.db",
 *   "format": "csv",
 *   "tableName": "my_table",
 *   "createTable": false,
 *   "dropTable": false,
 *   "batchSize": 1000,
 *   "skipRows": 0,
 *   "delimiter": ",",
 *   "encoding": "utf8",
 *   "continueOnError": false,
 *   "mapping": { ... },
 *   "validation": [ ... ]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "operationId": "uuid",
 *   "message": "Import operation started",
 *   "status": "processing"
 * }
 */
router.post(
  '/import',
  authenticate as any,
  requireWritePermission as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const operationId = randomUUID();
    let tempFilePath: string | null = null;

    try {
      // Parse request body
      const {
        file,
        dbPath,
        format,
        tableName,
        createTable = false,
        dropTable = false,
        batchSize = 1000,
        skipRows = 0,
        delimiter = ',',
        encoding = 'utf8',
        continueOnError = false,
        mapping,
        validation,
      } = req.body;

      // Validate required fields
      if (!file) {
        res.status(400).json({
          success: false,
          error: 'file is required (base64 encoded content)',
        });
        return;
      }

      if (!dbPath) {
        res.status(400).json({
          success: false,
          error: 'dbPath is required',
        });
        return;
      }

      if (!format) {
        res.status(400).json({
          success: false,
          error: 'format is required',
        });
        return;
      }

      if (!SUPPORTED_FORMATS.includes(format as DataFormat)) {
        res.status(400).json({
          success: false,
          error: `Unsupported format: ${format}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
        });
        return;
      }

      // Decode base64 file content
      let fileBuffer: Buffer;
      try {
        fileBuffer = Buffer.from(file, 'base64');
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Invalid base64 encoded file content',
        });
        return;
      }

      // Save uploaded file to temp location
      tempFilePath = join(tmpdir(), `import-${operationId}`);
      await fs.writeFile(tempFilePath, fileBuffer);

      // Initialize operation status
      const operation: ImportOperation = {
        id: operationId,
        status: 'pending',
        progress: {
          totalRows: 0,
          processedRows: 0,
          percentage: 0,
          status: 'processing',
        },
        createdAt: new Date(),
        userId: req.auth?.user.id,
        dbPath,
      };

      importOperations.set(operationId, operation);

      // Start import process asynchronously
      processImportAsync({
        operationId,
        dbPath,
        format: format as DataFormat,
        filePath: tempFilePath,
        tableName,
        createTable,
        dropTable,
        batchSize,
        skipRows,
        delimiter,
        encoding,
        continueOnError,
        mapping,
        validation,
        userId: req.auth?.user.id,
      });

      // Respond immediately with operation ID
      res.status(202).json({
        success: true,
        operationId,
        message: 'Import operation started',
        status: 'processing',
      });
    } catch (error) {
      // Clean up temp file on error
      if (tempFilePath) {
        await cleanupTempFile(tempFilePath);
      }

      // Update operation status to error
      const operation = importOperations.get(operationId);
      if (operation) {
        operation.status = 'error';
        operation.progress.status = 'error';
        operation.progress.error = error instanceof Error ? error.message : String(error);
        operation.completedAt = new Date();
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start import operation',
      });
    }
  }
);

/**
 * Async function to process import operation
 */
async function processImportAsync(options: {
  operationId: string;
  dbPath: string;
  format: DataFormat;
  filePath: string;
  tableName?: string;
  createTable?: boolean;
  dropTable?: boolean;
  batchSize?: number;
  skipRows?: number;
  delimiter?: string;
  encoding?: BufferEncoding;
  continueOnError?: boolean;
  mapping?: TableMapping;
  validation?: ValidationRule[];
  userId?: string;
}): Promise<void> {
  const {
    operationId,
    dbPath,
    format,
    filePath,
    tableName,
    createTable,
    dropTable,
    batchSize,
    skipRows,
    delimiter,
    encoding,
    continueOnError,
    mapping,
    validation,
    userId,
  } = options;

  try {
    const operation = importOperations.get(operationId);
    if (!operation) {
      throw new Error('Operation not found');
    }

    operation.status = 'processing';

    // Get database instance
    const db = await getDatabase(dbPath);

    // Create importer with options
    const importOptions: ImportOptions = {
      format,
      tableName,
      createTable,
      dropTable,
      batchSize,
      skipRows,
      delimiter,
      encoding,
      continueOnError,
      mapping,
      validation,
      onProgress: (progress: ProgressInfo) => {
        operation.progress = progress;
      },
    };

    const importer = new DataImporter(db, importOptions);

    // Execute import
    const result = await importer.importFromFile(filePath);

    // Close database
    db.close();

    // Update operation status
    operation.status = 'completed';
    operation.progress = {
      totalRows: result.rowsImported,
      processedRows: result.rowsImported,
      percentage: 100,
      status: 'completed',
    };
    operation.result = result;
    operation.completedAt = new Date();

    // Clean up temp file
    await cleanupTempFile(filePath);
  } catch (error) {
    const operation = importOperations.get(operationId);
    if (operation) {
      operation.status = 'error';
      operation.progress.status = 'error';
      operation.progress.error = error instanceof Error ? error.message : String(error);
      operation.completedAt = new Date();
    }

    // Clean up temp file
    await cleanupTempFile(filePath);
  }
}

/**
 * GET /api/import/status/:id
 *
 * Get the status of an import operation
 *
 * Response:
 * {
 *   "success": true,
 *   "operation": {
 *     "id": "uuid",
 *     "status": "processing",
 *     "progress": { ... },
 *     "result": { ... },
 *     "createdAt": "2024-01-01T00:00:00.000Z",
 *     "completedAt": "2024-01-01T00:00:10.000Z"
 *   }
 * }
 */
router.get(
  '/import/status/:id',
  authenticate as any,
  requireReadPermission as any,
  (req: AuthenticatedRequest, res: Response): void => {
    const { id } = req.params;

    const operation = importOperations.get(id);

    if (!operation) {
      res.status(404).json({
        success: false,
        error: 'Import operation not found',
      });
      return;
    }

    res.json({
      success: true,
      operation: {
        id: operation.id,
        status: operation.status,
        progress: operation.progress,
        result: operation.result,
        createdAt: operation.createdAt,
        completedAt: operation.completedAt,
      },
    });
  }
);

/**
 * POST /api/export
 *
 * Export data to CSV, JSON, SQL, or Excel format
 *
 * Request body:
 * {
 *   "dbPath": "/path/to/database.db",
 *   "format": "csv",
 *   "tableName": "my_table",
 *   "query": "SELECT * FROM my_table WHERE ...",
 *   "delimiter": ",",
 *   "pretty": false,
 *   "includeSchema": false,
 *   "mapping": { ... }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Export completed",
 *   "rowsExported": 1000,
 *   "filePath": "/path/to/exported/file.csv",
 *   "downloadUrl": "/api/export/download/uuid"
 * }
 *
 * Or for direct download (when download=true):
 * - File download with appropriate Content-Type header
 */
router.post(
  '/export',
  authenticate as any,
  requireReadPermission as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const exportId = randomUUID();
    let db: any = null;

    try {
      const {
        dbPath,
        format,
        tableName,
        query,
        delimiter = ',',
        pretty = false,
        includeSchema = false,
        mapping,
        download = false,
        filename,
      } = req.body;

      // Validate required fields
      if (!dbPath) {
        res.status(400).json({
          success: false,
          error: 'dbPath is required',
        });
        return;
      }

      if (!format) {
        res.status(400).json({
          success: false,
          error: 'format is required',
        });
        return;
      }

      if (!SUPPORTED_FORMATS.includes(format as DataFormat)) {
        res.status(400).json({
          success: false,
          error: `Unsupported format: ${format}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
        });
        return;
      }

      if (!tableName && !query) {
        res.status(400).json({
          success: false,
          error: 'Either tableName or query must be specified',
        });
        return;
      }

      // Get database instance
      db = await getDatabase(dbPath);

      // Create exporter with options
      const exportOptions: ExportOptions = {
        format: format as DataFormat,
        tableName,
        query,
        delimiter,
        pretty,
        includeSchema,
        mapping,
        batchSize: 10000,
      };

      const exporter = new DataExporter(db, exportOptions);

      // Generate output filename
      const defaultFilename = filename || `${tableName || 'export'}-${Date.now()}.${format === 'excel' ? 'xlsx' : format}`;
      const outputPath = join(tmpdir(), `export-${exportId}-${defaultFilename}`);

      // Execute export
      const result = await exporter.exportToFile(outputPath);

      // Close database
      db.close();
      db = null;

      if (!result.success) {
        res.status(500).json({
          success: false,
          error: result.message,
        });
        return;
      }

      // If download requested, stream the file
      if (download) {
        const fileContent = await fs.readFile(outputPath);

        // Set appropriate content type
        const contentTypes: Record<DataFormat, string> = {
          csv: 'text/csv',
          json: 'application/json',
          sql: 'application/sql',
          excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };

        res.setHeader('Content-Type', contentTypes[format as DataFormat]);
        res.setHeader('Content-Disposition', `attachment; filename="${defaultFilename}"`);
        res.send(fileContent);

        // Clean up temp file after sending
        cleanupTempFile(outputPath).catch(() => {});
      } else {
        // Return file info
        res.json({
          success: true,
          message: result.message,
          rowsExported: result.rowsExported,
          filePath: outputPath,
          filename: defaultFilename,
          downloadUrl: `/api/export/download/${exportId}`,
        });
      }
    } catch (error) {
      // Close database if open
      if (db) {
        try {
          db.close();
        } catch (e) {
          // Ignore close errors
        }
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Export operation failed',
      });
    }
  }
);

/**
 * GET /api/export/download/:id
 *
 * Download a previously exported file
 *
 * Note: This is a placeholder for a download endpoint.
 * In a real implementation, you'd need to track export files
 * and provide secure download access.
 */
router.get(
  '/export/download/:id',
  authenticate as any,
  requireReadPermission as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    // In production, this would look up the file from a secure store
    // For now, return 404 as we don't persist export file references
    res.status(404).json({
      success: false,
      error: 'Export file not found or has expired',
    });
  }
);

/**
 * GET /api/export/formats
 *
 * List supported export formats
 *
 * Response:
 * {
 *   "success": true,
 *   "formats": [
 *     { "name": "csv", "extension": "csv", "description": "Comma-separated values" },
 *     { "name": "json", "extension": "json", "description": "JSON format" },
 *     { "name": "sql", "extension": "sql", "description": "SQL dump" },
 *     { "name": "excel", "extension": "xlsx", "description": "Excel spreadsheet" }
 *   ]
 * }
 */
router.get('/export/formats', (req: Request, res: Response): void => {
  const formats = SUPPORTED_FORMATS.map((format) => ({
    name: format,
    extension: format === 'excel' ? 'xlsx' : format,
    description: {
      csv: 'Comma-separated values',
      json: 'JSON format',
      sql: 'SQL dump with INSERT statements',
      excel: 'Excel spreadsheet (requires xlsx package)',
    }[format],
  }));

  res.json({
    success: true,
    formats,
  });
});

/**
 * POST /api/import/validate
 *
 * Validate import data before actual import
 *
 * Request body:
 * {
 *   "dbPath": "/path/to/database.db",
 *   "format": "csv",
 *   "data": "base64_encoded_file_content",
 *   "tableName": "my_table",
 *   "validation": [ ... ],
 *   "sampleRows": 100
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "valid": true,
 *   "errors": [],
 *   "warnings": [],
 *   "sampleData": [ ... ],
 *   "columns": [ ... ],
 *   "rowCount": 1000
 * }
 */
router.post(
  '/import/validate',
  authenticate as any,
  requireReadPermission as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    let tempFilePath: string | null = null;
    let db: any = null;

    try {
      const {
        dbPath,
        format,
        data,
        tableName,
        validation: validationJson,
        sampleRows = 100,
      } = req.body;

      // Validate required fields
      if (!format) {
        res.status(400).json({
          success: false,
          error: 'format is required',
        });
        return;
      }

      if (!data) {
        res.status(400).json({
          success: false,
          error: 'data is required',
        });
        return;
      }

      if (!SUPPORTED_FORMATS.includes(format as DataFormat)) {
        res.status(400).json({
          success: false,
          error: `Unsupported format: ${format}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
        });
        return;
      }

      // Parse validation rules if provided
      let validation: ValidationRule[] | undefined;
      if (validationJson) {
        try {
          validation = JSON.parse(validationJson);
        } catch (error) {
          res.status(400).json({
            success: false,
            error: 'Invalid validation JSON',
          });
          return;
        }
      }

      // Decode and save data to temp file
      const buffer = Buffer.from(data, 'base64');
      tempFilePath = join(tmpdir(), `validate-${randomUUID()}`);
      await fs.writeFile(tempFilePath, buffer);

      // Get database instance if dbPath provided
      let targetDb: any = null;
      if (dbPath) {
        targetDb = await getDatabase(dbPath);
        db = targetDb;
      }

      // Create importer to parse and validate data
      const importOptions: ImportOptions = {
        format: format as DataFormat,
        tableName,
        createTable: false,
        dropTable: false,
        batchSize: sampleRows,
        validation,
      };

      const importer = new DataImporter(targetDb || { prepare: () => ({ run: () => {} }), exec: () => {} } as any, importOptions);

      // Read and parse file content
      const fileContent = await fs.readFile(tempFilePath, 'utf8');

      let records: Record<string, any>[] = [];

      // Parse based on format
      switch (format as DataFormat) {
        case 'csv':
          // Simple CSV parsing for validation
          const lines = fileContent.trim().split('\n');
          if (lines.length > 1) {
            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            records = lines.slice(1, sampleRows + 1).map(line => {
              const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
              const row: Record<string, any> = {};
              headers.forEach((h, i) => {
                row[h] = values[i] || '';
              });
              return row;
            });
          }
          break;

        case 'json':
          try {
            const jsonData = JSON.parse(fileContent);
            records = Array.isArray(jsonData) ? jsonData.slice(0, sampleRows) : [jsonData];
          } catch (error) {
            res.status(400).json({
              success: false,
              error: 'Invalid JSON format',
            });
            return;
          }
          break;

        case 'sql':
          // SQL validation - just check if it's valid SQL
          records = [{ _sql: fileContent.substring(0, 100) + '...' }];
          break;

        case 'excel':
          // Excel validation requires xlsx package
          try {
            const XLSX = await import('xlsx');
            const workbook = XLSX.readFile(tempFilePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            records = XLSX.utils.sheet_to_json(worksheet).slice(0, sampleRows);
          } catch (error) {
            res.status(400).json({
              success: false,
              error: 'Excel support requires xlsx package',
            });
            return;
          }
          break;
      }

      // Get columns from records
      const columns = records.length > 0 ? Object.keys(records[0]) : [];

      // Validate records if rules provided
      const errors: string[] = [];
      const warnings: string[] = [];
      let valid = true;

      if (validation && validation.length > 0 && records.length > 0) {
        const validator = new DataValidator(validation);

        for (let i = 0; i < records.length; i++) {
          const result = validator.validate(records[i]);
          if (!result.valid) {
            valid = false;
            errors.push(`Row ${i + 1}: ${result.errors.join(', ')}`);
          }
        }
      }

      // Estimate total row count
      const fileStats = await fs.stat(tempFilePath);
      const avgRowSize = fileContent.length / (records.length || 1);
      const estimatedRowCount = Math.floor(fileStats.size / avgRowSize);

      // Close database if opened
      if (db) {
        db.close();
      }

      res.json({
        success: true,
        valid,
        errors,
        warnings,
        sampleData: records.slice(0, 10), // Return only first 10 rows as sample
        columns,
        rowCount: estimatedRowCount,
        sampleRows: records.length,
      });
    } catch (error) {
      // Close database if open
      if (db) {
        try {
          db.close();
        } catch (e) {
          // Ignore close errors
        }
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      });
    } finally {
      // Clean up temp file
      if (tempFilePath) {
        await cleanupTempFile(tempFilePath);
      }
    }
  }
);

/**
 * GET /api/import/stats
 *
 * Get import/export statistics for a table
 *
 * Query parameters:
 * - dbPath: Path to the SQLite database
 * - tableName: Name of the table
 *
 * Response:
 * {
 *   "success": true,
 *   "stats": {
 *     "rowCount": 1000,
 *     "columnCount": 10,
 *     "tableSize": 10000
 *   }
 * }
 */
router.get(
  '/import/stats',
  authenticate as any,
  requireReadPermission as any,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    let db: any = null;

    try {
      const { dbPath, tableName } = req.query;

      if (!dbPath || !tableName) {
        res.status(400).json({
          success: false,
          error: 'dbPath and tableName are required',
        });
        return;
      }

      // Get database instance
      db = await getDatabase(dbPath as string);

      // Get statistics
      const stats = getImportExportStats(db, tableName as string);

      // Close database
      db.close();
      db = null;

      res.json({
        success: true,
        stats,
      });
    } catch (error) {
      // Close database if open
      if (db) {
        try {
          db.close();
        } catch (e) {
          // Ignore close errors
        }
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get statistics',
      });
    }
  }
);

/**
 * DELETE /api/import/operations/:id
 *
 * Cancel or clean up an import operation
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Operation cancelled"
 * }
 */
router.delete(
  '/import/operations/:id',
  authenticate as any,
  requireWritePermission as any,
  (req: AuthenticatedRequest, res: Response): void => {
    const { id } = req.params;

    const operation = importOperations.get(id);

    if (!operation) {
      res.status(404).json({
        success: false,
        error: 'Import operation not found',
      });
      return;
    }

    // Only allow cancellation if operation is still pending or processing
    if (operation.status === 'completed' || operation.status === 'error') {
      res.status(400).json({
        success: false,
        error: `Cannot cancel operation with status: ${operation.status}`,
      });
      return;
    }

    // Update operation status
    operation.status = 'error';
    operation.progress.status = 'error';
    operation.progress.error = 'Operation cancelled by user';
    operation.completedAt = new Date();

    res.json({
      success: true,
      message: 'Operation cancelled',
    });
  }
);

/**
 * GET /api/import/operations
 *
 * List all import operations for the current user
 *
 * Query parameters:
 * - status: Filter by status (optional)
 * - limit: Maximum number of operations to return (default: 50)
 *
 * Response:
 * {
 *   "success": true,
 *   "operations": [ ... ]
 * }
 */
router.get(
  '/import/operations',
  authenticate as any,
  requireReadPermission as any,
  (req: AuthenticatedRequest, res: Response): void => {
    const { status, limit = 50 } = req.query;

    let operations = Array.from(importOperations.values());

    // Filter by user
    operations = operations.filter(
      op => op.userId === req.auth?.user.id
    );

    // Filter by status if specified
    if (status) {
      operations = operations.filter(op => op.status === status);
    }

    // Sort by creation date (newest first)
    operations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Limit results
    operations = operations.slice(0, Number(limit));

    res.json({
      success: true,
      operations: operations.map(op => ({
        id: op.id,
        status: op.status,
        progress: op.progress,
        createdAt: op.createdAt,
        completedAt: op.completedAt,
        dbPath: op.dbPath,
      })),
    });
  }
);

export default router;
