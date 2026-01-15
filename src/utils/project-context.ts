import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import type { Project } from '../types/index.js';
import { Store } from '../core/store.js';
import { getDbPath } from './config.js';

// Config file schema
interface ProjectConfig {
  project_id: string;
  version?: number;
}

// Cache for project lookups (per-session)
let cachedProject: Project | null | undefined = undefined;
let cachedConfigPath: string | null = null;

/**
 * Normalize git remote URL for consistent matching.
 * Strips .git suffix, converts SSH to HTTPS-like format.
 */
export function normalizeGitRemote(url: string): string {
  let normalized = url.trim();

  // Remove trailing .git
  if (normalized.endsWith('.git')) {
    normalized = normalized.slice(0, -4);
  }

  // Convert SSH URLs (git@github.com:user/repo) to normalized format
  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    normalized = `https://${sshMatch[1]}/${sshMatch[2]}`;
  }

  // Remove trailing slash
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Check if a directory is a git repository.
 */
export function isGitRepo(cwd: string = process.cwd()): boolean {
  try {
    // Walk up directory tree to find .git
    let current = cwd;
    while (current !== dirname(current)) {
      if (existsSync(join(current, '.git'))) {
        return true;
      }
      current = dirname(current);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Get git remote URL using git CLI.
 * Returns normalized URL or undefined if not available.
 */
export function getGitRemote(cwd: string = process.cwd()): string | undefined {
  try {
    const result = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    return result ? normalizeGitRemote(result) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get the git repository root directory.
 */
export function getGitRoot(cwd: string = process.cwd()): string | undefined {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    return result || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract repository name from git remote URL.
 * e.g., "https://github.com/user/repo" -> "repo"
 */
export function getRepoNameFromRemote(remote: string): string {
  const normalized = normalizeGitRemote(remote);
  const parts = normalized.split('/');
  return parts[parts.length - 1] || 'unnamed-project';
}

/**
 * Find .claude-flow.json config file by walking up directory tree.
 * Returns the path to the config file or undefined if not found.
 */
export function findProjectConfig(cwd: string = process.cwd()): string | undefined {
  let current = cwd;
  const root = dirname(cwd.split('/').slice(0, 2).join('/') || '/');

  while (current !== root && current !== dirname(current)) {
    const configPath = join(current, '.claude-flow.json');
    if (existsSync(configPath)) {
      return configPath;
    }
    current = dirname(current);
  }

  // Also check root
  const rootConfig = join(current, '.claude-flow.json');
  if (existsSync(rootConfig)) {
    return rootConfig;
  }

  return undefined;
}

/**
 * Read and parse project config file.
 * Returns parsed config or undefined if invalid/not found.
 */
export function readProjectConfig(configPath: string): ProjectConfig | undefined {
  try {
    const content = readFileSync(configPath, 'utf-8');

    // Size check (max 10KB)
    if (content.length > 10240) {
      console.warn('Warning: .claude-flow.json exceeds 10KB - ignoring');
      return undefined;
    }

    const config = JSON.parse(content) as ProjectConfig;

    // Validate required field
    if (!config.project_id || typeof config.project_id !== 'string') {
      console.warn('Warning: Invalid .claude-flow.json - missing or invalid project_id');
      return undefined;
    }

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(config.project_id)) {
      console.warn('Warning: Invalid .claude-flow.json - project_id is not a valid UUID');
      return undefined;
    }

    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Warning: Failed to parse .claude-flow.json - ${(error as Error).message}`);
    }
    return undefined;
  }
}

/**
 * Write project config file.
 */
export function writeProjectConfig(configPath: string, projectId: string): void {
  const config: ProjectConfig = {
    project_id: projectId,
    version: 1,
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Get the current project based on working directory.
 *
 * Resolution order:
 * 1. Look for .claude-flow.json in current or parent directories
 * 2. If found, look up project in database by project_id
 * 3. If not found, return undefined (no project context)
 *
 * Results are cached for the session.
 */
export function getCurrentProject(cwd: string = process.cwd()): Project | undefined {
  // Check cache (only if cwd hasn't changed)
  const configPath = findProjectConfig(cwd);

  if (cachedProject !== undefined && cachedConfigPath === configPath) {
    return cachedProject || undefined;
  }

  cachedConfigPath = configPath || null;

  if (!configPath) {
    cachedProject = null;
    return undefined;
  }

  const config = readProjectConfig(configPath);
  if (!config) {
    cachedProject = null;
    return undefined;
  }

  // Look up project in database
  const store = new Store(getDbPath());
  try {
    const project = store.getProject(config.project_id);

    if (!project) {
      console.warn(`Warning: Project '${config.project_id}' not found in database. Run 'claude-flow project init' to reinitialize.`);
      cachedProject = null;
      return undefined;
    }

    cachedProject = project;
    return project;
  } finally {
    store.close();
  }
}

/**
 * Clear the project cache (useful for testing or after project changes).
 */
export function clearProjectCache(): void {
  cachedProject = undefined;
  cachedConfigPath = null;
}

/**
 * Get current project ID for filtering, or undefined if no project context.
 */
export function getCurrentProjectId(cwd: string = process.cwd()): string | undefined {
  const project = getCurrentProject(cwd);
  return project?.id;
}

/**
 * Check if a config file exists in the given directory.
 */
export function hasProjectConfig(dir: string = process.cwd()): boolean {
  return existsSync(join(dir, '.claude-flow.json'));
}

/**
 * Sanitize project name for filesystem safety.
 */
export function sanitizeProjectName(name: string): string {
  // Remove unsafe characters
  return name
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\.\./g, '-')
    .replace(/\0/g, '')
    .trim()
    .slice(0, 255);
}
