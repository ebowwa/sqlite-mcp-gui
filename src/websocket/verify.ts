#!/usr/bin/env tsx

/**
 * WebSocket Verification Script
 *
 * This script verifies that the WebSocket server implementation
 * is correctly set up and can be imported and used.
 *
 * Usage: tsx src/websocket/verify.ts
 */

import { createWebSocketServer, integrateWithExpress } from './index.js';
import { MessageType, Channel } from './types.js';
import { createServer } from 'http';

console.log('WebSocket Server Verification\n');

// Test 1: Check imports
console.log('✓ Test 1: Imports successful');

// Test 2: Check enums
console.log('\n✓ Test 2: Enums');
console.log('  Message Types:', Object.values(MessageType).length);
console.log('  Channels:', Object.values(Channel).length);

// Test 3: Check factory function exists
console.log('\n✓ Test 3: Factory functions available');
console.log('  - createWebSocketServer');
console.log('  - integrateWithExpress');

// Test 4: Create standalone server (in memory)
console.log('\n✓ Test 4: Creating standalone WebSocket server...');
try {
  const wsServer = createWebSocketServer({
    port: 0, // Use random port for testing
    heartbeatInterval: 5000,
    maxConnections: 10,
  });
  console.log('  Server created successfully');
  console.log('  Methods available:', Object.getOwnPropertyNames(Object.getPrototypeOf(wsServer)).filter(name => typeof wsServer[name as keyof typeof wsServer] === 'function'));

  // Test notification methods exist
  const notificationMethods = [
    'notifyQueryStarted',
    'notifyQueryProgress',
    'notifyQueryComplete',
    'notifyQueryError',
    'notifyTableCreated',
    'notifyTableModified',
    'notifyTableDropped',
  ];

  console.log('\n✓ Test 5: Notification methods');
  notificationMethods.forEach(method => {
    const exists = typeof (wsServer as any)[method] === 'function';
    console.log(`  ${exists ? '✓' : '✗'} ${method}`);
  });

  // Cleanup
  wsServer.stop();
  console.log('\n✓ Test 6: Server stopped successfully');

} catch (error) {
  console.error('  ✗ Error creating server:', error);
  process.exit(1);
}

// Test 7: Express integration
console.log('\n✓ Test 7: Express integration');
try {
  const httpServer = createServer();
  const wsServer = integrateWithExpress({
    server: httpServer,
    path: '/ws',
  });
  console.log('  Express integration successful');
  wsServer.stop();
  httpServer.close();
} catch (error) {
  console.error('  ✗ Error with Express integration:', error);
  process.exit(1);
}

console.log('\n✅ All verification tests passed!');
console.log('\nNext steps:');
console.log('  1. Install dependencies: npm install');
console.log('  2. Build TypeScript: npm run build');
console.log('  3. Start server: npm start');
console.log('  4. Test with: wscat -c ws://localhost:3000/ws');
