import chalk from 'chalk';
import { join } from 'path';
import { Store } from '../core/store.js';
import { getDbPath } from '../utils/config.js';
import {
  isGitRepo,
  getGitRemote,
  getGitRoot,
  getRepoNameFromRemote,
  hasProjectConfig,
  readProjectConfig,
  writeProjectConfig,
  normalizeGitRemote,
  clearProjectCache,
  sanitizeProjectName,
} from '../utils/project-context.js';
import type { IssueStatus } from '../types/index.js';

export interface ProjectInitOptions {
  name?: string;
  force?: boolean;
  json?: boolean;
}

export interface ProjectListOptions {
  json?: boolean;
}

export interface ProjectShowOptions {
  json?: boolean;
}

/**
 * Initialize a project in the current directory.
 */
export async function initProject(options: ProjectInitOptions): Promise<void> {
  const cwd = process.cwd();
  const store = new Store(getDbPath());

  try {
    // Check if already initialized
    if (hasProjectConfig(cwd) && !options.force) {
      const configPath = join(cwd, '.claude-flow.json');
      const existingConfig = readProjectConfig(configPath);

      if (existingConfig) {
        const existingProject = store.getProject(existingConfig.project_id);
        if (existingProject) {
          if (options.json) {
            console.log(JSON.stringify({ error: 'Project already initialized', project: existingProject }));
          } else {
            console.error(chalk.yellow(`Project already initialized: ${existingProject.name}`));
            console.error(chalk.dim(`Use --force to reinitialize`));
          }
          process.exit(1);
        }
      }
    }

    // Check if in git repo
    if (!isGitRepo(cwd)) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Not a git repository' }));
      } else {
        console.error(chalk.red('Error: Not a git repository'));
        console.error(chalk.dim('Run this command from within a git repository'));
      }
      process.exit(1);
    }

    // Get git remote and repo name
    const gitRemote = getGitRemote(cwd);
    const gitPath = getGitRoot(cwd) || cwd;

    // Determine project name
    let projectName = options.name;
    if (!projectName) {
      if (gitRemote) {
        projectName = getRepoNameFromRemote(gitRemote);
      } else {
        // Use directory name as fallback
        projectName = sanitizeProjectName(cwd.split('/').pop() || 'unnamed-project');
      }
    }

    projectName = sanitizeProjectName(projectName);

    // Check if project with same remote already exists
    if (gitRemote) {
      const normalizedRemote = normalizeGitRemote(gitRemote);
      const existingProject = store.getProjectByRemote(normalizedRemote);

      if (existingProject && !options.force) {
        // Reuse existing project (same repo cloned to different location)
        const configPath = join(cwd, '.claude-flow.json');
        writeProjectConfig(configPath, existingProject.id);
        clearProjectCache();

        if (options.json) {
          console.log(JSON.stringify({ success: true, project: existingProject, reused: true }));
        } else {
          console.log(chalk.green(`Connected to existing project: ${existingProject.name}`));
          console.log(`  ID: ${chalk.cyan(existingProject.id)}`);
          console.log(`  Remote: ${chalk.dim(existingProject.gitRemote || 'none')}`);
          console.log(chalk.dim('\nConfig file created: .claude-flow.json'));
        }
        return;
      }
    }

    // Create new project
    const project = store.createProject({
      name: projectName,
      gitRemote: gitRemote ? normalizeGitRemote(gitRemote) : undefined,
      gitPath,
    });

    // Write config file
    const configPath = join(cwd, '.claude-flow.json');
    writeProjectConfig(configPath, project.id);
    clearProjectCache();

    if (options.json) {
      console.log(JSON.stringify({ success: true, project }));
      return;
    }

    console.log(chalk.green('Project initialized:'));
    console.log(`  Name: ${project.name}`);
    console.log(`  ID: ${chalk.cyan(project.id)}`);
    if (project.gitRemote) {
      console.log(`  Remote: ${chalk.dim(project.gitRemote)}`);
    }
    console.log(chalk.dim('\nConfig file created: .claude-flow.json'));
    console.log(chalk.dim('Issues created in this directory will now be scoped to this project.'));
  } finally {
    store.close();
  }
}

/**
 * List all projects with issue counts.
 */
export async function listProjects(options: ProjectListOptions): Promise<void> {
  const store = new Store(getDbPath());

  try {
    const projects = store.getAllProjects();

    if (options.json) {
      // Include stats for each project
      const projectsWithStats = projects.map((project) => ({
        ...project,
        stats: store.getProjectStats(project.id),
      }));
      console.log(JSON.stringify(projectsWithStats, null, 2));
      return;
    }

    if (projects.length === 0) {
      console.log(chalk.dim('No projects found.'));
      console.log(chalk.dim('Run "claude-flow project init" in a git repository to create one.'));
      return;
    }

    console.log(chalk.bold('\n📁 Projects\n'));

    // Table header
    console.log(
      chalk.bold(
        padRight('Name', 25) +
          padRight('Issues', 10) +
          padRight('Ready', 8) +
          'Remote'
      )
    );
    console.log(chalk.dim('─'.repeat(80)));

    for (const project of projects) {
      const stats = store.getProjectStats(project.id);
      const name = truncate(project.name, 23);
      const remote = project.gitRemote ? truncate(project.gitRemote, 35) : chalk.dim('(local)');

      console.log(
        padRight(name, 25) +
          padRight(String(stats.total), 10) +
          padRight(String(stats.byStatus.ready), 8) +
          chalk.dim(remote)
      );
    }

    console.log(chalk.dim(`\n${projects.length} project(s)`));
  } finally {
    store.close();
  }
}

/**
 * Show details of a specific project.
 */
export async function showProject(idOrName: string, options: ProjectShowOptions): Promise<void> {
  const store = new Store(getDbPath());

  try {
    // Try to find project by ID or name
    let project = store.getProject(idOrName);
    if (!project) {
      project = store.getProjectByName(idOrName);
    }

    if (!project) {
      if (options.json) {
        console.log(JSON.stringify({ error: `Project '${idOrName}' not found` }));
      } else {
        console.error(chalk.red(`Error: Project '${idOrName}' not found`));
      }
      process.exit(1);
    }

    const stats = store.getProjectStats(project.id);

    if (options.json) {
      console.log(JSON.stringify({ ...project, stats }, null, 2));
      return;
    }

    console.log(chalk.bold('\n' + '═'.repeat(60)));
    console.log(chalk.bold(`  PROJECT: ${chalk.cyan(project.name)}`));
    console.log(chalk.bold('═'.repeat(60)));

    console.log(`\n  ID: ${chalk.dim(project.id)}`);
    if (project.gitRemote) {
      console.log(`  Remote: ${chalk.blue(project.gitRemote)}`);
    }
    if (project.gitPath) {
      console.log(`  Path: ${chalk.dim(project.gitPath)}`);
    }
    console.log(`  Created: ${project.createdAt.toLocaleDateString()}`);

    // Stats
    console.log(chalk.dim('\n' + '─'.repeat(60)));
    console.log(chalk.bold('  ISSUE STATISTICS'));
    console.log(chalk.dim('─'.repeat(60)));

    console.log(`\n  Total: ${chalk.cyan(stats.total)}`);

    const statusOrder: IssueStatus[] = ['draft', 'arch-review', 'test-design', 'ready', 'archived'];
    const statusColors: Record<IssueStatus, (s: string) => string> = {
      draft: chalk.yellow,
      'arch-review': chalk.blue,
      'test-design': chalk.cyan,
      ready: chalk.green,
      archived: chalk.gray,
    };

    console.log('\n  By Status:');
    for (const status of statusOrder) {
      const count = stats.byStatus[status];
      const color = statusColors[status];
      console.log(`    ${padRight(status, 14)} ${color(String(count))}`);
    }

    console.log('');
  } finally {
    store.close();
  }
}

// Helper functions
function padRight(str: string, len: number): string {
  const plainStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, len - plainStr.length);
  return str + ' '.repeat(padding);
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '…';
}
