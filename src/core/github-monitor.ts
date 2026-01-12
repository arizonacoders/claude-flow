import { EventEmitter } from 'events';
import { StateStore } from './state-store.js';
import { SessionManager } from './session-manager.js';
import { getProjectItemStatuses } from '../utils/github.js';
import { loadConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import type { Session, OrchestratorConfig, GitHubConfig } from '../types/index.js';

export interface MonitorEvents {
  statusChange: (issueNumber: number, fromStatus: string | undefined, toStatus: string) => void;
  resumeTriggered: (session: Session, triggerIssue: number, newStatus: string) => void;
  error: (error: Error) => void;
}

export class GitHubMonitor extends EventEmitter {
  private store: StateStore;
  private sessionManager: SessionManager;
  private running: boolean = false;
  private timer?: NodeJS.Timeout;
  private pollInterval: number;
  private githubConfig: GitHubConfig;

  constructor(
    store: StateStore,
    sessionManager: SessionManager,
    config: OrchestratorConfig
  ) {
    super();
    this.store = store;
    this.sessionManager = sessionManager;
    this.pollInterval = config.monitor.pollInterval * 1000;
    this.githubConfig = config.github;
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Monitor already running');
      return;
    }

    this.running = true;
    logger.info('GitHub monitor started', { pollInterval: this.pollInterval / 1000 });

    await this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    logger.info('GitHub monitor stopped');
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      await this.checkSessions();
    } catch (error) {
      logger.error('Poll error', { error: (error as Error).message });
      this.emit('error', error);
    }

    // Schedule next poll
    this.timer = setTimeout(() => this.poll(), this.pollInterval);
  }

  private async checkSessions(): Promise<void> {
    const waitingSessions = this.store.getSessionsByStatus(['waiting']);

    if (waitingSessions.length === 0) {
      logger.debug('No waiting sessions to monitor');
      return;
    }

    logger.debug('Checking sessions', { count: waitingSessions.length });

    for (const session of waitingSessions) {
      await this.checkSession(session);
    }
  }

  private async checkSession(session: Session): Promise<void> {
    const issueNumbers = this.store.getTrackedIssues(session.id);

    if (issueNumbers.length === 0) {
      logger.warn('Session has no tracked issues', { sessionId: session.id });
      return;
    }

    // Fetch current statuses
    const statuses = await getProjectItemStatuses(issueNumbers, this.githubConfig);

    // Check each issue for status changes
    for (const [issueNumber, newStatus] of statuses) {
      const previous = this.store.getIssueStatus(issueNumber, session.id);

      if (previous !== newStatus) {
        // Record the transition
        this.store.recordTransition(issueNumber, previous, newStatus);
        this.store.updateIssueStatus(issueNumber, session.id, newStatus);

        this.emit('statusChange', issueNumber, previous, newStatus);
        logger.issue(issueNumber, newStatus);

        // Check if we should resume
        if (this.shouldResume(session, newStatus)) {
          await this.triggerResume(session, issueNumber, newStatus);
          return; // Only resume once per poll
        }
      }
    }

    // Check if all issues reached target status
    if (await this.checkAllComplete(session, statuses)) {
      this.sessionManager.markCompleted(session.id);
      logger.success(`All issues reached target status for session ${session.id.slice(0, 8)}`);
    }
  }

  private shouldResume(session: Session, newStatus: string): boolean {
    // Get persona config
    const config = loadConfig(session.projectPath);
    const personaConfig = config.personas[session.persona];

    // Resume if issue returned to feedback status
    if (newStatus === personaConfig.feedbackStatus) {
      return true;
    }

    // Also resume if waiting for specific statuses and one is reached
    if (session.waitingForStatuses?.includes(newStatus)) {
      return true;
    }

    return false;
  }

  private async triggerResume(
    session: Session,
    triggerIssue: number,
    newStatus: string
  ): Promise<void> {
    logger.info(`Triggering resume for session ${session.id.slice(0, 8)}`);
    logger.info(`  Trigger: #${triggerIssue} → ${newStatus}`);

    this.emit('resumeTriggered', session, triggerIssue, newStatus);

    try {
      const config = loadConfig(session.projectPath);
      await this.sessionManager.startOrResume({
        issueNumber: session.issueNumber,
        persona: session.persona,
        projectPath: session.projectPath,
        config,
      });
    } catch (error) {
      logger.error('Failed to resume session', { error: (error as Error).message });
    }
  }

  private async checkAllComplete(
    session: Session,
    statuses: Map<number, string>
  ): Promise<boolean> {
    const config = loadConfig(session.projectPath);
    const personaConfig = config.personas[session.persona];
    const targetStatuses = personaConfig.targetStatuses;

    // Check if all tracked issues are in a target status
    for (const [, status] of statuses) {
      if (!targetStatuses.includes(status)) {
        return false;
      }
    }

    return true;
  }
}
