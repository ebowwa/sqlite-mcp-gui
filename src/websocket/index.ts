/**
 * WebSocket Module
 *
 * Main entry point for WebSocket server functionality.
 * Exports all public APIs for integration with Express and other parts of the application.
 *
 * @module websocket
 */

export {
  WebSocketServer,
  createWebSocketServer,
  integrateWithExpress,
} from './server.js';

export {
  MessageType,
  Channel,
  type WebSocketMessage,
  type MessageData,
  type ClientInfo,
  type WebSocketServerConfig,
  type ExpressIntegrationOptions,
  type ConnectionAckData,
  type QueryProgressData,
  type QueryCompleteData,
  type QueryErrorData,
  type TableEventData,
  type UserCursorData,
  type UserEventData,
  type ErrorData,
} from './types.js';

export { default } from './server.js';
