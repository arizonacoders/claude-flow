import { StateStore } from './state-store.js';
import { buildIssueGraph, flattenIssueGraph, getProjectItemStatuses } from '../utils/github.js';
import { logger } from '../utils/logger.js';
import type { IssueNode, GitHubConfig, PersonaType, OrchestratorConfig } from '../types/index.js';

export class IssueGraph {
  constructor(
    private store: StateStore,
    private githubConfig: GitHubConfig
  ) {}

  async build(rootIssue: number): Promise<IssueNode> {
    logger.debug('Building issue graph', { rootIssue });

    const graph = await buildIssueGraph(rootIssue, this.githubConfig);

    // Fetch current statuses for all issues
    const allIssues = flattenIssueGraph(graph);
    const issueNumbers = allIssues.map((i) => i.number);
    const statuses = await getProjectItemStatuses(issueNumbers, this.githubConfig);

    // Attach statuses to nodes
    this.attachStatuses(graph, statuses);

    return graph;
  }

  private attachStatuses(node: IssueNode, statuses: Map<number, string>): void {
    node.status = statuses.get(node.number);
    for (const child of node.children) {
      this.attachStatuses(child, statuses);
    }
  }

  async trackIssues(
    sessionId: string,
    graph: IssueNode,
    persona: PersonaType,
    config: OrchestratorConfig
  ): Promise<void> {
    const issues = flattenIssueGraph(graph);
    const personaConfig = config.personas[persona];
    const targetStatus = personaConfig.targetStatuses[personaConfig.targetStatuses.length - 1];

    logger.debug('Tracking issues for session', { sessionId, count: issues.length });

    for (const issue of issues) {
      this.store.upsertIssueGraph({
        issueNumber: issue.number,
        parentNumber: issue.parentNumber,
        sessionId,
        currentStatus: issue.status,
        targetStatus,
      });
    }
  }

  getTrackedIssues(sessionId: string): number[] {
    return this.store.getTrackedIssues(sessionId);
  }

  updateIssueStatus(issueNumber: number, sessionId: string, status: string): void {
    const previous = this.store.getIssueStatus(issueNumber, sessionId);

    if (previous !== status) {
      this.store.recordTransition(issueNumber, previous, status);
      this.store.updateIssueStatus(issueNumber, sessionId, status);
      logger.issue(issueNumber, status);
    }
  }

  printGraph(node: IssueNode, indent: number = 0): void {
    const prefix = '  '.repeat(indent);
    const statusStr = node.status ? ` [${node.status}]` : '';
    console.log(`${prefix}#${node.number}: ${node.title}${statusStr}`);

    for (const child of node.children) {
      this.printGraph(child, indent + 1);
    }
  }

  countIssues(node: IssueNode): number {
    return 1 + node.children.reduce((sum, child) => sum + this.countIssues(child), 0);
  }
}
