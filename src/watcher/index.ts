import chalk from 'chalk';
import { Store } from '../core/store.js';
import { getDbPath } from '../utils/config.js';
import { getCurrentProject } from '../utils/project-context.js';
import { StateTracker } from './state.js';
import { getTrigger, hasTrigger } from './triggers.js';
import { spawnClaude, isProcessRunning } from './spawner.js';
import type { WatcherOptions } from './types.js';
import type { Issue } from '../types/index.js';

export { StateTracker } from './state.js';
export { getTrigger, hasTrigger, STATUS_TRIGGERS } from './triggers.js';
export { spawnClaude, isProcessRunning, killProcess } from './spawner.js';
export * from './types.js';

/**
 * Main watcher class
 */
export class Watcher {
  private options: WatcherOptions;
  private state: StateTracker;
  private running: boolean = false;
  private pollTimeout: NodeJS.Timeout | null = null;

  constructor(options: WatcherOptions) {
    this.options = options;
    this.state = new StateTracker(options.stateFile);
  }

  /**
   * Start the watcher
   */
  start(): void {
    if (this.running) {
      console.log(chalk.yellow('Watcher is already running'));
      return;
    }

    this.running = true;
    console.log(chalk.green('🔍 Watcher started'));
    console.log(chalk.dim(`  Polling every ${this.options.interval}s`));
    console.log(chalk.dim(`  Project dir: ${this.options.projectDir}`));
    console.log(chalk.dim(`  Max concurrent: ${this.options.maxConcurrent}`));
    console.log('');

    this.poll();
  }

  /**
   * Stop the watcher
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    console.log(chalk.yellow('\n🛑 Watcher stopped'));
  }

  /**
   * Single poll iteration
   */
  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      await this.checkIssues();
      this.state.updateLastPoll();
    } catch (error) {
      console.error(chalk.red('Poll error:'), error);
    }

    // Schedule next poll
    if (this.running) {
      this.pollTimeout = setTimeout(
        () => this.poll(),
        this.options.interval * 1000
      );
    }
  }

  /**
   * Check all issues for status changes
   */
  private async checkIssues(): Promise<void> {
    const store = new Store(getDbPath());

    try {
      // Get current project context
      const currentProject = getCurrentProject();
      const projectId = currentProject?.id;

      // Get all issues for this project
      const issues = store.getAllIssues(undefined, projectId);

      // Check active processes first
      this.cleanupFinishedProcesses();

      // Count active processes
      const activeCount = this.state.getActiveProcesses().length;

      // Process each issue
      for (const issue of issues) {
        // Skip if at max concurrent
        if (activeCount >= this.options.maxConcurrent) {
          break;
        }

        await this.processIssue(issue, store);
      }
    } finally {
      store.close();
    }
  }

  /**
   * Process a single issue
   */
  private async processIssue(issue: Issue, store: Store): Promise<void> {
    // Skip if no trigger for this status
    if (!hasTrigger(issue.status)) {
      return;
    }

    // Skip if status hasn't changed
    if (!this.state.hasStatusChanged(issue.id, issue.status)) {
      return;
    }

    // Skip if already has an active process
    if (this.state.hasActiveProcess(issue.id)) {
      const processes = this.state.getActiveProcesses();
      const activeProcess = processes.find(p => p.issueId === issue.id);
      if (activeProcess && isProcessRunning(activeProcess.pid)) {
        return;
      }
      // Process finished, clear it
      this.state.clearActiveProcess(issue.id);
    }

    const trigger = getTrigger(issue.status);
    if (!trigger) return;

    // Log the action
    console.log(
      chalk.blue(`[#${issue.number}]`),
      chalk.dim(trigger.description)
    );

    // Spawn Claude process
    const result = spawnClaude(
      issue.number,
      trigger,
      this.options.projectDir,
      (code) => {
        console.log(
          chalk.dim(`[#${issue.number}]`),
          code === 0
            ? chalk.green('completed')
            : chalk.red(`exited with code ${code}`)
        );
        this.state.clearActiveProcess(issue.id);
      }
    );

    // Update state
    this.state.setIssueState(issue.id, issue.status, result.pid);

    console.log(
      chalk.dim(`  PID: ${result.pid}`),
      chalk.dim(`Command: ${result.command}`)
    );

    // Update issue status to next status if defined
    if (trigger.nextStatus) {
      store.updateIssue(issue.id, { status: trigger.nextStatus });
      console.log(
        chalk.dim(`  Status: ${issue.status} → ${trigger.nextStatus}`)
      );
    }
  }

  /**
   * Clean up processes that have finished
   */
  private cleanupFinishedProcesses(): void {
    const activeProcesses = this.state.getActiveProcesses();

    for (const { issueId, pid } of activeProcesses) {
      if (!isProcessRunning(pid)) {
        this.state.clearActiveProcess(issueId);
      }
    }
  }

  /**
   * Get watcher status
   */
  getStatus(): {
    running: boolean;
    stats: ReturnType<StateTracker['getStats']>;
    activeProcesses: Array<{ issueId: string; pid: number; running: boolean }>;
  } {
    const activeProcesses = this.state.getActiveProcesses().map((p) => ({
      ...p,
      running: isProcessRunning(p.pid),
    }));

    return {
      running: this.running,
      stats: this.state.getStats(),
      activeProcesses,
    };
  }
}

/**
 * Create a watcher with default options
 */
export function createWatcher(
  overrides: Partial<WatcherOptions> = {}
): Watcher {
  const currentProject = getCurrentProject();

  const defaults: WatcherOptions = {
    interval: 30,
    projectDir: currentProject?.gitPath || process.cwd(),
    maxConcurrent: 3,
    stateFile:
      process.env.HOME + '/.claude-flow/watcher-state.json',
    daemon: false,
  };

  return new Watcher({ ...defaults, ...overrides });
}
