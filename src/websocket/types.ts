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
 * Base message structure
 */
export interface BaseMessage {
  id: string;
  timestamp: number;
  type: MessageType;
  channel: Channel;
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
 * Query progress data
 */
export interface QueryProgressData {
  queryId: string;
  progress: number;
  message?: string;
  rowCount?: number;
}

/**
 * Query completion data
 */
export interface QueryCompleteData {
  queryId: string;
  rowCount: number;
  duration: number;
  results?: any[];
}

/**
 * Query error data
 */
export interface QueryErrorData {
  queryId: string;
  error: string;
  code?: string;
}

/**
 * Table event data
 */
export interface TableEventData {
  tableName: string;
  userId: string;
  timestamp: number;
  changes?: {
    columns?: string[];
    type?: string;
  };
}

/**
 * User cursor position data
 */
export interface UserCursorData {
  userId: string;
  username: string;
  table?: string;
  row?: number;
  column?: string;
}

/**
 * User event data (joined/left)
 */
export interface UserEventData {
  userId: string;
  username: string;
  connectedUsers: number;
}

/**
 * Error message data
 */
export interface ErrorData {
  message: string;
  code?: string | number;
}

/**
 * Message data union type
 */
export type MessageData =
  | ConnectionAckData
  | QueryProgressData
  | QueryCompleteData
  | QueryErrorData
  | TableEventData
  | UserCursorData
  | UserEventData
  | ErrorData
  | Record<string, unknown>;

/**
 * Complete WebSocket message structure
 */
export interface WebSocketMessage<T extends MessageData = MessageData> extends BaseMessage {
  data: T;
}

/**
 * Client information structure
 */
export interface ClientInfo {
  id: string;
  connectedAt: number;
  lastHeartbeat: number;
  username?: string;
  subscriptions: Set<Channel>;
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

/**
 * Express integration options
 */
export interface ExpressIntegrationOptions {
  server: import('http').Server;
  path?: string;
  config?: Omit<WebSocketServerConfig, 'port' | 'enableWss' | 'wssCertPath' | 'wssKeyPath'>;
}
