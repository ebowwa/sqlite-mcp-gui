# WebSocket Server

A TypeScript WebSocket server implementation for real-time updates, multi-user collaboration, and live table change notifications in the SQLite MCP GUI application.

## Features

- **Real-time Query Progress Updates**: Notify clients about query execution progress
- **Multi-user Collaboration**: Track connected users and broadcast their activities
- **Live Table Change Notifications**: Instant updates when tables are created, modified, or dropped
- **Connection Management**: Handle connections, disconnections, and heartbeat monitoring
- **Channel-based Messaging**: Organize messages into logical channels (queries, tables, notifications, collaboration)
- **Express Integration**: Easy integration with existing Express/HTTP servers

## Architecture

### Message Types

The server supports the following message types:

- **Query Events**: `QUERY_STARTED`, `QUERY_PROGRESS`, `QUERY_COMPLETE`, `QUERY_ERROR`, `QUERY_CANCELLED`
- **Table Events**: `TABLE_CREATED`, `TABLE_MODIFIED`, `TABLE_DROPPED`
- **User Events**: `USER_JOINED`, `USER_LEFT`, `USER_CURSOR`
- **System Events**: `CONNECTION_ACK`, `HEARTBEAT`, `ERROR`

### Channels

Messages are organized into channels:

- `queries`: Query execution events and progress updates
- `tables`: Table schema changes
- `notifications`: System notifications and alerts
- `collaboration`: User presence and cursor positions

## Usage

### Standalone Server

Create a standalone WebSocket server:

```typescript
import { createWebSocketServer } from './websocket/index.js';

const wsServer = createWebSocketServer({
  port: 3001,
  path: '/ws',
  heartbeatInterval: 30000,
  maxConnections: 100,
});

// Notify query progress
wsServer.notifyQueryProgress({
  queryId: 'query-123',
  progress: 50,
  message: 'Processing rows...',
  rowCount: 5000,
});

// Notify table changes
wsServer.notifyTableCreated({
  tableName: 'users',
  userId: 'user-456',
  timestamp: Date.now(),
});

// Get connected clients count
const clientCount = wsServer.getClientCount();
console.log(`Connected clients: ${clientCount}`);
```

### Express Integration

Integrate with an existing Express server:

```typescript
import express from 'express';
import { createServer } from 'http';
import { integrateWithExpress } from './websocket/index.js';

const app = express();
const httpServer = createServer(app);

// Integrate WebSocket server
const wsServer = integrateWithExpress({
  server: httpServer,
  path: '/ws',
  config: {
    heartbeatInterval: 30000,
    maxConnections: 100,
  },
});

httpServer.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Broadcasting Messages

Send messages to all connected clients:

```typescript
// Broadcast to specific channel
wsServer.broadcastToChannel('queries', {
  type: 'query:complete',
  channel: 'queries',
  data: {
    queryId: 'query-123',
    rowCount: 1000,
    duration: 250,
  },
});

// Broadcast to all clients
wsServer.broadcast({
  type: 'error',
  channel: 'notifications',
  data: {
    message: 'Database connection lost',
    code: 'DB_ERROR',
  },
});
```

### Client Subscriptions

Manage client subscriptions to channels:

```typescript
// Subscribe client to channel
wsServer.subscribeClient(wsSocket, 'queries');

// Unsubscribe client from channel
wsServer.unsubscribeClient(wsSocket, 'tables');
```

## API Reference

### WebSocketServer Class

#### Constructor

```typescript
constructor(config?: WebSocketServerConfig)
```

**Config Options:**
- `port`: Server port (default: 3001)
- `path`: WebSocket path (default: '/ws')
- `heartbeatInterval`: Heartbeat interval in ms (default: 30000)
- `maxConnections`: Maximum concurrent connections (default: 100)
- `enableWss`: Enable secure WebSocket (default: false)
- `wssCertPath`: Path to SSL certificate
- `wssKeyPath`: Path to SSL key

#### Methods

- `start()`: Start the WebSocket server
- `stop()`: Stop the WebSocket server
- `getClientCount()`: Get number of connected clients
- `notifyQueryStarted(data)`: Notify query execution started
- `notifyQueryProgress(data)`: Notify query progress update
- `notifyQueryComplete(data)`: Notify query completion
- `notifyQueryError(data)`: Notify query error
- `notifyTableCreated(data)`: Notify table creation
- `notifyTableModified(data)`: Notify table modification
- `notifyTableDropped(data)`: Notify table drop
- `broadcast(message, excludeWs?)`: Broadcast to all clients
- `subscribeClient(ws, channel)`: Subscribe client to channel
- `unsubscribeClient(ws, channel)`: Unsubscribe client from channel

## Message Format

All messages follow this structure:

```typescript
interface WebSocketMessage<T> {
  id: string;           // Unique message ID
  timestamp: number;    // Unix timestamp
  type: MessageType;    // Message type enum
  channel: Channel;     // Channel enum
  data: T;              // Message payload
}
```

### Example Messages

**Query Progress:**
```json
{
  "id": "msg-123",
  "timestamp": 1738454400000,
  "type": "query:progress",
  "channel": "queries",
  "data": {
    "queryId": "query-456",
    "progress": 75,
    "message": "Processing...",
    "rowCount": 7500
  }
}
```

**Table Created:**
```json
{
  "id": "msg-124",
  "timestamp": 1738454400000,
  "type": "table:created",
  "channel": "tables",
  "data": {
    "tableName": "products",
    "userId": "user-789",
    "timestamp": 1738454400000
  }
}
```

**User Joined:**
```json
{
  "id": "msg-125",
  "timestamp": 1738454400000,
  "type": "user:joined",
  "channel": "collaboration",
  "data": {
    "userId": "user-101",
    "username": "john_doe",
    "connectedUsers": 5
  }
}
```

## TypeScript Types

Full TypeScript support with exported types:

```typescript
import type {
  MessageType,
  Channel,
  WebSocketMessage,
  MessageData,
  ClientInfo,
  WebSocketServerConfig,
  ConnectionAckData,
  QueryProgressData,
  QueryCompleteData,
  QueryErrorData,
  TableEventData,
  UserCursorData,
  UserEventData,
  ErrorData,
} from './websocket/types.js';
```

## Error Handling

The server includes built-in error handling:

- Invalid message format detection
- Connection limit enforcement
- Stale connection cleanup via heartbeat
- Graceful error reporting to clients

## Security Considerations

- Maximum connection limits prevent resource exhaustion
- Heartbeat mechanism detects and cleans up dead connections
- Message validation prevents malformed data processing
- Consider adding authentication for production use

## Dependencies

- `ws`: WebSocket library
- `uuid`: Unique ID generation
- `@types/ws`: TypeScript types for ws
- `@types/uuid`: TypeScript types for uuid

## License

MIT
