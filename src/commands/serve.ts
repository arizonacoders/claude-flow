import { startServer } from '../server/index.js';
import type { ServeOptions } from '../types/index.js';

export async function serve(options: ServeOptions): Promise<void> {
  const port = options.port || 3010;
  const host = options.host || 'localhost';

  console.log('Starting Claude-Flow server...\n');

  await startServer({ port, host });

  // Keep the process running
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    process.exit(0);
  });
}
