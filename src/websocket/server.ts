/**
 * WebSocket Server
 *
 * WebSocket server implementation for real-time updates and collaboration.
 *
 * @module websocket/server
 */

import { WebSocketServer as WSWebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { MessageType, Channel } from './types.js';
import type {
  WebSocketMessage,
  MessageData,
  ClientInfo,
  WebSocketServerConfig,
  ExpressIntegrationOptions,
} from './types.js';

/**
 * WebSocket Server class for real-time communication
 */
export class WebSocketServer {
  private wss: WSWebSocketServer;
  private httpServer: HttpServer;
  private clients: Map<WebSocket, ClientInfo> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private config: Required<WebSocketServerConfig>;

  constructor(config: WebSocketServerConfig = {}) {
    this.config = {
      port: config.port ?? 3001,
      path: config.path ?? '/ws',
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      maxConnections: config.maxConnections ?? 100,
      enableWss: config.enableWss ?? false,
      wssCertPath: config.wssCertPath ?? '',
      wssKeyPath: config.wssKeyPath ?? '',
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
        },
      });

      // Broadcast user joined event
      this.broadcastToChannel(
        Channel.COLLABORATION,
        {
          type: MessageType.USER_JOINED,
          data: {
            userId: clientId,
            username: clientInfo.username ?? 'Anonymous',
            connectedUsers: this.clients.size,
          },
        },
        ws
      );

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
        const message = JSON.parse(data.toString()) as WebSocketMessage;
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
          data: { timestamp: Date.now() },
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
      data: {
        userId: clientInfo.id,
        username: clientInfo.username ?? 'Anonymous',
        connectedUsers: this.clients.size,
      },
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
  private sendToClient<T extends MessageData>(
    ws: WebSocket,
    message: Omit<WebSocketMessage<T>, 'id' | 'timestamp'>
  ): void {
    if (ws.readyState === WebSocket.OPEN) {
      const messageWithId: WebSocketMessage<T> = {
        ...message,
        id: (message as any).id || uuidv4(),
        timestamp: (message as any).timestamp || Date.now(),
      };
      ws.send(JSON.stringify(messageWithId));
    }
  }

  /**
   * Send error message to client
   */
  private sendError(ws: WebSocket, message: string, code?: string | number): void {
    this.sendToClient(ws, {
      type: MessageType.ERROR,
      channel: Channel.NOTIFICATIONS,
      data: { message, code },
    });
  }

  /**
   * Broadcast message to all clients subscribed to a channel
   */
  private broadcastToChannel<T extends MessageData>(
    channel: Channel,
    message: Omit<WebSocketMessage<T>, 'id' | 'timestamp' | 'channel'>,
    excludeWs?: WebSocket
  ): void {
    const messageWithMeta: WebSocketMessage<T> = {
      ...message,
      id: (message as any).id || uuidv4(),
      timestamp: (message as any).timestamp || Date.now(),
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
  public broadcast<T extends MessageData>(
    message: Omit<WebSocketMessage<T>, 'id' | 'timestamp'>,
    excludeWs?: WebSocket
  ): void {
    this.clients.forEach((clientInfo, ws) => {
      if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        this.sendToClient(ws, message);
      }
    });
  }

  /**
   * Notify query started
   */
  public notifyQueryStarted(data: MessageData): void {
    this.broadcastToChannel(Channel.QUERIES, {
      type: MessageType.QUERY_STARTED,
      data,
    });
  }

  /**
   * Notify query progress
   */
  public notifyQueryProgress(data: MessageData): void {
    this.broadcastToChannel(Channel.QUERIES, {
      type: MessageType.QUERY_PROGRESS,
      data,
    });
  }

  /**
   * Notify query complete
   */
  public notifyQueryComplete(data: MessageData): void {
    this.broadcastToChannel(Channel.QUERIES, {
      type: MessageType.QUERY_COMPLETE,
      data,
    });
  }

  /**
   * Notify query error
   */
  public notifyQueryError(data: MessageData): void {
    this.broadcastToChannel(Channel.QUERIES, {
      type: MessageType.QUERY_ERROR,
      data,
    });
  }

  /**
   * Notify table created
   */
  public notifyTableCreated(data: MessageData): void {
    this.broadcastToChannel(Channel.TABLES, {
      type: MessageType.TABLE_CREATED,
      data,
    });
  }

  /**
   * Notify table modified
   */
  public notifyTableModified(data: MessageData): void {
    this.broadcastToChannel(Channel.TABLES, {
      type: MessageType.TABLE_MODIFIED,
      data,
    });
  }

  /**
   * Notify table dropped
   */
  public notifyTableDropped(data: MessageData): void {
    this.broadcastToChannel(Channel.TABLES, {
      type: MessageType.TABLE_DROPPED,
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
   * Get the underlying HTTP server (useful for Express integration)
   */
  public getHttpServer(): HttpServer {
    return this.httpServer;
  }

  /**
   * Get the WebSocket server instance
   */
  public getWsServer(): WSWebSocketServer {
    return this.wss;
  }

  /**
   * Start the WebSocket server
   */
  public start(): void {
    this.httpServer.listen(this.config.port, () => {
      console.log(
        `[WS] WebSocket server running on ws://localhost:${this.config.port}${this.config.path}`
      );
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

/**
 * Integrate WebSocket server with existing Express/HTTP server
 */
export function integrateWithExpress(options: ExpressIntegrationOptions): WebSocketServer {
  const { server, path = '/ws', config } = options;

  const wsServer = new WSWebSocketServer({
    server,
    path,
  });

  // Create a wrapper class for Express integration
  class ExpressIntegratedWebSocketServer extends WebSocketServer {
    constructor() {
      super({
        ...config,
        port: 0, // Not used when integrating with existing server
      });
    }

    public override start(): void {
      // Override start to not create a new server
      console.log(`[WS] WebSocket server integrated at path: ${path}`);
    }

    public override stop(): void {
      super.stop();
      // Don't close the HTTP server as it's managed by Express
    }
  }

  const integratedServer = new ExpressIntegratedWebSocketServer();

  // Replace the internal WSS instance with the integrated one
  (integratedServer as any).wss = wsServer;
  (integratedServer as any).setupWebSocketServer();

  return integratedServer;
}

export default WebSocketServer;
