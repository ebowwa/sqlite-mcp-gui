/**
 * WebSocket Types for SQLite MCP GUI
 *
 * Defines the message types and interfaces for WebSocket communication.
 *
 * @module websocket/types
 */

import { WebSocket } from 'ws';

/**
 * Supported message types for WebSocket communication
 */
export enum WSMessageType {
  QUERY_STARTED = 'query:started',
  QUERY_PROGRESS = 'query:progress',
  QUERY_COMPLETE = 'query:complete',
  QUERY_ERROR = 'query:error',
  QUERY_CANCELLED = 'query:cancelled',
  TABLE_CREATED = 'table:created',
  TABLE_MODIFIED = 'table:modified',
  TABLE_DROPPED = 'table:dropped',
  USER_JOINED = 'user:joined',
  USER_LEFT = 'user:left',
  USER_CURSOR = 'user:cursor',
  CONNECTION_ACK = 'connection:ack',
  HEARTBEAT = 'heartbeat',
  ERROR = 'error',
}

/**
 * WebSocket channels for message routing
 */
export enum WSChannel {
  QUERIES = 'queries',
  TABLES = 'tables',
  NOTIFICATIONS = 'notifications',
  COLLABORATION = 'collaboration',
}

/**
 * Base WebSocket message interface
 */
export interface WSMessage {
  id: string;
  type: WSMessageType;
  channel: WSChannel;
  timestamp: number;
  data: any;
}

/**
 * Query started event data
 */
export interface QueryStartedData {
  queryId: string;
  sql: string;
  dbPath: string;
  userId: string;
  username?: string;
}

/**
 * Query progress event data
 */
export interface QueryProgressData {
  queryId: string;
  progress: number;
  rowsProcessed: number;
  totalRows?: number;
  message?: string;
}

/**
 * Query complete event data
 */
export interface QueryCompleteData {
  queryId: string;
  rowCount: number;
  executionTime: number;
  dbPath: string;
  userId: string;
  username?: string;
}

/**
 * Query error event data
 */
export interface QueryErrorData {
  queryId: string;
  error: string;
  dbPath: string;
  userId: string;
  username?: string;
}

/**
 * Table event data (created, modified, dropped)
 */
export interface TableEventData {
  tableName: string;
  dbPath: string;
  userId: string;
  username?: string;
  timestamp: number;
}

/**
 * User joined/left event data
 */
export interface UserEventData {
  userId: string;
  username: string;
  connectedAt: number;
  currentUsers: number;
}

/**
 * User cursor position data
 */
export interface UserCursorData {
  userId: string;
  username: string;
  position: {
    line: number;
    column: number;
  };
}

/**
 * Connection acknowledgment data
 */
export interface ConnectionAckData {
  clientId: string;
  serverTime: number;
}

/**
 * WebSocket client information
 */
export interface WSClient {
  socket: WebSocket;
  id: string;
  userId?: string;
  username?: string;
  connectedAt: number;
  channels: Set<WSChannel>;
  subscriptions: Set<string>;
  isAlive: boolean;
}

/**
 * Broadcast options
 */
export interface BroadcastOptions {
  excludeClient?: string;
  channel?: WSChannel;
  subscription?: string;
}

/**
 * Query execution options
 */
export interface QueryExecutionOptions {
  streamResults?: boolean;
  chunkSize?: number;
  onProgress?: (progress: QueryProgressData) => void;
  onCancel?: () => void;
}

/**
 * Active query information
 */
export interface ActiveQuery {
  id: string;
  sql: string;
  dbPath: string;
  userId: string;
  username?: string;
  startedAt: number;
  cancelled: boolean;
  options: QueryExecutionOptions;
}
