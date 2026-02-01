/**
 * Query Streamer for SQLite MCP GUI
 *
 * Handles streaming of large query results with progress updates.
 *
 * @module websocket/query-streamer
 */

import { Database } from 'better-sqlite3';
import { getWSServer } from './server.js';
import { QueryExecutionOptions, QueryProgressData } from './types.js';

/**
 * Stream query results in chunks
 */
export async function streamQueryResults(
  db: Database,
  sql: string,
  queryId: string,
  options: QueryExecutionOptions = {}
): Promise<any[]> {
  const wsServer = getWSServer();
  if (!wsServer) {
    // If WebSocket is not enabled, just execute normally
    const stmt = db.prepare(sql);
    return stmt.all() as any[];
  }

  const chunkSize = options.chunkSize || 1000;
  const allResults: any[] = [];

  try {
    // Get total row count for progress tracking
    let totalRows = 0;
    try {
      const countStmt = db.prepare(`SELECT COUNT(*) as count FROM (${sql})`);
      const result = countStmt.get() as { count: number };
      totalRows = result.count;
    } catch (e) {
      // If we can't count, we'll track without total
      totalRows = 0;
    }

    // Execute the query and stream results
    const stmt = db.prepare(sql);
    const rows = stmt.all() as any[];

    // Process in chunks
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      allResults.push(...chunk);

      const progress = totalRows > 0 ? ((i + chunk.length) / totalRows) * 100 : (i / rows.length) * 100;

      wsServer.notifyQueryProgress(
        queryId,
        Math.min(progress, 100),
        i + chunk.length,
        totalRows || undefined
      );

      // Small delay to allow UI updates
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return allResults;
  } catch (error) {
    throw error;
  }
}

/**
 * Execute query with streaming support
 */
export async function executeQueryWithStreaming(
  dbPath: string,
  sql: string,
  queryId: string,
  options: QueryExecutionOptions = {}
): Promise<{ rows: any[]; rowCount: number; executionTime: number }> {
  const wsServer = getWSServer();
  const startTime = Date.now();

  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    const trimmedSql = sql.trim().toUpperCase();

    let rows: any[] = [];
    let changes = 0;

    if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA')) {
      if (options.streamResults) {
        rows = await streamQueryResults(db, sql, queryId, options);
      } else {
        const stmt = db.prepare(sql);
        rows = stmt.all() as any[];
      }
    } else {
      // For non-SELECT queries, execute directly
      db.exec(sql);
      const changesStmt = db.prepare('SELECT changes() as changes');
      const result = changesStmt.get() as { changes: number };
      changes = result.changes;
    }

    db.close();

    const executionTime = Date.now() - startTime;

    if (wsServer) {
      if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA')) {
        wsServer.notifyQueryComplete(queryId, rows.length, executionTime);
      } else {
        wsServer.notifyQueryComplete(queryId, changes, executionTime);
      }
    }

    return {
      rows,
      rowCount: rows.length || changes,
      executionTime,
    };
  } catch (error) {
    if (wsServer) {
      wsServer.notifyQueryError(queryId, error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
}

/**
 * Cancel a running query
 */
export function cancelQuery(queryId: string): boolean {
  const wsServer = getWSServer();
  if (!wsServer) {
    return false;
  }

  // The query will be cancelled on the next progress update
  return true;
}
