import chalk from 'chalk';
import { StateStore } from '../core/state-store.js';
import { setJsonMode } from '../utils/logger.js';
import type { Session, SessionStatus } from '../types/index.js';

interface StatusOptions {
  json?: boolean;
}

export async function showStatus(issueNumber: number | undefined, options: StatusOptions): Promise<void> {
  if (options.json) {
    setJsonMode(true);
  }

  const store = new StateStore();

  try {
    if (issueNumber) {
      await showIssueStatus(store, issueNumber, options);
    } else {
      await showAllStatus(store, options);
    }
  } finally {
    store.close();
  }
}

async function showIssueStatus(
  store: StateStore,
  issueNumber: number,
  options: StatusOptions
): Promise<void> {
  const sessions = store.getSessionsForIssue(issueNumber);

  if (sessions.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ sessions: [] }));
    } else {
      console.log(`No sessions found for issue #${issueNumber}`);
    }
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({ sessions }));
    return;
  }

  console.log(`\n${chalk.bold(`Sessions for issue #${issueNumber}`)}\n`);
  printSessionsTable(sessions);
}

async function showAllStatus(store: StateStore, options: StatusOptions): Promise<void> {
  const sessions = store.getAllActiveSessions();

  if (options.json) {
    console.log(JSON.stringify({ sessions }));
    return;
  }

  if (sessions.length === 0) {
    console.log('No active sessions');
    return;
  }

  console.log(`\n${chalk.bold('Active Sessions')}\n`);
  printSessionsTable(sessions);
}

function printSessionsTable(sessions: Session[]): void {
  // Header
  console.log(
    chalk.dim(
      `${'ID'.padEnd(10)} ${'Issue'.padEnd(8)} ${'Persona'.padEnd(15)} ${'Status'.padEnd(12)} ${'Resumes'.padEnd(8)} Updated`
    )
  );
  console.log(chalk.dim('─'.repeat(80)));

  // Rows
  for (const session of sessions) {
    const shortId = session.id.slice(0, 8);
    const statusColor = getStatusColor(session.status);
    const updated = formatRelativeTime(session.updatedAt);

    console.log(
      `${shortId.padEnd(10)} ` +
        `${`#${session.issueNumber}`.padEnd(8)} ` +
        `${session.persona.padEnd(15)} ` +
        `${statusColor(session.status.padEnd(12))} ` +
        `${String(session.resumeCount).padEnd(8)} ` +
        `${chalk.dim(updated)}`
    );
  }

  console.log();
}

function getStatusColor(status: SessionStatus): (text: string) => string {
  switch (status) {
    case 'active':
      return chalk.green;
    case 'waiting':
      return chalk.yellow;
    case 'completed':
      return chalk.blue;
    case 'failed':
      return chalk.red;
    case 'aborted':
      return chalk.gray;
    default:
      return chalk.white;
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
