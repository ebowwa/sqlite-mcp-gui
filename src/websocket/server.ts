/**
 * WebSocket Server
 *
 * WebSocket server implementation for real-time updates and collaboration.
 *
 * @module websocket/server
 */

import { WebSocketServer as WSWebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HTTPServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import {
  WebSocketMessage,
  MessageType,
  Channel,
  ClientInfo,
  QueryStartedData,
  QueryProgressData,
  QueryCompleteData,
  QueryErrorData,
  TableEventData,
  UserEventData,
  ConnectionAckData,
  HeartbeatData,
  ErrorData,
  WebSocketServerConfig,
} from './types.js';

/**
 * WebSocket Server class for real-time communication
 */
export class WebSocketServer {
  private wss: WSWebSocketServer;
  private httpServer: HTTPServer;
  private clients: Map<WebSocket, ClientInfo> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private config: Required<WebSocketServerConfig>;

  constructor(config: WebSocketServerConfig = {}) {
    this.config = {
      port: config.port || 3001,
      path: config.path || '/ws',
      heartbeatInterval: config.heartbeatInterval || 30000,
      maxConnections: config.maxConnections || 100,
      enableWss: config.enableWss || false,
      wssCertPath: config.wssCertPath || '',
      wssKeyPath: config.wssKeyPath || '',
    };

    // Create HTTP server for WebSocket upgrade
    this.httpServer = createServer();

    // Create WebSocket server
    this.wss = new WSWebSocketServer({
      server: this.httpServer,
      path: this.config.path,
    });

    this.setupWebSocketServer();
    this.startHeartbeat();
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      // Check max connections
      if (this.clients.size >= this.config.maxConnections) {
        ws.close(1008, 'Server is full');
        return;
      }

      // Create client info
      const clientId = uuidv4();
      const clientInfo: ClientInfo = {
        id: clientId,
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
        subscriptions: new Set([Channel.NOTIFICATIONS]),
      };

      this.clients.set(ws, clientInfo);

      // Send connection acknowledgment
      this.sendToClient(ws, {
        type: MessageType.CONNECTION_ACK,
        channel: Channel.NOTIFICATIONS,
        data: {
          clientId,
          connectedAt: clientInfo.connectedAt,
          serverInfo: {
            version: '1.0.0',
            capabilities: ['queries', 'tables', 'notifications', 'collaboration'],
          },
        } as ConnectionAckData,
      });

      // Broadcast user joined event
      this.broadcastToChannel(Channel.COLLABORATION, {
        type: MessageType.USER_JOINED,
        channel: Channel.COLLABORATION,
        data: {
          userId: clientId,
          username: clientInfo.username || 'Anonymous',
          connectedUsers: this.clients.size,
        } as UserEventData,
      }, ws);

      console.log(`[WS] Client connected: ${clientId}. Total: ${this.clients.size}`);

      // Setup client event handlers
      this.setupClientHandlers(ws, clientInfo);
    });

    this.wss.on('error', (error) => {
      console.error('[WS] Server error:', error);
    });

    this.httpServer.on('error', (error) => {
      console.error('[WS] HTTP server error:', error);
    });
  }

  /**
   * Setup individual client event handlers
   */
  private setupClientHandlers(ws: WebSocket, clientInfo: ClientInfo): void {
    ws.on('message', (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        this.handleClientMessage(ws, clientInfo, message);
      } catch (error) {
        console.error('[WS] Error parsing message:', error);
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      this.handleClientDisconnect(ws, clientInfo);
    });

    ws.on('error', (error) => {
      console.error(`[WS] Client error (${clientInfo.id}):`, error);
    });

    ws.on('pong', () => {
      clientInfo.lastHeartbeat = Date.now();
    });
  }

  /**
   * Handle incoming messages from clients
   */
  private handleClientMessage(
    ws: WebSocket,
    clientInfo: ClientInfo,
    message: WebSocketMessage
  ): void {
    switch (message.type) {
      case MessageType.HEARTBEAT:
        // Respond to heartbeat
        this.sendToClient(ws, {
          type: MessageType.HEARTBEAT,
          channel: Channel.NOTIFICATIONS,
          data: { timestamp: Date.now() } as HeartbeatData,
        });
        break;

      case MessageType.USER_CURSOR:
        // Broadcast cursor position to other clients
        this.broadcastToChannel(Channel.COLLABORATION, message, ws);
        break;

      case MessageType.QUERY_STARTED:
      case MessageType.QUERY_PROGRESS:
      case MessageType.QUERY_COMPLETE:
      case MessageType.QUERY_ERROR:
        // Broadcast query events to all subscribed clients
        this.broadcastToChannel(Channel.QUERIES, message);
        break;

      case MessageType.TABLE_CREATED:
      case MessageType.TABLE_MODIFIED:
      case MessageType.TABLE_DROPPED:
        // Broadcast table events to all subscribed clients
        this.broadcastToChannel(Channel.TABLES, message);
        break;

      default:
        console.warn(`[WS] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle client disconnection
   */
  private handleClientDisconnect(ws: WebSocket, clientInfo: ClientInfo): void {
    this.clients.delete(ws);

    // Broadcast user left event
    this.broadcastToChannel(Channel.COLLABORATION, {
      type: MessageType.USER_LEFT,
      channel: Channel.COLLABORATION,
      data: {
        userId: clientInfo.id,
        username: clientInfo.username || 'Anonymous',
        connectedUsers: this.clients.size,
      } as UserEventData,
    });

    console.log(`[WS] Client disconnected: ${clientInfo.id}. Total: ${this.clients.size}`);
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = this.config.heartbeatInterval * 2;

      this.clients.forEach((clientInfo, ws) => {
        // Check for stale connections
        if (now - clientInfo.lastHeartbeat > staleThreshold) {
          console.log(`[WS] Closing stale connection: ${clientInfo.id}`);
          ws.terminate();
          return;
        }

        // Send ping
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, this.config.heartbeatInterval);
  }

  /**
   * Send message to specific client
   */
  private sendToClient(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      const messageWithId = {
        ...message,
        id: message.id || uuidv4(),
        timestamp: message.timestamp || Date.now(),
      };
      ws.send(JSON.stringify(messageWithId));
    }
  }

  /**
   * Send error message to client
   */
  private sendError(ws: WebSocket, message: string, code?: string): void {
    this.sendToClient(ws, {
      type: MessageType.ERROR,
      channel: Channel.NOTIFICATIONS,
      data: { message, code } as ErrorData,
    });
  }

  /**
   * Broadcast message to all clients subscribed to a channel
   */
  public broadcastToChannel(
    channel: Channel,
    message: WebSocketMessage,
    excludeWs?: WebSocket
  ): void {
    const messageWithMeta = {
      ...message,
      id: message.id || uuidv4(),
      timestamp: message.timestamp || Date.now(),
      channel,
    };

    this.clients.forEach((clientInfo, ws) => {
      if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        if (clientInfo.subscriptions.has(channel)) {
          ws.send(JSON.stringify(messageWithMeta));
        }
      }
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  public broadcast(message: WebSocketMessage, excludeWs?: WebSocket): void {
    this.clients.forEach((clientInfo, ws) => {
      if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        this.sendToClient(ws, message);
      }
    });
  }

  /**
   * Notify query started
   */
  public notifyQueryStarted(data: QueryStartedData): void {
    this.broadcastToChannel(Channel.QUERIES, {
      type: MessageType.QUERY_STARTED,
      channel: Channel.QUERIES,
      data,
    });
  }

  /**
   * Notify query progress
   */
  public notifyQueryProgress(data: QueryProgressData): void {
    this.broadcastToChannel(Channel.QUERIES, {
      type: MessageType.QUERY_PROGRESS,
      channel: Channel.QUERIES,
      data,
    });
  }

  /**
   * Notify query complete
   */
  public notifyQueryComplete(data: QueryCompleteData): void {
    this.broadcastToChannel(Channel.QUERIES, {
      type: MessageType.QUERY_COMPLETE,
      channel: Channel.QUERIES,
      data,
    });
  }

  /**
   * Notify query error
   */
  public notifyQueryError(data: QueryErrorData): void {
    this.broadcastToChannel(Channel.QUERIES, {
      type: MessageType.QUERY_ERROR,
      channel: Channel.QUERIES,
      data,
    });
  }

  /**
   * Notify table created
   */
  public notifyTableCreated(data: TableEventData): void {
    this.broadcastToChannel(Channel.TABLES, {
      type: MessageType.TABLE_CREATED,
      channel: Channel.TABLES,
      data,
    });
  }

  /**
   * Notify table modified
   */
  public notifyTableModified(data: TableEventData): void {
    this.broadcastToChannel(Channel.TABLES, {
      type: MessageType.TABLE_MODIFIED,
      channel: Channel.TABLES,
      data,
    });
  }

  /**
   * Notify table dropped
   */
  public notifyTableDropped(data: TableEventData): void {
    this.broadcastToChannel(Channel.TABLES, {
      type: MessageType.TABLE_DROPPED,
      channel: Channel.TABLES,
      data,
    });
  }

  /**
   * Subscribe client to channel
   */
  public subscribeClient(ws: WebSocket, channel: Channel): void {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      clientInfo.subscriptions.add(channel);
    }
  }

  /**
   * Unsubscribe client from channel
   */
  public unsubscribeClient(ws: WebSocket, channel: Channel): void {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      clientInfo.subscriptions.delete(channel);
    }
  }

  /**
   * Get connected clients count
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Start the WebSocket server
   */
  public start(): void {
    this.httpServer.listen(this.config.port, () => {
      console.log(`[WS] WebSocket server running on ws://localhost:${this.config.port}${this.config.path}`);
    });
  }

  /**
   * Stop the WebSocket server
   */
  public stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all connections
    this.clients.forEach((clientInfo, ws) => {
      ws.close();
    });

    this.wss.close();
    this.httpServer.close();
    console.log('[WS] WebSocket server stopped');
  }
}

/**
 * Create and start a WebSocket server instance
 */
export function createWebSocketServer(config?: WebSocketServerConfig): WebSocketServer {
  const server = new WebSocketServer(config);
  server.start();
  return server;
}
