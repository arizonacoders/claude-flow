import chalk from 'chalk';
import { createWatcher, Watcher } from '../watcher/index.js';
import { getCurrentProject } from '../utils/project-context.js';

export interface WatchOptions {
  interval?: number;
  maxConcurrent?: number;
  status?: boolean;
  daemon?: boolean;
}

let activeWatcher: Watcher | null = null;

/**
 * Start the watcher
 */
export async function startWatch(options: WatchOptions): Promise<void> {
  // Status check
  if (options.status) {
    showStatus();
    return;
  }

  // Check project context
  const currentProject = getCurrentProject();
  if (!currentProject) {
    console.log(chalk.yellow('⚠️  No project context found.'));
    console.log(chalk.dim('Run "claude-flow project init" to initialize a project first.'));
    console.log('');
    console.log(chalk.dim('The watcher will start anyway, but will monitor all issues.'));
    console.log('');
  }

  // Create and start watcher
  activeWatcher = createWatcher({
    interval: options.interval,
    maxConcurrent: options.maxConcurrent,
    daemon: options.daemon,
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.dim('\nReceived SIGINT, shutting down...'));
    activeWatcher?.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log(chalk.dim('\nReceived SIGTERM, shutting down...'));
    activeWatcher?.stop();
    process.exit(0);
  });

  console.log(chalk.bold('\n🔍 Claude-Flow Watcher\n'));

  if (currentProject) {
    console.log(`Project: ${chalk.cyan(currentProject.name)}`);
    console.log(`Path: ${chalk.dim(currentProject.gitPath || 'N/A')}`);
    console.log('');
  }

  console.log(chalk.dim('Watching for status changes...'));
  console.log(chalk.dim('Press Ctrl+C to stop.\n'));

  // Start the watcher
  activeWatcher.start();

  // Keep process alive
  if (!options.daemon) {
    // In foreground mode, just keep running
    await new Promise(() => {}); // Never resolves, keeps process alive
  }
}

/**
 * Show watcher status
 */
function showStatus(): void {
  if (!activeWatcher) {
    // Try to read state file directly
    const { StateTracker } = require('../watcher/state.js');
    const stateFile = process.env.HOME + '/.claude-flow/watcher-state.json';

    try {
      const state = new StateTracker(stateFile);
      const stats = state.getStats();

      console.log(chalk.bold('\n📊 Watcher Status\n'));
      console.log(`Started: ${chalk.dim(stats.startedAt.toISOString())}`);
      console.log(`Last poll: ${chalk.dim(stats.lastPoll.toISOString())}`);
      console.log(`Tracked issues: ${chalk.cyan(stats.trackedIssues)}`);
      console.log(`Active processes: ${chalk.cyan(stats.activeProcesses)}`);

      const activeProcesses = state.getActiveProcesses();
      if (activeProcesses.length > 0) {
        console.log(chalk.bold('\nActive Processes:'));
        for (const { issueId, pid } of activeProcesses) {
          console.log(`  ${chalk.dim(issueId.slice(0, 8))} → PID ${chalk.cyan(pid)}`);
        }
      }
    } catch {
      console.log(chalk.yellow('No watcher state found.'));
      console.log(chalk.dim('Run "claude-flow watch" to start the watcher.'));
    }

    return;
  }

  const status = activeWatcher.getStatus();

  console.log(chalk.bold('\n📊 Watcher Status\n'));
  console.log(`Running: ${status.running ? chalk.green('yes') : chalk.red('no')}`);
  console.log(`Started: ${chalk.dim(status.stats.startedAt.toISOString())}`);
  console.log(`Last poll: ${chalk.dim(status.stats.lastPoll.toISOString())}`);
  console.log(`Tracked issues: ${chalk.cyan(status.stats.trackedIssues)}`);
  console.log(`Active processes: ${chalk.cyan(status.stats.activeProcesses)}`);

  if (status.activeProcesses.length > 0) {
    console.log(chalk.bold('\nActive Processes:'));
    for (const { issueId, pid, running } of status.activeProcesses) {
      const statusIcon = running ? chalk.green('●') : chalk.red('○');
      console.log(`  ${statusIcon} ${chalk.dim(issueId.slice(0, 8))} → PID ${chalk.cyan(pid)}`);
    }
  }
}

/**
 * Stop the active watcher (if any)
 */
export function stopWatch(): void {
  if (activeWatcher) {
    activeWatcher.stop();
    activeWatcher = null;
  }
}
