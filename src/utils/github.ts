import { exec } from 'child_process';
import { promisify } from 'util';
import type { GitHubConfig, IssueNode } from '../types/index.js';

const execAsync = promisify(exec);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export async function ghCommand(args: string): Promise<ExecResult> {
  try {
    return await execAsync(`gh ${args}`);
  } catch (err) {
    const error = err as Error & { stdout?: string; stderr?: string };
    throw new Error(`GitHub CLI error: ${error.stderr || error.message}`);
  }
}

export async function getIssue(
  issueNumber: number,
  config: GitHubConfig
): Promise<{ title: string; state: string; body: string }> {
  const result = await ghCommand(
    `issue view ${issueNumber} --repo ${config.owner}/${config.repo} --json title,state,body`
  );
  return JSON.parse(result.stdout);
}

export async function getIssueWithRelations(
  issueNumber: number,
  config: GitHubConfig
): Promise<IssueNode> {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          number
          title
          state
          parent { number }
          subIssues(first: 50) {
            nodes { number title state }
          }
        }
      }
    }
  `;

  const result = await ghCommand(
    `api graphql -f query='${query}' -f owner=${config.owner} -f repo=${config.repo} -F number=${issueNumber}`
  );

  const data = JSON.parse(result.stdout);
  const issue = data.data.repository.issue;

  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    parentNumber: issue.parent?.number,
    childNumbers: issue.subIssues.nodes.map((n: { number: number }) => n.number),
    children: [],
  };
}

export async function getProjectItemStatus(
  issueNumber: number,
  config: GitHubConfig
): Promise<string | undefined> {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          projectItems(first: 10) {
            nodes {
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const result = await ghCommand(
      `api graphql -f query='${query}' -f owner=${config.owner} -f repo=${config.repo} -F number=${issueNumber}`
    );

    const data = JSON.parse(result.stdout);
    const items = data.data.repository.issue.projectItems.nodes;

    if (items.length > 0 && items[0].fieldValueByName) {
      return items[0].fieldValueByName.name;
    }
  } catch {
    // Issue might not be on the project
  }

  return undefined;
}

export async function getProjectItemStatuses(
  issueNumbers: number[],
  config: GitHubConfig
): Promise<Map<number, string>> {
  // Fetch all project items and filter
  const result = await ghCommand(
    `project item-list ${config.projectNumber} --owner ${config.owner} --format json --limit 500`
  );

  const data = JSON.parse(result.stdout);
  const statuses = new Map<number, string>();

  for (const item of data.items || []) {
    const number = item.content?.number;
    if (number && issueNumbers.includes(number)) {
      statuses.set(number, item.status || 'Unknown');
    }
  }

  return statuses;
}

export async function buildIssueGraph(
  rootIssue: number,
  config: GitHubConfig
): Promise<IssueNode> {
  const root = await getIssueWithRelations(rootIssue, config);

  // Recursively fetch children
  const children = await Promise.all(
    root.childNumbers.map((n) => buildIssueGraph(n, config))
  );

  return { ...root, children };
}

export function flattenIssueGraph(node: IssueNode): IssueNode[] {
  return [node, ...node.children.flatMap((c) => flattenIssueGraph(c))];
}
