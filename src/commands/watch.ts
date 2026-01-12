import { spawn } from 'child_process';
import { StateStore } from '../core/state-store.js';
import { SessionManager } from '../core/session-manager.js';
import { GitHubMonitor } from '../core/github-monitor.js';
import { loadConfig } from '../utils/config.js';
import { logger, setLogLevel } from '../utils/logger.js';
import type { WatchOptions } from '../types/index.js';

export async function watchStatus(options: WatchOptions): Promise<void> {
  if (options.daemon) {
    spawnDaemon();
    return;
  }

  setLogLevel('info');

  const projectPath = process.cwd();
  const config = loadConfig(projectPath);

  // Override poll interval if specified
  if (options.pollInterval) {
    config.monitor.pollInterval = options.pollInterval;
  }

  const store = new StateStore();
  const sessionManager = new SessionManager(store);
  const monitor = new GitHubMonitor(store, sessionManager, config);

  // Set up event handlers
  monitor.on('statusChange', (issueNumber, from, to) => {
    logger.info(`Issue #${issueNumber}: ${from || 'unknown'} → ${to}`);
  });

  monitor.on('resumeTriggered', (session, trigger, status) => {
    logger.info(`Auto-resuming session ${session.id.slice(0, 8)}`);
    logger.info(`  Triggered by: #${trigger} → ${status}`);
  });

  monitor.on('error', (error) => {
    logger.error('Monitor error', { error: error.message });
  });

  // Handle shutdown
  const shutdown = () => {
    logger.info('Shutting down...');
    monitor.stop();
    store.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('Starting GitHub monitor...');
  logger.info(`Poll interval: ${config.monitor.pollInterval}s`);
  logger.info('Press Ctrl+C to stop\n');

  await monitor.start();

  // Keep the process running
  await new Promise(() => {});
}

function spawnDaemon(): void {
  // Get the current script arguments without --daemon
  const args = process.argv.slice(2).filter((arg) => arg !== '--daemon');

  const child = spawn(process.argv[0], [process.argv[1], ...args], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  console.log(`Monitor daemon started (PID: ${child.pid})`);
  console.log('Use "claude-flow status" to check for active sessions');
  process.exit(0);
}
