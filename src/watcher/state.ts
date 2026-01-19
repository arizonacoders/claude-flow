import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { IssueStatus } from '../types/index.js';
import type { WatcherState, IssueState } from './types.js';

/**
 * Manages watcher state persistence
 */
export class StateTracker {
  private state: WatcherState;
  private stateFile: string;

  constructor(stateFile: string) {
    this.stateFile = stateFile;
    this.state = this.load();
  }

  /**
   * Load state from disk or create fresh state
   */
  private load(): WatcherState {
    if (existsSync(this.stateFile)) {
      try {
        const data = readFileSync(this.stateFile, 'utf-8');
        const parsed = JSON.parse(data);
        return {
          issues: parsed.issues || {},
          startedAt: new Date(parsed.startedAt),
          lastPoll: new Date(parsed.lastPoll),
        };
      } catch {
        // Corrupted state file, start fresh
      }
    }

    return {
      issues: {},
      startedAt: new Date(),
      lastPoll: new Date(),
    };
  }

  /**
   * Save state to disk
   */
  save(): void {
    const dir = dirname(this.stateFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  /**
   * Get state for an issue
   */
  getIssueState(issueId: string): IssueState | undefined {
    return this.state.issues[issueId];
  }

  /**
   * Update state for an issue
   */
  setIssueState(issueId: string, status: IssueStatus, pid?: number): void {
    this.state.issues[issueId] = {
      lastStatus: status,
      lastProcessed: new Date(),
      activeProcess: pid,
    };
    this.save();
  }

  /**
   * Clear the active process for an issue
   */
  clearActiveProcess(issueId: string): void {
    const issueState = this.state.issues[issueId];
    if (issueState) {
      delete issueState.activeProcess;
      this.save();
    }
  }

  /**
   * Check if an issue has an active process
   */
  hasActiveProcess(issueId: string): boolean {
    const issueState = this.state.issues[issueId];
    return issueState?.activeProcess !== undefined;
  }

  /**
   * Check if status changed since last processing
   */
  hasStatusChanged(issueId: string, currentStatus: IssueStatus): boolean {
    const issueState = this.state.issues[issueId];
    if (!issueState) return true;
    return issueState.lastStatus !== currentStatus;
  }

  /**
   * Update last poll time
   */
  updateLastPoll(): void {
    this.state.lastPoll = new Date();
    this.save();
  }

  /**
   * Get all tracked issue IDs
   */
  getTrackedIssueIds(): string[] {
    return Object.keys(this.state.issues);
  }

  /**
   * Get issues with active processes
   */
  getActiveProcesses(): Array<{ issueId: string; pid: number }> {
    return Object.entries(this.state.issues)
      .filter(([, state]) => state.activeProcess !== undefined)
      .map(([issueId, state]) => ({
        issueId,
        pid: state.activeProcess!,
      }));
  }

  /**
   * Get watcher stats
   */
  getStats(): {
    startedAt: Date;
    lastPoll: Date;
    trackedIssues: number;
    activeProcesses: number;
  } {
    return {
      startedAt: this.state.startedAt,
      lastPoll: this.state.lastPoll,
      trackedIssues: Object.keys(this.state.issues).length,
      activeProcesses: this.getActiveProcesses().length,
    };
  }

  /**
   * Reset state (for testing or fresh start)
   */
  reset(): void {
    this.state = {
      issues: {},
      startedAt: new Date(),
      lastPoll: new Date(),
    };
    this.save();
  }
}
