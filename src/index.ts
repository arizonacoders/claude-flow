#!/usr/bin/env node

import { Command } from 'commander';
import { runWorkflow } from './commands/run.js';
import { showStatus } from './commands/status.js';
import { watchStatus } from './commands/watch.js';
import { StateStore } from './core/state-store.js';
import { SessionManager } from './core/session-manager.js';
import { loadConfig } from './utils/config.js';
import { logger } from './utils/logger.js';
import type { PersonaType } from './types/index.js';

const program = new Command();

program
  .name('claude-flow')
  .description('CLI orchestrator for Claude Code sessions tied to GitHub issues')
  .version('0.1.0');

// Common options for workflow commands
const workflowOptions = (cmd: Command) =>
  cmd
    .option('--timeout <minutes>', 'Max session duration', '120')
    .option('--poll-interval <seconds>', 'Status check interval', '60')
    .option('--verbose', 'Show Claude output in real-time')
    .option('--no-monitor', 'Exit after starting session')
    .option('--fork', "Create new session, don't resume existing")
    .option('--json', 'Output in JSON format');

// Review Draft command
workflowOptions(
  program
    .command('review-draft <issue>')
    .description('Start PM review workflow for an issue and its sub-issues')
)
  .action(async (issue: string, options) => {
    await runWorkflow(parseInt(issue), 'review-draft' as PersonaType, {
      timeout: parseInt(options.timeout),
      pollInterval: parseInt(options.pollInterval),
      verbose: options.verbose,
      noMonitor: !options.monitor,
      fork: options.fork,
      json: options.json,
    });
  });

// Architect command
workflowOptions(
  program
    .command('architect <issue>')
    .description('Start architect technical review workflow')
)
  .action(async (issue: string, options) => {
    await runWorkflow(parseInt(issue), 'architect' as PersonaType, {
      timeout: parseInt(options.timeout),
      pollInterval: parseInt(options.pollInterval),
      verbose: options.verbose,
      noMonitor: !options.monitor,
      fork: options.fork,
      json: options.json,
    });
  });

// QA Review command
workflowOptions(
  program
    .command('qa-review <issue>')
    .description('Start QA test design review workflow')
)
  .action(async (issue: string, options) => {
    await runWorkflow(parseInt(issue), 'qa-review' as PersonaType, {
      timeout: parseInt(options.timeout),
      pollInterval: parseInt(options.pollInterval),
      verbose: options.verbose,
      noMonitor: !options.monitor,
      fork: options.fork,
      json: options.json,
    });
  });

// Triage command
workflowOptions(
  program
    .command('triage <issue>')
    .description('Triage an unplanned issue')
)
  .action(async (issue: string, options) => {
    await runWorkflow(parseInt(issue), 'triage' as PersonaType, {
      timeout: parseInt(options.timeout),
      pollInterval: parseInt(options.pollInterval),
      verbose: options.verbose,
      noMonitor: !options.monitor,
      fork: options.fork,
      json: options.json,
    });
  });

// Status command
program
  .command('status [issue]')
  .description('Show session status')
  .option('--json', 'Output as JSON')
  .action(async (issue: string | undefined, options) => {
    await showStatus(issue ? parseInt(issue) : undefined, {
      json: options.json,
    });
  });

// Watch command
program
  .command('watch')
  .description('Start background monitor for status changes')
  .option('--daemon', 'Run as background daemon')
  .option('--poll-interval <seconds>', 'Status check interval', '60')
  .action(async (options) => {
    await watchStatus({
      daemon: options.daemon,
      pollInterval: options.pollInterval ? parseInt(options.pollInterval) : undefined,
    });
  });

// Resume command
program
  .command('resume <issue>')
  .description('Manually resume session for an issue')
  .option('--persona <persona>', 'Persona to resume', 'review-draft')
  .option('--verbose', 'Show Claude output')
  .action(async (issue: string, options) => {
    const store = new StateStore();
    const sessionManager = new SessionManager(store);
    const config = loadConfig(process.cwd());

    try {
      const handle = await sessionManager.startOrResume({
        issueNumber: parseInt(issue),
        persona: options.persona as PersonaType,
        projectPath: process.cwd(),
        config,
        verbose: options.verbose,
      });

      if (options.verbose) {
        handle.on('output', (text: string) => process.stdout.write(text));
        await handle.waitForCompletion();
      } else {
        logger.success(`Session resumed: ${handle.sessionId.slice(0, 8)}`);
      }
    } catch (error) {
      logger.error('Resume failed', { error: (error as Error).message });
      process.exit(1);
    } finally {
      store.close();
    }
  });

// Abort command
program
  .command('abort <issue>')
  .description('Abort session for an issue')
  .option('--persona <persona>', 'Specific persona to abort')
  .action(async (issue: string, options) => {
    const store = new StateStore();
    const sessionManager = new SessionManager(store);

    try {
      const sessions = store.getSessionsForIssue(parseInt(issue));
      const toAbort = options.persona
        ? sessions.filter((s) => s.persona === options.persona)
        : sessions.filter((s) => s.status === 'active' || s.status === 'waiting');

      if (toAbort.length === 0) {
        logger.warn('No active sessions found to abort');
        return;
      }

      for (const session of toAbort) {
        sessionManager.abortSession(session.id);
        logger.success(`Aborted session: ${session.id.slice(0, 8)} (${session.persona})`);
      }
    } finally {
      store.close();
    }
  });

program.parse();
