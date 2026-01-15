import { join } from 'path';
import type { AppConfig } from '../types/index.js';

const DEFAULT_CONFIG: AppConfig = {
  server: {
    port: 3000,
    host: 'localhost',
  },
  dbPath: getDbPath(),
};

export function getDataDir(): string {
  // Store data in user's home directory under .claude-flow
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return join(home, '.claude-flow', 'data');
}

export function getDbPath(): string {
  return join(getDataDir(), 'claude-flow.db');
}

export function getConfig(): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    dbPath: getDbPath(),
  };
}
