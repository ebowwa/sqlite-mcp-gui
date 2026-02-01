/**
 * WebSocket Server for SQLite MCP GUI
 *
 * Provides real-time communication for:
 * - Query execution and progress updates
 * - Table change notifications
 * - Multi-user collaboration
 * - Live notifications
 *
 * @module websocket/server
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  WSMessageType,
  WSChannel,
  WSClient,
  BroadcastOptions,
} from './types.js';

/**
 * Simple WebSocket Server interface for the UI server
 */
export interface WebSocketServerInterface {
  notifyQueryStarted(data: any): void;
  notifyQueryProgress(data: any): void;
  notifyQueryComplete(data: any): void;
  notifyQueryError(data: any): void;
  notifyTableCreated(data: any): void;
  notifyTableModified(data: any): void;
  notifyTableDropped(data: any): void;
  getClientCount(): number;
  close(): void;
}

/**
 * WebSocket Server class
 */
export class WSServer implements WebSocketServerInterface {
  private wss: WebSocketServer;
  private clients: Map<string, WSClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private enabled: boolean;

  constructor(config: { port?: number; path?: string; heartbeatInterval?: number; maxConnections?: number }) {
    this.enabled = process.env.WS_ENABLED !== 'false';

    if (!this.enabled) {
      console.log('[WS] WebSocket server disabled (WS_ENABLED=false)');
      // Create a dummy WebSocketServer
      this.wss = new WebSocketServer({ noServer: true });
      return;
    }

    const port = config.port || 3001;
    const path = config.path || '/ws';

    this.wss = new WebSocketServer({ port, path });

    this.wss.on('connection', (socket: WebSocket, req) => {
      this.handleConnection(socket, req);
    });

    // Start heartbeat
    this.startHeartbeat(config.heartbeatInterval || 30000);

    console.log(`[WS] WebSocket server running on ws://localhost:${port}${path}`);
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: WebSocket, req: any) {
    const clientId = uuidv4();
    const client: WSClient = {
      socket,
      id: clientId,
      connectedAt: Date.now(),
      channels: new Set([WSChannel.NOTIFICATIONS]),
      subscriptions: new Set(),
      isAlive: true,
    };

    // Extract user info from query params
    const url = new URL(req.url || '', `ws://localhost`);
    const userId = url.searchParams.get('userId');
    const username = url.searchParams.get('username');

    if (userId) client.userId = userId;
    if (username) client.username = username;

    this.clients.set(clientId, client);

    console.log(`[WS] Client connected: ${clientId} (${username || 'Anonymous'})`);

    // Send connection acknowledgment
    this.sendToClient(client, {
      type: WSMessageType.CONNECTION_ACK,
      channel: WSChannel.NOTIFICATIONS,
      data: {
        clientId,
        serverTime: Date.now(),
      },
    });

    // Notify other users
    this.broadcast({
      type: WSMessageType.USER_JOINED,
      channel: WSChannel.COLLABORATION,
      data: {
        userId: client.userId || clientId,
        username: client.username || 'Anonymous',
        connectedAt: client.connectedAt,
        currentUsers: this.clients.size,
      },
    }, { excludeClient: clientId });

    // Set up socket event handlers
    socket.on('message', (data) => this.handleMessage(client, data));
    socket.on('close', () => this.handleDisconnect(client));
    socket.on('error', (error) => this.handleError(client, error));
    socket.on('pong', () => {
      client.isAlive = true;
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(client: WSClient, data: any) {
    try {
      const message = JSON.parse(data.toString());
      const { type } = message;

      if (type === WSMessageType.HEARTBEAT) {
        client.isAlive = true;
      }
    } catch (error) {
      console.error('[WS] Error handling message:', error);
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(client: WSClient) {
    console.log(`[WS] Client disconnected: ${client.id}`);
    this.clients.delete(client.id);

    // Notify other users
    this.broadcast({
      type: WSMessageType.USER_LEFT,
      channel: WSChannel.COLLABORATION,
      data: {
        userId: client.userId || client.id,
        username: client.username || 'Anonymous',
        connectedAt: client.connectedAt,
        currentUsers: this.clients.size,
      },
    });
  }

  /**
   * Handle socket error
   */
  private handleError(client: WSClient, error: Error) {
    console.error(`[WS] Error for client ${client.id}:`, error);
  }

  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(interval: number) {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, id) => {
        if (!client.isAlive) {
          console.log(`[WS] Terminating dead connection: ${id}`);
          client.socket.terminate();
          this.clients.delete(id);
          return;
        }

        client.isAlive = false;
        client.socket.ping();
      });
    }, interval);
  }

  /**
   * Send message to specific client
   */
  private sendToClient(client: WSClient, message: any) {
    if (client.socket.readyState === WebSocket.OPEN) {
      const fullMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        ...message,
      };

      client.socket.send(JSON.stringify(fullMessage));
    }
  }

  /**
   * Broadcast message to all clients (with optional filtering)
   */
  public broadcast(message: any, options: BroadcastOptions = {}) {
    const fullMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...message,
    };

    this.clients.forEach((client) => {
      // Skip excluded client
      if (options.excludeClient && client.id === options.excludeClient) {
        return;
      }

      // Filter by channel
      if (options.channel && !client.channels.has(options.channel)) {
        return;
      }

      // Filter by subscription
      if (options.subscription && !client.subscriptions.has(options.subscription)) {
        return;
      }

      this.sendToClient(client, fullMessage);
    });
  }

  /**
   * Notify about query started
   */
  public notifyQueryStarted(data: any) {
    this.broadcast({
      type: WSMessageType.QUERY_STARTED,
      channel: WSChannel.QUERIES,
      data,
    });
  }

  /**
   * Notify about query progress
   */
  public notifyQueryProgress(data: any) {
    this.broadcast({
      type: WSMessageType.QUERY_PROGRESS,
      channel: WSChannel.QUERIES,
      data,
    });
  }

  /**
   * Notify about query completion
   */
  public notifyQueryComplete(data: any) {
    this.broadcast({
      type: WSMessageType.QUERY_COMPLETE,
      channel: WSChannel.QUERIES,
      data,
    });
  }

  /**
   * Notify about query error
   */
  public notifyQueryError(data: any) {
    this.broadcast({
      type: WSMessageType.QUERY_ERROR,
      channel: WSChannel.QUERIES,
      data,
    });
  }

  /**
   * Notify about table creation
   */
  public notifyTableCreated(data: any) {
    this.broadcast({
      type: WSMessageType.TABLE_CREATED,
      channel: WSChannel.TABLES,
      data,
    });
  }

  /**
   * Notify about table modification
   */
  public notifyTableModified(data: any) {
    this.broadcast({
      type: WSMessageType.TABLE_MODIFIED,
      channel: WSChannel.TABLES,
      data,
    });
  }

  /**
   * Notify about table drop
   */
  public notifyTableDropped(data: any) {
    this.broadcast({
      type: WSMessageType.TABLE_DROPPED,
      channel: WSChannel.TABLES,
      data,
    });
  }

  /**
   * Get connected clients count
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close the WebSocket server
   */
  public close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    this.clients.forEach((client) => {
      client.socket.close();
    });

    this.wss.close();
    console.log('[WS] WebSocket server closed');
  }
}

/**
 * Create a standalone WebSocket server
 */
export function createWebSocketServer(config: {
  port?: number;
  path?: string;
  heartbeatInterval?: number;
  maxConnections?: number;
}): WebSocketServerInterface {
  return new WSServer(config);
}
