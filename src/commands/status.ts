import chalk from 'chalk';
import { Store } from '../core/store.js';
import { getDbPath } from '../utils/config.js';
import { getCurrentProject } from '../utils/project-context.js';
import type { IssueStatus, StatusOptions } from '../types/index.js';

export async function showStatus(options: StatusOptions): Promise<void> {
  const store = new Store(getDbPath());

  try {
    // Determine project filter
    let projectId: string | undefined;
    let projectName: string | undefined;

    if (options.all) {
      // --all flag: show stats across all projects
      projectId = undefined;
    } else {
      // Default: use current project context
      const currentProject = getCurrentProject();
      if (currentProject) {
        projectId = currentProject.id;
        projectName = currentProject.name;
      }
      // If no project context, show all stats (backwards compatible)
    }

    const stats = store.getStats(projectId);

    if (options.json) {
      console.log(JSON.stringify({ ...stats, projectId, projectName }, null, 2));
      return;
    }

    console.log(chalk.bold('\n📊 Claude-Flow Status\n'));

    // Show project context
    if (!options.all && !projectId) {
      console.log(chalk.dim('Showing all issues. Run "claude-flow project init" to scope to this repository.'));
    } else if (projectName) {
      console.log(`Project: ${chalk.cyan(projectName)}`);
    }

    // Total
    console.log(`Total issues: ${chalk.cyan(stats.total)}`);
    console.log('');

    // By status
    console.log(chalk.bold('By Status:'));

    const statusOrder: IssueStatus[] = ['draft', 'refining', 'feedback', 'ready', 'exported', 'archived'];
    const statusColors: Record<IssueStatus, (s: string) => string> = {
      draft: chalk.yellow,
      refining: chalk.blue,
      feedback: chalk.magenta,
      ready: chalk.green,
      exported: chalk.cyan,
      archived: chalk.gray,
    };

    const maxCount = Math.max(...Object.values(stats.byStatus), 1);
    const barWidth = 30;

    for (const status of statusOrder) {
      const count = stats.byStatus[status];
      const bar = '█'.repeat(Math.round((count / maxCount) * barWidth));
      const color = statusColors[status];

      console.log(`  ${padRight(status, 12)} ${color(bar)} ${count}`);
    }

    // Quick commands hint
    console.log(chalk.dim('\nCommands:'));
    console.log(chalk.dim('  claude-flow issue list          List all issues'));
    console.log(chalk.dim('  claude-flow issue create <t>    Create a new issue'));
    console.log(chalk.dim('  claude-flow serve               Start web UI'));
    if (!projectName) {
      console.log(chalk.dim('  claude-flow project init        Initialize project'));
    }
  } finally {
    store.close();
  }
}

function padRight(str: string, len: number): string {
  return str + ' '.repeat(Math.max(0, len - str.length));
}
