import chalk from 'chalk';
import { createInterface } from 'readline';
import { Store } from '../core/store.js';
import { getDbPath } from '../utils/config.js';
import type { PersonaType } from '../types/index.js';

export async function addComment(
  issueId: string,
  options: { persona: string; message?: string; replyTo?: string; metadata?: string; json?: boolean }
): Promise<void> {
  const store = new Store(getDbPath());

  try {
    // Validate issue exists
    const issue = store.getIssue(issueId);
    if (!issue) {
      if (options.json) {
        console.log(JSON.stringify({ error: `Issue '${issueId}' not found` }));
      } else {
        console.error(chalk.red(`Error: Issue '${issueId}' not found`));
      }
      process.exit(1);
    }

    // Validate persona
    const validPersonas: PersonaType[] = ['review-draft', 'architect', 'qa-review', 'triage', 'user'];
    const persona = options.persona as PersonaType;

    if (!validPersonas.includes(persona)) {
      if (options.json) {
        console.log(JSON.stringify({ error: `Invalid persona '${options.persona}'`, validPersonas }));
      } else {
        console.error(chalk.red(`Error: Invalid persona '${options.persona}'`));
        console.error(chalk.dim(`Valid personas: ${validPersonas.join(', ')}`));
      }
      process.exit(1);
    }

    // Validate parent comment if --reply-to is provided
    let parentCommentId: string | undefined;
    if (options.replyTo) {
      const parentComment = store.getComment(options.replyTo);
      if (!parentComment) {
        if (options.json) {
          console.log(JSON.stringify({ error: `Parent comment '${options.replyTo}' not found` }));
        } else {
          console.error(chalk.red(`Error: Parent comment '${options.replyTo}' not found`));
        }
        process.exit(1);
      }

      // Validate parent comment belongs to same issue
      if (parentComment.issueId !== issue.id) {
        if (options.json) {
          console.log(JSON.stringify({ error: 'Parent comment must belong to the same issue' }));
        } else {
          console.error(chalk.red('Error: Parent comment must belong to the same issue'));
        }
        process.exit(1);
      }

      parentCommentId = parentComment.id; // Use resolved full ID
    }

    // Get message from option or stdin
    let content = options.message;

    if (!content && !options.json) {
      // Read from stdin (only in interactive mode)
      content = await readFromStdin();
    }

    if (!content || content.trim() === '') {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Comment content is required' }));
      } else {
        console.error(chalk.red('Error: Comment content is required'));
      }
      process.exit(1);
    }

    // Parse metadata if provided
    let metadata: Record<string, unknown> | undefined;
    if (options.metadata) {
      try {
        metadata = JSON.parse(options.metadata);
      } catch {
        if (options.json) {
          console.log(JSON.stringify({ error: 'Invalid JSON in metadata' }));
        } else {
          console.error(chalk.red('Error: Invalid JSON in metadata'));
        }
        process.exit(1);
      }
    }

    const comment = store.createComment({
      issueId: issue.id, // Use resolved full ID
      persona,
      content: content.trim(),
      parentCommentId,
      metadata,
    });

    if (options.json) {
      console.log(JSON.stringify({ success: true, comment, issue: { id: issue.id, number: issue.number, title: issue.title } }));
      return;
    }

    console.log(chalk.green('Comment added:'));
    console.log(`  Issue: #${issue.number} "${issue.title}"`);
    console.log(`  Persona: ${formatPersona(persona)}`);
    if (parentCommentId) {
      console.log(`  Reply to: ${chalk.dim(parentCommentId.slice(0, 8))}`);
    }
    console.log(`  Content: ${truncate(comment.content, 50)}`);
    if (metadata) {
      console.log(`  Metadata: ${chalk.dim(JSON.stringify(metadata))}`);
    }
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (options.json) {
      console.log(JSON.stringify({ error: errorMessage }));
    } else {
      console.error(chalk.red(`Error: ${errorMessage}`));
    }
    process.exit(1);
  } finally {
    store.close();
  }
}

async function readFromStdin(): Promise<string> {
  // Check if stdin is a TTY (interactive)
  if (process.stdin.isTTY) {
    console.log(chalk.dim('Enter comment (Ctrl+D to finish):'));
  }

  return new Promise((resolve) => {
    const lines: string[] = [];
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', (line) => {
      lines.push(line);
    });

    rl.on('close', () => {
      resolve(lines.join('\n'));
    });
  });
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
  return `${icon} ${chalk.cyan(persona)}`;
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '…';
}
