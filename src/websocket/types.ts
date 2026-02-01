/**
 * WebSocket Types and Interfaces
 *
 * Type definitions for WebSocket communication channels and events.
 *
 * @module websocket/types
 */

/**
 * WebSocket message types for different event categories
 */
export enum MessageType {
  // Query events
  QUERY_STARTED = 'query:started',
  QUERY_PROGRESS = 'query:progress',
  QUERY_COMPLETE = 'query:complete',
  QUERY_ERROR = 'query:error',
  QUERY_CANCELLED = 'query:cancelled',

  // Table events
  TABLE_CREATED = 'table:created',
  TABLE_MODIFIED = 'table:modified',
  TABLE_DROPPED = 'table:dropped',

  // User events
  USER_JOINED = 'user:joined',
  USER_LEFT = 'user:left',
  USER_CURSOR = 'user:cursor',

  // System events
  CONNECTION_ACK = 'connection:ack',
  HEARTBEAT = 'heartbeat',
  ERROR = 'error',
}

/**
 * WebSocket communication channels
 */
export enum Channel {
  QUERIES = 'queries',
  TABLES = 'tables',
  NOTIFICATIONS = 'notifications',
  COLLABORATION = 'collaboration',
}

/**
 * Base WebSocket message structure
 */
export interface WebSocketMessage<T = any> {
  type: MessageType;
  channel: Channel;
  data: T;
  timestamp: number;
  id: string;
}

/**
 * Query started event data
 */
export interface QueryStartedData {
  queryId: string;
  sql: string;
  dbPath: string;
  userId?: string;
  username?: string;
}

/**
 * Query progress event data
 */
export interface QueryProgressData {
  queryId: string;
  progress: number;
  message?: string;
  rowsProcessed?: number;
  estimatedTotal?: number;
}

/**
 * Query complete event data
 */
export interface QueryCompleteData {
  queryId: string;
  rows: any[];
  rowCount: number;
  executionTime: number;
}

/**
 * Query error event data
 */
export interface QueryErrorData {
  queryId: string;
  error: string;
  code?: string;
}

/**
 * Table event data (created, modified, dropped)
 */
export interface TableEventData {
  tableName: string;
  dbPath: string;
  userId?: string;
  username?: string;
  timestamp: number;
}

/**
 * User joined/left event data
 */
export interface UserEventData {
  userId: string;
  username: string;
  connectedUsers: number;
}

/**
 * User cursor position data (for collaboration)
 */
export interface UserCursorData {
  userId: string;
  username: string;
  position: {
    line: number;
    column: number;
  };
  selection?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

/**
 * Connection acknowledgment data
 */
export interface ConnectionAckData {
  clientId: string;
  connectedAt: number;
  serverInfo: {
    version: string;
    capabilities: string[];
  };
}

/**
 * Heartbeat data
 */
export interface HeartbeatData {
  timestamp: number;
}

/**
 * Error event data
 */
export interface ErrorData {
  message: string;
  code?: string;
  details?: any;
}

/**
 * Client connection info
 */
export interface ClientInfo {
  id: string;
  userId?: string;
  username?: string;
  connectedAt: number;
  lastHeartbeat: number;
  subscriptions: Set<Channel>;
}

/**
 * Query options for streaming
 */
export interface QueryOptions {
  chunkSize?: number;
  enableProgress?: boolean;
  cancelSignal?: AbortSignal;
}

/**
 * WebSocket server configuration
 */
export interface WebSocketServerConfig {
  port?: number;
  path?: string;
  heartbeatInterval?: number;
  maxConnections?: number;
  enableWss?: boolean;
  wssCertPath?: string;
  wssKeyPath?: string;
}
