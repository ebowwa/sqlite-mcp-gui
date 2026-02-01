# WebSocket Server Integration Guide

This guide explains how to integrate the WebSocket server with the SQLite MCP GUI application.

## Quick Start

### 1. Install Dependencies

```bash
npm install @types/uuid
```

### 2. Basic Integration

#### Option A: Standalone WebSocket Server

Create a standalone WebSocket server that runs alongside your main server:

```typescript
// src/websocket-standalone.ts
import { createWebSocketServer } from './websocket/index.js';

const wsServer = createWebSocketServer({
  port: 3001,
  path: '/ws',
  heartbeatInterval: 30000,
  maxConnections: 100,
});

// Example: Broadcast query progress
wsServer.notifyQueryProgress({
  queryId: 'query-123',
  progress: 50,
  message: 'Processing...',
  rowCount: 5000,
});

export default wsServer;
```

#### Option B: Express Integration

Integrate with your existing Express server:

```typescript
// src/ui/server.ts (or your main server file)
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

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});

// Export wsServer for use in other modules
export { wsServer };
```

### 3. Using WebSocket Events in Your Application

#### Query Progress Updates

```typescript
// In your query handler
import { wsServer } from './server.js';

async function executeQuery(sql: string) {
  const queryId = `query-${Date.now()}`;

  // Notify query started
  wsServer.notifyQueryStarted({
    queryId,
    sql,
    timestamp: Date.now(),
  });

  try {
    // Execute query...
    const results = await db.exec(sql);

    // Notify progress (for long-running queries)
    wsServer.notifyQueryProgress({
      queryId,
      progress: 100,
      message: 'Complete',
      rowCount: results.length,
    });

    // Notify complete
    wsServer.notifyQueryComplete({
      queryId,
      rowCount: results.length,
      duration: Date.now() - startTime,
      results,
    });

    return results;
  } catch (error) {
    // Notify error
    wsServer.notifyQueryError({
      queryId,
      error: error.message,
    });
    throw error;
  }
}
```

#### Table Change Notifications

```typescript
// In your table management handler
import { wsServer } from './server.js';

async function createTable(tableName: string, schema: any) {
  // Create table...
  await db.createTable(tableName, schema);

  // Notify all connected clients
  wsServer.notifyTableCreated({
    tableName,
    userId: getUserIdFromRequest(),
    timestamp: Date.now(),
    changes: {
      columns: Object.keys(schema),
    },
  });
}

async function dropTable(tableName: string) {
  // Drop table...
  await db.dropTable(tableName);

  // Notify all connected clients
  wsServer.notifyTableDropped({
    tableName,
    userId: getUserIdFromRequest(),
    timestamp: Date.now(),
  });
}
```

#### Broadcasting Custom Messages

```typescript
// Broadcast to specific channel
wsServer.broadcastToChannel('notifications', {
  type: 'custom:event',
  channel: 'notifications',
  data: {
    message: 'Database backup completed',
    timestamp: Date.now(),
  },
});

// Broadcast to all clients
wsServer.broadcast({
  type: 'system:maintenance',
  channel: 'notifications',
  data: {
    message: 'System maintenance in 5 minutes',
  },
});
```

### 4. Client-Side Integration

Create a client to connect to the WebSocket server:

```typescript
// client/websocket-client.ts
import { createWebSocketClient, MessageType, Channel } from './websocket-client.js';

const wsClient = createWebSocketClient({
  url: 'ws://localhost:3000/ws',
  autoReconnect: true,
  reconnectInterval: 3000,
});

// Connect to server
wsClient.connect();

// Listen for query progress
wsClient.on(MessageType.QUERY_PROGRESS, (data) => {
  console.log('Query progress:', data.progress);
  updateProgressBar(data.progress);
});

// Listen for table changes
wsClient.on(MessageType.TABLE_CREATED, (data) => {
  console.log('Table created:', data.tableName);
  refreshTableList();
});

// Listen for user events
wsClient.on(MessageType.USER_JOINED, (data) => {
  console.log(`${data.username} joined the session`);
  updateUserList(data.connectedUsers);
});

// Send cursor position
wsClient.send({
  type: MessageType.USER_CURSOR,
  channel: Channel.COLLABORATION,
  data: {
    table: 'users',
    row: 5,
    column: 'name',
  },
});
```

### 5. API Endpoints for WebSocket Status

Add endpoints to check WebSocket status:

```typescript
// Get connected clients count
app.get('/api/ws/status', (req, res) => {
  res.json({
    connectedClients: wsServer.getClientCount(),
    uptime: process.uptime(),
  });
});

// Broadcast notification to all clients
app.post('/api/ws/broadcast', (req, res) => {
  const { message } = req.body;

  wsServer.broadcastToChannel('notifications', {
    type: 'notification',
    channel: 'notifications',
    data: {
      message,
      timestamp: Date.now(),
    },
  });

  res.json({ success: true });
});
```

## Message Flow Diagram

```
Client                    WebSocket Server                  Application
  |                               |                              |
  |-- connect ------------------->|                              |
  |<-- connection:ack ------------|                              |
  |                               |                              |
  |-- query:start -------------->|-- notifyQueryStarted --------->|
  |                               |                              |
  |                               |<- notifyQueryProgress -------|
  |<-- query:progress ------------|                              |
  |                               |                              |
  |                               |<- notifyQueryComplete -------|
  |<-- query:complete ------------|                              |
  |                               |                              |
  |                               |<- notifyTableCreated --------|
  |<-- table:created -------------|                              |
```

## Channel Subscription

Clients automatically subscribe to the `notifications` channel on connect. To subscribe to additional channels:

```typescript
// On the client side
wsClient.send({
  type: 'subscribe',
  channel: 'queries',
  data: {},
});

wsClient.send({
  type: 'subscribe',
  channel: 'tables',
  data: {},
});
```

## Error Handling

The server includes built-in error handling:

```typescript
// Server automatically handles:
- Invalid message format
- Connection limit exceeded
- Stale connections (via heartbeat)
- Malformed JSON
- WebSocket protocol errors

// Error response format:
{
  "id": "msg-123",
  "timestamp": 1738454400000,
  "type": "error",
  "channel": "notifications",
  "data": {
    "message": "Invalid message format",
    "code": "INVALID_FORMAT"
  }
}
```

## Testing

Test your WebSocket integration:

```bash
# Start the server
npm run build
npm start

# Test with wscat
npm install -g wscat
wscat -c ws://localhost:3000/ws

# Send a test message
> {"type":"heartbeat","channel":"notifications","data":{"timestamp":1738454400000}}
```

## Production Considerations

1. **Authentication**: Add JWT token verification in the connection handler
2. **Rate Limiting**: Implement message rate limiting per client
3. **Message Queue**: Use Redis for multi-server deployments
4. **Monitoring**: Add metrics for connection counts, message throughput
5. **Scaling**: Consider using Redis Pub/Sub for horizontal scaling

## Troubleshooting

### Connection Issues
- Check firewall settings
- Verify WebSocket path matches client URL
- Ensure port is not already in use

### Message Not Received
- Verify client is subscribed to the correct channel
- Check message format matches expected schema
- Enable debug logging on server

### Performance Issues
- Adjust heartbeat interval
- Implement message batching
- Consider using binary messages for large payloads
