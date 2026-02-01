/**
 * WebSocket Integration Example
 *
 * This file demonstrates how to integrate the WebSocket server
 * with the SQLite MCP GUI application.
 *
 * @module websocket/example
 */

import express from 'express';
import { createServer } from 'http';
import { integrateWithExpress, type WebSocketServer } from './index.js';

// Example: Integrate WebSocket server with Express
export function setupWebSocketWithExpress(app: express.Application): WebSocketServer {
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

  // Example: Notify query progress
  app.post('/api/query', async (req, res) => {
    const { sql } = req.body;
    const queryId = `query-${Date.now()}`;

    // Notify query started
    wsServer.notifyQueryStarted({
      queryId,
      sql,
      timestamp: Date.now(),
    });

    try {
      // Simulate query execution
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        wsServer.notifyQueryProgress({
          queryId,
          progress: i,
          message: `Processing ${i}%`,
        });
      }

      // Notify query complete
      wsServer.notifyQueryComplete({
        queryId,
        rowCount: 1000,
        duration: 1000,
      });

      res.json({ queryId, rowCount: 1000 });
    } catch (error) {
      // Notify query error
      wsServer.notifyQueryError({
        queryId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Query failed' });
    }
  });

  // Example: Notify table changes
  app.post('/api/tables', async (req, res) => {
    const { name, action } = req.body;

    // Notify table change
    switch (action) {
      case 'create':
        wsServer.notifyTableCreated({
          tableName: name,
          userId: 'user-123',
          timestamp: Date.now(),
        });
        break;
      case 'modify':
        wsServer.notifyTableModified({
          tableName: name,
          userId: 'user-123',
          timestamp: Date.now(),
        });
        break;
      case 'drop':
        wsServer.notifyTableDropped({
          tableName: name,
          userId: 'user-123',
          timestamp: Date.now(),
        });
        break;
    }

    res.json({ success: true });
  });

  // Example: Get connected clients
  app.get('/api/clients', (req, res) => {
    res.json({
      count: wsServer.getClientCount(),
    });
  });

  return wsServer;
}

// Example: Standalone WebSocket server
export function createStandaloneWebSocketServer() {
  const { createWebSocketServer } = require('./index.js');

  const wsServer = createWebSocketServer({
    port: 3001,
    path: '/ws',
    heartbeatInterval: 30000,
    maxConnections: 100,
  });

  console.log('Standalone WebSocket server created');

  return wsServer;
}

// Usage example:
/*
import express from 'express';
import { setupWebSocketWithExpress } from './websocket/example.js';

const app = express();
app.use(express.json());

const wsServer = setupWebSocketWithExpress(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
*/
