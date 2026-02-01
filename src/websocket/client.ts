/**
 * WebSocket Client Utilities
 *
 * Client-side utilities for WebSocket communication with reconnection support.
 *
 * @module websocket/client
 */

import {
  WebSocketMessage,
  MessageType,
  Channel,
  ConnectionAckData,
  HeartbeatData,
  QueryProgressData,
  QueryCompleteData,
  QueryErrorData,
  TableEventData,
  UserEventData,
} from './types.js';

/**
 * Event handler type
 */
export type EventHandler = (data: any) => void;

/**
 * WebSocket client configuration
 */
export interface WebSocketClientConfig {
  url?: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

/**
 * WebSocket client class with reconnection support
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketClientConfig>;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isManualClose = false;
  private eventHandlers: Map<MessageType, Set<EventHandler>> = new Map();
  private clientId: string | null = null;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

  constructor(config: WebSocketClientConfig = {}) {
    this.config = {
      url: config.url || this.getDefaultUrl(),
      autoReconnect: config.autoReconnect ?? true,
      reconnectInterval: config.reconnectInterval || 3000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      heartbeatInterval: config.heartbeatInterval || 30000,
    };
  }

  /**
   * Get default WebSocket URL based on current location
   */
  private getDefaultUrl(): string {
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/ws`;
    }
    return 'ws://localhost:3001/ws';
  }

  /**
   * Connect to WebSocket server
   */
  public connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.warn('[WS Client] Already connected');
      return;
    }

    if (this.connectionStatus === 'connecting') {
      console.warn('[WS Client] Connection already in progress');
      return;
    }

    this.isManualClose = false;
    this.connectionStatus = 'connecting';

    try {
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        this.connectionStatus = 'connected';
        this.reconnectAttempts = 0;
        console.log('[WS Client] Connected to server');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        this.connectionStatus = 'disconnected';
        this.stopHeartbeat();
        console.log(`[WS Client] Disconnected: ${event.code} ${event.reason}`);

        if (!this.isManualClose && this.config.autoReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WS Client] Error:', error);
      };
    } catch (error) {
      console.error('[WS Client] Connection error:', error);
      this.connectionStatus = 'disconnected';
      if (this.config.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  public disconnect(): void {
    this.isManualClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectionStatus = 'disconnected';
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[WS Client] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval * Math.min(this.reconnectAttempts, 5);

    console.log(`[WS Client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: MessageType.HEARTBEAT,
          channel: 'notifications' as Channel,
          data: { timestamp: Date.now() },
        });
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Handle incoming message from server
   */
  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data);

      switch (message.type) {
        case MessageType.CONNECTION_ACK:
          this.clientId = (message.data as ConnectionAckData).clientId;
          console.log('[WS Client] Connection acknowledged, client ID:', this.clientId);
          break;

        case MessageType.HEARTBEAT:
          // Server heartbeat response, no action needed
          break;

        default:
          // Trigger event handlers
          this.emit(message.type, message.data);
      }
    } catch (error) {
      console.error('[WS Client] Error handling message:', error);
    }
  }

  /**
   * Send message to server
   */
  public send(message: Partial<WebSocketMessage>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS Client] Cannot send message: not connected');
      return;
    }

    const fullMessage: WebSocketMessage = {
      id: message.id || this.generateId(),
      timestamp: message.timestamp || Date.now(),
      type: message.type,
      channel: message.channel,
      data: message.data,
    };

    this.ws.send(JSON.stringify(fullMessage));
  }

  /**
   * Subscribe to channel
   */
  public subscribe(channel: Channel): void {
    // In a real implementation, you would send a subscription message to the server
    console.log(`[WS Client] Subscribed to channel: ${channel}`);
  }

  /**
   * Unsubscribe from channel
   */
  public unsubscribe(channel: Channel): void {
    // In a real implementation, you would send an unsubscribe message to the server
    console.log(`[WS Client] Unsubscribed from channel: ${channel}`);
  }

  /**
   * Register event handler
   */
  public on(eventType: MessageType, handler: EventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * Unregister event handler
   */
  public off(eventType: MessageType, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventType);
      }
    }
  }

  /**
   * Emit event to all registered handlers
   */
  private emit(eventType: MessageType, data: any): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[WS Client] Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Get connection status
   */
  public getStatus(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionStatus;
  }

  /**
   * Get client ID
   */
  public getClientId(): string | null {
    return this.clientId;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create a WebSocket client instance
 */
export function createWebSocketClient(config?: WebSocketClientConfig): WebSocketClient {
  return new WebSocketClient(config);
}
