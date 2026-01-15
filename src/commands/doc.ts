import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { Store } from '../core/store.js';
import { getDbPath } from '../utils/config.js';

export async function manageDoc(
  issueId: string,
  options: { add?: string; title?: string; remove?: string; list?: boolean }
): Promise<void> {
  const store = new Store(getDbPath());

  try {
    // Validate issue exists
    const issue = store.getIssue(issueId);
    if (!issue) {
      console.error(chalk.red(`Error: Issue '${issueId}' not found`));
      process.exit(1);
    }

    // Use resolved full ID
    const resolvedIssueId = issue.id;

    if (options.list || (!options.add && !options.remove)) {
      // List docs
      const docs = store.getDocLinksForIssue(resolvedIssueId);

      if (docs.length === 0) {
        console.log(chalk.dim('No documents linked to this issue.'));
        return;
      }

      console.log(chalk.bold(`Documents for issue ${chalk.cyan(issueId.slice(0, 8))}:`));
      console.log('');

      for (const doc of docs) {
        const exists = existsSync(doc.filePath);
        const statusIcon = exists ? chalk.green('✓') : chalk.red('✗');
        const title = doc.title ? `"${doc.title}"` : '';

        console.log(`  ${statusIcon} ${chalk.dim(doc.id.slice(0, 8))} ${chalk.blue(doc.filePath)} ${title}`);
        if (!exists) {
          console.log(chalk.red(`    File not found`));
        }
      }
    } else if (options.add) {
      // Add doc link
      const filePath = options.add;

      // Warn if file doesn't exist (but allow it)
      if (!existsSync(filePath)) {
        console.log(chalk.yellow(`Warning: File '${filePath}' does not exist yet`));
      }

      const doc = store.createDocLink({
        issueId: resolvedIssueId,
        filePath,
        title: options.title,
      });

      console.log(chalk.green('Linked document:'));
      console.log(`  ID: ${chalk.dim(doc.id.slice(0, 8))}`);
      console.log(`  Path: ${chalk.blue(doc.filePath)}`);
      if (doc.title) {
        console.log(`  Title: ${doc.title}`);
      }
    } else if (options.remove) {
      // Remove doc link
      const docId = options.remove;

      // Try to find the doc (could be full ID or partial)
      const docs = store.getDocLinksForIssue(resolvedIssueId);
      const doc = docs.find((d) => d.id === docId || d.id.startsWith(docId));

      if (!doc) {
        console.error(chalk.red(`Error: Document link '${docId}' not found`));
        process.exit(1);
      }

      const deleted = store.deleteDocLink(doc.id);
      if (deleted) {
        console.log(chalk.green(`Removed document link: ${chalk.blue(doc.filePath)}`));
      }
    }
  } finally {
    store.close();
  }
}

export async function getDocContent(docId: string): Promise<string | null> {
  const store = new Store(getDbPath());

  try {
    const doc = store.getDocLink(docId);
    if (!doc) {
      return null;
    }

    if (!existsSync(doc.filePath)) {
      return null;
    }

    return readFileSync(doc.filePath, 'utf-8');
  } finally {
    store.close();
  }
}
