import type { IssueStatus } from '../types/index.js';

/**
 * Configuration for a status trigger
 */
export interface StatusTrigger {
  command: string;
  description: string;
  nextStatus?: IssueStatus;
  allowedTools?: string[];
}

/**
 * State for a single issue being tracked
 */
export interface IssueState {
  lastStatus: IssueStatus;
  lastProcessed: Date;
  activeProcess?: number; // PID of spawned Claude
}

/**
 * Watcher state persisted to disk
 */
export interface WatcherState {
  issues: Record<string, IssueState>;
  startedAt: Date;
  lastPoll: Date;
}

/**
 * Options for the watcher
 */
export interface WatcherOptions {
  interval: number;      // Poll interval in seconds
  projectDir: string;    // Working directory for Claude
  maxConcurrent: number; // Max concurrent Claude processes
  stateFile: string;     // Path to state file
  daemon: boolean;       // Run as daemon
}

/**
 * Result of spawning a Claude process
 */
export interface SpawnResult {
  pid: number;
  command: string;
  issueNumber: number;
}
