#!/usr/bin/env node

import { Command } from 'commander';
import { createIssue, listIssues, showIssue, updateIssue, deleteIssue } from './commands/issue.js';
import { manageLink } from './commands/link.js';
import { manageDoc } from './commands/doc.js';
import { addComment } from './commands/comment.js';
import { showStatus } from './commands/status.js';
import { serve } from './commands/serve.js';
import { exportIssue } from './commands/export.js';
import { workflowNext, workflowSet, workflowStatus } from './commands/workflow.js';
import { initProject, listProjects, showProject } from './commands/project.js';
import type { IssueStatus, Priority, LinkType } from './types/index.js';

const program = new Command();

program
  .name('claude-flow')
  .description('Pre-issue refinement system with CLI and Web UI')
  .version('0.2.0');

// ============ Issue Commands ============
const issueCmd = program
  .command('issue')
  .description('Manage refinement issues');

issueCmd
  .command('create <title>')
  .description('Create a new issue')
  .option('-d, --description <text>', 'Issue description')
  .option('-p, --priority <priority>', 'Priority: low|medium|high|critical', 'medium')
  .option('--parent <id>', 'Parent issue ID')
  .option('--json', 'Output as JSON')
  .action(async (title: string, options) => {
    await createIssue(title, options);
  });

issueCmd
  .command('list')
  .description('List all issues')
  .option('-s, --status <status>', 'Filter by status')
  .option('--all', 'Show all issues across all projects')
  .option('--project <name>', 'Filter by project name')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await listIssues({
      status: options.status as IssueStatus,
      json: options.json,
      all: options.all,
      project: options.project,
    });
  });

issueCmd
  .command('show <id>')
  .description('Show issue details with links, docs, and comments')
  .option('--json', 'Output as JSON')
  .action(async (id: string, options) => {
    await showIssue(id, { json: options.json });
  });

issueCmd
  .command('update <id>')
  .description('Update an issue')
  .option('-t, --title <title>', 'New title')
  .option('-d, --description <text>', 'New description')
  .option('-s, --status <status>', 'New status: draft|arch-review|test-design|ready|archived')
  .option('-p, --priority <priority>', 'New priority: low|medium|high|critical')
  .option('--parent <id>', 'Set parent issue (use "none" to clear)')
  .action(async (id: string, options) => {
    await updateIssue(id, options);
  });

issueCmd
  .command('delete <id>')
  .description('Delete an issue')
  .action(async (id: string) => {
    await deleteIssue(id);
  });

// ============ Link Command ============
program
  .command('link <source-id> <target-id>')
  .description('Create or remove a link between issues')
  .requiredOption('-t, --type <type>', 'Link type: blocks|depends_on|duplicates|related_to')
  .option('--remove', 'Remove the link instead of creating')
  .action(async (sourceId: string, targetId: string, options) => {
    await manageLink(sourceId, targetId, {
      type: options.type as LinkType,
      remove: options.remove,
    });
  });

// ============ Doc Command ============
program
  .command('doc <issue-id>')
  .description('Manage documentation links for an issue')
  .option('--add <file-path>', 'Link a markdown file')
  .option('--title <title>', 'Display title for the doc')
  .option('--remove <doc-id>', 'Remove a doc link')
  .option('--list', 'List linked docs (default)')
  .action(async (issueId: string, options) => {
    await manageDoc(issueId, options);
  });

// ============ Comment Command ============
program
  .command('comment <issue-id>')
  .description('Add a comment to an issue')
  .requiredOption('-p, --persona <persona>', 'Who is commenting: review-draft|architect|qa-review|triage|user')
  .option('-m, --message <text>', 'Comment content (or read from stdin)')
  .option('--reply-to <comment-id>', 'Reply to a specific comment (UUID or first 8 chars)')
  .option('--metadata <json>', 'JSON metadata')
  .option('--json', 'Output as JSON')
  .action(async (issueId: string, options) => {
    await addComment(issueId, {
      persona: options.persona,
      message: options.message,
      replyTo: options.replyTo,
      metadata: options.metadata,
      json: options.json,
    });
  });

// ============ Serve Command ============
program
  .command('serve')
  .description('Start the web server')
  .option('-p, --port <number>', 'Port number', '3010')
  .option('--host <string>', 'Host to bind to', 'localhost')
  .option('--open', 'Open browser automatically')
  .action(async (options) => {
    await serve({
      port: parseInt(options.port),
      host: options.host,
      open: options.open,
    });
  });

// ============ Status Command ============
program
  .command('status')
  .description('Show summary of all issues')
  .option('--json', 'Output as JSON')
  .option('--all', 'Show all issues across all projects')
  .action(async (options) => {
    await showStatus({ json: options.json, all: options.all });
  });

// ============ Export Command ============
program
  .command('export <id>')
  .description('Export issue spec to JSON, Markdown, or CLI format')
  .option('--json', 'Output as structured JSON')
  .option('--md', 'Output as clean Markdown')
  .option('-o, --output <file>', 'Write to file instead of stdout')
  .option('--strict', 'Fail if required sections are missing')
  .option('--no-color', 'Disable colors and emojis')
  .option('-q, --quiet', 'Suppress warnings')
  .action(async (id: string, options) => {
    await exportIssue(id, {
      json: options.json,
      md: options.md,
      output: options.output,
      strict: options.strict,
      noColor: options.noColor === false ? false : !options.color,
      quiet: options.quiet,
    });
  });

// ============ Project Commands ============
const projectCmd = program
  .command('project')
  .description('Manage projects for workspace context');

projectCmd
  .command('init')
  .description('Initialize a project in the current git repository')
  .option('-n, --name <name>', 'Project name (defaults to repo name)')
  .option('--force', 'Reinitialize even if project exists')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await initProject(options);
  });

projectCmd
  .command('list')
  .description('List all projects with issue counts')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await listProjects({ json: options.json });
  });

projectCmd
  .command('show <id-or-name>')
  .description('Show project details')
  .option('--json', 'Output as JSON')
  .action(async (idOrName: string, options) => {
    await showProject(idOrName, { json: options.json });
  });

// ============ Workflow Commands ============
const workflowCmd = program
  .command('workflow')
  .description('Manage issue workflow and status transitions');

workflowCmd
  .command('next <id>')
  .description('Advance issue to next stage in pipeline')
  .option('--json', 'Output as JSON')
  .action(async (id: string, options) => {
    await workflowNext(id, { json: options.json });
  });

workflowCmd
  .command('set <id> <status>')
  .description('Set issue to specific status')
  .option('--json', 'Output as JSON')
  .option('--force', 'Force transition even if not normally allowed')
  .action(async (id: string, status: string, options) => {
    await workflowSet(id, status, { json: options.json, force: options.force });
  });

workflowCmd
  .command('status')
  .description('Show pipeline status with issues in each stage')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await workflowStatus({ json: options.json });
  });

program.parse();
