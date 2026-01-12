import ora from 'ora';
import { StateStore } from './state-store.js';
import { SessionManager, SessionHandle } from './session-manager.js';
import { IssueGraph } from './issue-graph.js';
import { GitHubMonitor } from './github-monitor.js';
import { logger } from '../utils/logger.js';
import type { PersonaType, OrchestratorConfig, WorkflowOptions } from '../types/index.js';

export interface EventLoopConfig {
  issueNumber: number;
  persona: PersonaType;
  projectPath: string;
  config: OrchestratorConfig;
  options: WorkflowOptions;
}

export class EventLoop {
  private store: StateStore;
  private sessionManager: SessionManager;
  private issueGraph: IssueGraph;
  private monitor: GitHubMonitor;

  constructor(config: OrchestratorConfig) {
    this.store = new StateStore();
    this.sessionManager = new SessionManager(this.store);
    this.issueGraph = new IssueGraph(this.store, config.github);
    this.monitor = new GitHubMonitor(this.store, this.sessionManager, config);
  }

  async run(loopConfig: EventLoopConfig): Promise<void> {
    const { issueNumber, persona, projectPath, config, options } = loopConfig;

    // 1. Build issue graph
    const spinner = ora('Building issue graph...').start();
    let graph;
    try {
      graph = await this.issueGraph.build(issueNumber);
      spinner.succeed(`Tracking ${this.issueGraph.countIssues(graph)} issues`);
    } catch (error) {
      spinner.fail('Failed to build issue graph');
      throw error;
    }

    // Print the graph
    console.log();
    this.issueGraph.printGraph(graph);
    console.log();

    // 2. Start or resume session
    let handle: SessionHandle;
    try {
      handle = await this.sessionManager.startOrResume({
        issueNumber,
        persona,
        projectPath,
        config,
        verbose: options.verbose,
        fork: options.fork,
      });
    } catch (error) {
      logger.error('Failed to start session', { error: (error as Error).message });
      throw error;
    }

    // 3. Track issues for this session
    await this.issueGraph.trackIssues(handle.sessionId, graph, persona, config);

    // 4. Set up event handlers
    if (options.verbose) {
      handle.on('output', (text: string) => process.stdout.write(text));
      handle.on('error', (text: string) => process.stderr.write(text));
    }

    handle.on('exit', (code: number) => {
      if (code === 0) {
        logger.info('Claude session exited normally');
      } else {
        logger.warn('Claude session exited with error', { code });
      }
    });

    // 5. If not --no-monitor, wait for completion
    if (!options.noMonitor) {
      await this.monitorUntilComplete(handle, loopConfig);
    } else {
      logger.info('Session started in background (--no-monitor)');
      logger.info(`Use 'claude-flow status ${issueNumber}' to check progress`);
    }
  }

  private async monitorUntilComplete(
    handle: SessionHandle,
    loopConfig: EventLoopConfig
  ): Promise<void> {
    const { config } = loopConfig;
    const personaConfig = config.personas[loopConfig.persona];

    // Update session with target statuses
    this.store.updateSession(handle.sessionId, {
      waitingForStatuses: personaConfig.targetStatuses,
    });

    // Set up monitor event handlers
    this.monitor.on('statusChange', (issueNumber, from, to) => {
      logger.debug('Status change detected', { issueNumber, from, to });
    });

    this.monitor.on('resumeTriggered', (session, trigger, status) => {
      logger.info('Auto-resume triggered', { trigger, status });
    });

    // Wait for initial session to complete
    const spinner = ora('Waiting for Claude session...').start();
    const exitCode = await handle.waitForCompletion();

    if (exitCode === 0) {
      spinner.succeed('Initial session completed');
    } else {
      spinner.warn(`Session exited with code ${exitCode}`);
    }

    // Start monitoring for status changes
    const monitorSpinner = ora('Monitoring for status changes...').start();
    await this.monitor.start();

    // Poll until all issues complete or session fails
    while (true) {
      const session = this.store.getSession(handle.sessionId);

      if (!session) {
        monitorSpinner.fail('Session not found');
        break;
      }

      if (session.status === 'completed') {
        monitorSpinner.succeed('All issues reached target status');
        break;
      }

      if (session.status === 'failed' || session.status === 'aborted') {
        monitorSpinner.fail(`Session ended with status: ${session.status}`);
        break;
      }

      // Sleep before next check
      await this.sleep(5000);
    }

    this.monitor.stop();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  close(): void {
    this.store.close();
  }
}
