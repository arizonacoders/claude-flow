import chalk from 'chalk';
import { Store } from '../core/store.js';
import { getDbPath } from '../utils/config.js';
import { getCurrentProject, getCurrentProjectId } from '../utils/project-context.js';
import type { IssueStatus, Priority, IssueListOptions, Comment } from '../types/index.js';
import { getPersonaDisplayName } from '../types/index.js';

export async function createIssue(
  title: string,
  options: { description?: string; priority?: string; parent?: string; json?: boolean }
): Promise<void> {
  const store = new Store(getDbPath());

  try {
    // Validate parent exists if provided and resolve to full ID
    let resolvedParentId: string | undefined;
    if (options.parent) {
      const parent = store.getIssue(options.parent);
      if (!parent) {
        if (options.json) {
          console.log(JSON.stringify({ error: `Parent issue '${options.parent}' not found` }));
        } else {
          console.error(chalk.red(`Error: Parent issue '${options.parent}' not found`));
        }
        process.exit(1);
      }
      resolvedParentId = parent.id;
    }

    // Auto-assign current project if in project context
    const currentProjectId = getCurrentProjectId();

    const issue = store.createIssue({
      title,
      description: options.description,
      priority: (options.priority as Priority) || 'medium',
      parentId: resolvedParentId,
      projectId: currentProjectId,
    });

    if (options.json) {
      console.log(JSON.stringify({ success: true, issue }));
      return;
    }

    console.log(chalk.green('Created issue:'));
    console.log(`  ID: ${chalk.cyan(issue.id)}`);
    console.log(`  Number: #${issue.number}`);
    console.log(`  Title: ${issue.title}`);
    console.log(`  Status: ${chalk.yellow(issue.status)}`);
    console.log(`  Priority: ${formatPriority(issue.priority)}`);
    if (issue.parentId) {
      const parent = store.getIssue(issue.parentId);
      console.log(`  Parent: ${chalk.dim(issue.parentId.slice(0, 8))} ${parent?.title || ''}`);
    }
  } finally {
    store.close();
  }
}

export async function listIssues(options: IssueListOptions & { all?: boolean; project?: string }): Promise<void> {
  const store = new Store(getDbPath());

  try {
    // Determine project filter
    let projectId: string | undefined;
    let projectName: string | undefined;

    if (options.all) {
      // --all flag: show all issues across all projects
      projectId = undefined;
    } else if (options.project) {
      // --project flag: filter by specific project name
      const project = store.getProjectByName(options.project) || store.getProject(options.project);
      if (!project) {
        console.error(chalk.red(`Error: Project '${options.project}' not found`));
        process.exit(1);
      }
      projectId = project.id;
      projectName = project.name;
    } else {
      // Default: use current project context
      const currentProject = getCurrentProject();
      if (currentProject) {
        projectId = currentProject.id;
        projectName = currentProject.name;
      }
      // If no project context, show all issues (backwards compatible)
    }

    const issues = store.getAllIssues(options.status, projectId);

    if (options.json) {
      console.log(JSON.stringify(issues, null, 2));
      return;
    }

    // Show project context hint if not filtering all
    if (!options.all && !projectId) {
      console.log(chalk.dim('Showing all issues. Run "claude-flow project init" to scope issues to this repository.\n'));
    } else if (projectName) {
      console.log(chalk.dim(`Project: ${projectName}\n`));
    }

    if (issues.length === 0) {
      console.log(chalk.dim('No issues found.'));
      return;
    }

    // Table header
    console.log(
      chalk.bold(
        padRight('ID', 10) +
          padRight('Title', 35) +
          padRight('Status', 12) +
          padRight('Priority', 10) +
          'Parent'
      )
    );
    console.log(chalk.dim('─'.repeat(80)));

    for (const issue of issues) {
      const id = issue.id.slice(0, 8);
      const title = truncate(issue.title, 33);
      const status = formatStatus(issue.status);
      const priority = formatPriority(issue.priority);
      const parent = issue.parentId ? issue.parentId.slice(0, 8) : '-';

      console.log(
        chalk.dim(padRight(id, 10)) +
          padRight(title, 35) +
          padRight(status, 12) +
          padRight(priority, 10) +
          chalk.dim(parent)
      );
    }

    console.log(chalk.dim(`\n${issues.length} issue(s)`));
  } finally {
    store.close();
  }
}

export async function showIssue(id: string, options: { json?: boolean }): Promise<void> {
  const store = new Store(getDbPath());

  try {
    const issue = store.getIssue(id);

    if (!issue) {
      console.error(chalk.red(`Error: Issue '${id}' not found`));
      process.exit(1);
    }

    // Use resolved full ID for all queries
    const resolvedId = issue.id;
    const children = store.getChildIssues(resolvedId);
    const links = store.getLinksForIssue(resolvedId);
    const docs = store.getDocLinksForIssue(resolvedId);
    const comments = store.getCommentsForIssue(resolvedId);

    if (options.json) {
      const parent = issue.parentId ? store.getIssue(issue.parentId) : undefined;
      console.log(
        JSON.stringify(
          {
            ...issue,
            parent,
            children,
            links,
            docs,
            comments,
          },
          null,
          2
        )
      );
      return;
    }

    // Header
    console.log(chalk.bold('═'.repeat(70)));
    console.log(chalk.bold(`  ISSUE: ${chalk.cyan(issue.id.slice(0, 8))}`));
    console.log(`  Title: ${issue.title}`);
    console.log(`  Status: ${formatStatus(issue.status)}    Priority: ${formatPriority(issue.priority)}`);
    console.log(chalk.bold('═'.repeat(70)));

    // Description
    if (issue.description) {
      console.log('\nDescription:');
      console.log(chalk.dim('  ' + issue.description.split('\n').join('\n  ')));
    }

    // Hierarchy
    if (issue.parentId || children.length > 0) {
      console.log(chalk.dim('\n' + '─'.repeat(70)));
      console.log(chalk.bold('  HIERARCHY'));
      console.log(chalk.dim('─'.repeat(70)));

      if (issue.parentId) {
        const parent = store.getIssue(issue.parentId);
        console.log(`  Parent: ${chalk.dim(issue.parentId.slice(0, 8))} "${parent?.title || 'Unknown'}"`);
      }

      if (children.length > 0) {
        console.log('  Children:');
        for (const child of children) {
          console.log(`    ${chalk.dim('•')} ${chalk.dim(child.id.slice(0, 8))} "${child.title}"`);
        }
      }
    }

    // Links
    if (links.length > 0) {
      console.log(chalk.dim('\n' + '─'.repeat(70)));
      console.log(chalk.bold('  LINKS'));
      console.log(chalk.dim('─'.repeat(70)));

      for (const link of links) {
        const isSource = link.sourceId === id;
        const otherId = isSource ? link.targetId : link.sourceId;
        const otherIssue = store.getIssue(otherId);
        const direction = isSource ? '→' : '←';
        const linkLabel = isSource ? link.linkType : getReverseLinkLabel(link.linkType);

        console.log(
          `  ${chalk.yellow(linkLabel)} ${direction} ${chalk.dim(otherId.slice(0, 8))} "${otherIssue?.title || 'Unknown'}"`
        );
      }
    }

    // Docs
    if (docs.length > 0) {
      console.log(chalk.dim('\n' + '─'.repeat(70)));
      console.log(chalk.bold('  DOCS'));
      console.log(chalk.dim('─'.repeat(70)));

      for (const doc of docs) {
        const title = doc.title || doc.filePath;
        console.log(`  ${chalk.dim('•')} ${chalk.blue(doc.filePath)} ${doc.title ? `"${doc.title}"` : ''}`);
      }
    }

    // Comments (threaded display)
    if (comments.length > 0) {
      console.log(chalk.dim('\n' + '─'.repeat(70)));
      console.log(chalk.bold(`  COMMENTS (${comments.length})`));
      console.log(chalk.dim('─'.repeat(70)));

      // Build comment tree and display
      const tree = buildCommentTree(comments);
      displayCommentTree(tree, 0);
    }

    console.log('');
  } finally {
    store.close();
  }
}

export async function updateIssue(
  id: string,
  options: { title?: string; description?: string; status?: string; priority?: string; parent?: string }
): Promise<void> {
  const store = new Store(getDbPath());

  try {
    const existing = store.getIssue(id);
    if (!existing) {
      console.error(chalk.red(`Error: Issue '${id}' not found`));
      process.exit(1);
    }

    // Resolve parent ID if provided
    let resolvedParentId: string | undefined | null;
    if (options.parent !== undefined) {
      if (options.parent === '' || options.parent === 'none') {
        resolvedParentId = null; // Clear parent
      } else {
        const parent = store.getIssue(options.parent);
        if (!parent) {
          console.error(chalk.red(`Error: Parent issue '${options.parent}' not found`));
          process.exit(1);
        }
        resolvedParentId = parent.id;
      }
    }

    const updated = store.updateIssue(existing.id, {
      title: options.title,
      description: options.description,
      status: options.status as IssueStatus,
      priority: options.priority as Priority,
      parentId: resolvedParentId,
    });

    if (updated) {
      console.log(chalk.green(`Updated issue ${chalk.cyan(existing.id.slice(0, 8))}`));
      if (options.title) console.log(`  Title: ${updated.title}`);
      if (options.status) console.log(`  Status: ${formatStatus(updated.status)}`);
      if (options.priority) console.log(`  Priority: ${formatPriority(updated.priority)}`);
      if (options.description) console.log(`  Description updated`);
      if (options.parent !== undefined) {
        if (updated.parentId) {
          const parent = store.getIssue(updated.parentId);
          console.log(`  Parent: ${chalk.dim(updated.parentId.slice(0, 8))} ${parent?.title || ''}`);
        } else {
          console.log(`  Parent: ${chalk.dim('(none)')}`);
        }
      }
    }
  } finally {
    store.close();
  }
}

export async function deleteIssue(id: string): Promise<void> {
  const store = new Store(getDbPath());

  try {
    const existing = store.getIssue(id);
    if (!existing) {
      console.error(chalk.red(`Error: Issue '${id}' not found`));
      process.exit(1);
    }

    const deleted = store.deleteIssue(existing.id);
    if (deleted) {
      console.log(chalk.green(`Deleted issue ${chalk.cyan(existing.id.slice(0, 8))} "${existing.title}"`));
    }
  } finally {
    store.close();
  }
}

// Helper functions

// Build a tree structure from flat comment array
function buildCommentTree(comments: Comment[]): Comment[] {
  const commentMap = new Map<string, Comment>();
  const roots: Comment[] = [];

  // First pass: create map and initialize replies array
  for (const comment of comments) {
    commentMap.set(comment.id, { ...comment, replies: [] });
  }

  // Second pass: build tree
  for (const comment of comments) {
    const treeComment = commentMap.get(comment.id)!;
    if (comment.parentCommentId) {
      const parent = commentMap.get(comment.parentCommentId);
      if (parent) {
        parent.replies = parent.replies || [];
        parent.replies.push(treeComment);
      } else {
        // Orphaned comment (parent was deleted) - show as root with note
        treeComment.metadata = { ...treeComment.metadata, orphaned: true };
        roots.push(treeComment);
      }
    } else {
      roots.push(treeComment);
    }
  }

  return roots;
}

// Display comment tree with ASCII tree characters
function displayCommentTree(comments: Comment[], depth: number, isLast: boolean[] = []): void {
  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];
    const isLastItem = i === comments.length - 1;

    // Build prefix based on depth and position
    let prefix = '';
    for (let j = 0; j < depth; j++) {
      prefix += isLast[j] ? '    ' : '│   ';
    }

    if (depth > 0) {
      prefix += isLastItem ? '└─ ' : '├─ ';
    } else {
      prefix = '\n  ';
    }

    const persona = formatPersona(comment.persona);
    const date = comment.createdAt.toLocaleDateString();
    const time = comment.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const orphanedNote = comment.metadata?.orphaned ? chalk.dim(' [reply to deleted comment]') : '';

    console.log(`${prefix}${persona} ${chalk.dim(`${date} ${time}`)}${orphanedNote}`);

    // Content indentation based on depth
    const contentPrefix = depth === 0 ? '  ' : prefix.replace(/[├└]─ $/, '    ').replace(/│/g, '│');
    const contentIndent = depth > 0 ? contentPrefix : '  ';
    console.log(chalk.dim(contentIndent + comment.content.split('\n').join('\n' + contentIndent)));

    // Recursively display replies
    if (comment.replies && comment.replies.length > 0) {
      displayCommentTree(comment.replies, depth + 1, [...isLast, isLastItem]);
    }
  }
}

function formatStatus(status: IssueStatus): string {
  const colors: Record<IssueStatus, (s: string) => string> = {
    draft: chalk.yellow,
    refining: chalk.blue,
    feedback: chalk.magenta,
    ready: chalk.green,
    exported: chalk.cyan,
    archived: chalk.gray,
  };
  return colors[status](status);
}

function formatPriority(priority: Priority): string {
  const indicators: Record<Priority, string> = {
    low: chalk.dim('○○○'),
    medium: chalk.yellow('●○○'),
    high: chalk.yellow('●●○'),
    critical: chalk.red('●●●'),
  };
  return indicators[priority] + ' ' + priority;
}

function formatPersona(persona: string): string {
  const icons: Record<string, string> = {
    'review-draft': '📝',
    architect: '🏛️',
    'qa-review': '🧪',
    triage: '📋',
    user: '👤',
  };
  const icon = icons[persona] || '💬';
  const displayName = getPersonaDisplayName(persona);
  return `[${icon} ${chalk.cyan(displayName)}]`;
}

function getReverseLinkLabel(linkType: string): string {
  const reverse: Record<string, string> = {
    blocks: 'blocked_by',
    depends_on: 'depended_on_by',
    duplicates: 'duplicated_by',
    related_to: 'related_to',
  };
  return reverse[linkType] || linkType;
}

function padRight(str: string, len: number): string {
  // Strip ANSI codes for length calculation
  const plainStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, len - plainStr.length);
  return str + ' '.repeat(padding);
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '…';
}
