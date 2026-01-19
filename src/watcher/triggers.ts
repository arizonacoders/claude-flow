import type { IssueStatus } from '../types/index.js';
import type { StatusTrigger } from './types.js';

/**
 * Status triggers define what command to run when an issue enters a specific status
 */
export const STATUS_TRIGGERS: Partial<Record<IssueStatus, StatusTrigger>> = {
  draft: {
    command: '/refinement:refine-issue',
    description: 'Starting refinement workshop',
    nextStatus: 'refining',
    allowedTools: 'Read,Glob,Grep,Bash,Task',
  },
  ready: {
    command: '/refinement:export-to-github',
    description: 'Exporting to GitHub',
    nextStatus: 'exported',
    allowedTools: 'Read,Glob,Grep,Bash',
  },
};

/**
 * Get the trigger for a given status, if any
 */
export function getTrigger(status: IssueStatus): StatusTrigger | undefined {
  return STATUS_TRIGGERS[status];
}

/**
 * Check if a status has a trigger
 */
export function hasTrigger(status: IssueStatus): boolean {
  return status in STATUS_TRIGGERS;
}

/**
 * Get all statuses that have triggers
 */
export function getTriggeredStatuses(): IssueStatus[] {
  return Object.keys(STATUS_TRIGGERS) as IssueStatus[];
}
