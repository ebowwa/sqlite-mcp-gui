import { beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

// Clean up test databases before and after each test
const testDbPath = join(process.cwd(), 'test.db');

beforeEach(() => {
  // Clean up before each test
  if (existsSync(testDbPath)) {
    try {
      unlinkSync(testDbPath);
    } catch (error) {
      // Ignore errors if file is locked
    }
  }
});

afterEach(() => {
  // Clean up after each test
  if (existsSync(testDbPath)) {
    try {
      unlinkSync(testDbPath);
    } catch (error) {
      // Ignore errors if file is locked
    }
  }
});
