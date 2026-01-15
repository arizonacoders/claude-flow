import chalk from 'chalk';
import { Store } from '../core/store.js';
import { getDbPath } from '../utils/config.js';
import type { IssueStatus } from '../types/index.js';

// Define valid status transitions
const validTransitions: Record<IssueStatus, IssueStatus[]> = {
  'draft': ['arch-review', 'archived'],
  'arch-review': ['draft', 'test-design', 'archived'],
  'test-design': ['arch-review', 'ready', 'archived'],
  'ready': ['test-design', 'archived'],
  'archived': ['draft'],
};

const statusOrder: IssueStatus[] = ['draft', 'arch-review', 'test-design', 'ready'];

const statusLabels: Record<IssueStatus, string> = {
  'draft': 'Draft',
  'arch-review': 'Architectural Review',
  'test-design': 'Test Case Design',
  'ready': 'Ready',
  'archived': 'Archived',
};

export async function workflowNext(
  id: string,
  options: { json?: boolean }
): Promise<void> {
  const store = new Store(getDbPath());

  try {
    const issue = store.getIssue(id);
    if (!issue) {
      if (options.json) {
        console.log(JSON.stringify({ error: `Issue '${id}' not found` }));
      } else {
        console.error(chalk.red(`Error: Issue '${id}' not found`));
      }
      process.exit(1);
    }

    const currentIndex = statusOrder.indexOf(issue.status);
    if (currentIndex === -1 || currentIndex >= statusOrder.length - 1) {
      if (options.json) {
        console.log(JSON.stringify({
          error: `Issue is at '${issue.status}' - no next stage`,
          issue: issue
        }));
      } else {
        console.error(chalk.yellow(`Issue #${issue.number} is at '${issue.status}' - no next stage`));
      }
      process.exit(1);
    }

    const nextStatus = statusOrder[currentIndex + 1];
    const updated = store.updateIssue(issue.id, { status: nextStatus });

    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        previousStatus: issue.status,
        newStatus: nextStatus,
        issue: updated
      }));
    } else {
      console.log(chalk.green(`Advanced issue #${issue.number}`));
      console.log(`  ${chalk.yellow(statusLabels[issue.status])} → ${chalk.green(statusLabels[nextStatus])}`);
    }
  } finally {
    store.close();
  }
}

export async function workflowSet(
  id: string,
  status: string,
  options: { json?: boolean; force?: boolean }
): Promise<void> {
  const store = new Store(getDbPath());

  try {
    const issue = store.getIssue(id);
    if (!issue) {
      if (options.json) {
        console.log(JSON.stringify({ error: `Issue '${id}' not found` }));
      } else {
        console.error(chalk.red(`Error: Issue '${id}' not found`));
      }
      process.exit(1);
    }

    const targetStatus = status as IssueStatus;
    if (!statusLabels[targetStatus]) {
      if (options.json) {
        console.log(JSON.stringify({ error: `Invalid status '${status}'` }));
      } else {
        console.error(chalk.red(`Error: Invalid status '${status}'`));
        console.error(`Valid statuses: ${Object.keys(statusLabels).join(', ')}`);
      }
      process.exit(1);
    }

    // Check if transition is valid (unless forced)
    if (!options.force && !validTransitions[issue.status].includes(targetStatus)) {
      if (options.json) {
        console.log(JSON.stringify({
          error: `Invalid transition from '${issue.status}' to '${targetStatus}'`,
          validTransitions: validTransitions[issue.status]
        }));
      } else {
        console.error(chalk.red(`Invalid transition: ${issue.status} → ${targetStatus}`));
        console.error(`Valid transitions from '${issue.status}': ${validTransitions[issue.status].join(', ')}`);
        console.error(chalk.dim('Use --force to override'));
      }
      process.exit(1);
    }

    const updated = store.updateIssue(issue.id, { status: targetStatus });

    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        previousStatus: issue.status,
        newStatus: targetStatus,
        issue: updated
      }));
    } else {
      console.log(chalk.green(`Updated issue #${issue.number}`));
      console.log(`  ${chalk.yellow(statusLabels[issue.status])} → ${chalk.green(statusLabels[targetStatus])}`);
    }
  } finally {
    store.close();
  }
}

export async function workflowStatus(options: { json?: boolean }): Promise<void> {
  const store = new Store(getDbPath());

  try {
    const issues = store.getAllIssues();

    const byStatus: Record<IssueStatus, typeof issues> = {
      'draft': [],
      'arch-review': [],
      'test-design': [],
      'ready': [],
      'archived': [],
    };

    for (const issue of issues) {
      byStatus[issue.status].push(issue);
    }

    if (options.json) {
      console.log(JSON.stringify({
        pipeline: statusOrder.map(status => ({
          status,
          label: statusLabels[status],
          count: byStatus[status].length,
          issues: byStatus[status].map(i => ({ id: i.id, number: i.number, title: i.title }))
        })),
        archived: {
          status: 'archived',
          label: statusLabels['archived'],
          count: byStatus['archived'].length
        }
      }));
      return;
    }

    console.log(chalk.bold('\nWorkflow Pipeline\n'));
    console.log(statusOrder.map(s => `[${statusLabels[s]}]`).join(' → '));
    console.log('');

    for (const status of statusOrder) {
      const count = byStatus[status].length;
      const label = statusLabels[status];
      console.log(chalk.bold(`${label} (${count})`));

      if (count > 0) {
        for (const issue of byStatus[status]) {
          console.log(`  ${chalk.dim('#' + issue.number)} ${issue.title}`);
        }
      } else {
        console.log(chalk.dim('  (empty)'));
      }
      console.log('');
    }

    if (byStatus['archived'].length > 0) {
      console.log(chalk.dim(`Archived: ${byStatus['archived'].length} issue(s)`));
    }
  } finally {
    store.close();
  }
}
