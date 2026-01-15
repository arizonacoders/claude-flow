import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  normalizeGitRemote,
  getRepoNameFromRemote,
  findProjectConfig,
  readProjectConfig,
  writeProjectConfig,
  hasProjectConfig,
  sanitizeProjectName,
} from './project-context.js';

describe('project-context utilities', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'claude-flow-ctx-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('normalizeGitRemote', () => {
    it('should strip .git suffix', () => {
      expect(normalizeGitRemote('https://github.com/user/repo.git')).toBe(
        'https://github.com/user/repo'
      );
    });

    it('should convert SSH URLs to HTTPS format', () => {
      expect(normalizeGitRemote('git@github.com:user/repo.git')).toBe(
        'https://github.com/user/repo'
      );
    });

    it('should handle SSH URLs without .git suffix', () => {
      expect(normalizeGitRemote('git@github.com:user/repo')).toBe(
        'https://github.com/user/repo'
      );
    });

    it('should remove trailing slashes', () => {
      expect(normalizeGitRemote('https://github.com/user/repo/')).toBe(
        'https://github.com/user/repo'
      );
    });

    it('should trim whitespace', () => {
      expect(normalizeGitRemote('  https://github.com/user/repo  ')).toBe(
        'https://github.com/user/repo'
      );
    });

    it('should handle GitLab SSH URLs', () => {
      expect(normalizeGitRemote('git@gitlab.com:group/subgroup/project.git')).toBe(
        'https://gitlab.com/group/subgroup/project'
      );
    });
  });

  describe('getRepoNameFromRemote', () => {
    it('should extract repo name from HTTPS URL', () => {
      expect(getRepoNameFromRemote('https://github.com/user/my-repo.git')).toBe('my-repo');
    });

    it('should extract repo name from SSH URL', () => {
      expect(getRepoNameFromRemote('git@github.com:user/my-repo.git')).toBe('my-repo');
    });

    it('should handle nested paths', () => {
      expect(getRepoNameFromRemote('https://gitlab.com/group/subgroup/project')).toBe('project');
    });

    it('should return default for empty string', () => {
      expect(getRepoNameFromRemote('')).toBe('unnamed-project');
    });
  });

  describe('findProjectConfig', () => {
    it('should find config in current directory', () => {
      const configPath = join(tempDir, '.claude-flow.json');
      writeFileSync(configPath, '{}');

      expect(findProjectConfig(tempDir)).toBe(configPath);
    });

    it('should find config in parent directory', () => {
      const configPath = join(tempDir, '.claude-flow.json');
      writeFileSync(configPath, '{}');

      const subDir = join(tempDir, 'sub', 'deep');
      mkdirSync(subDir, { recursive: true });

      expect(findProjectConfig(subDir)).toBe(configPath);
    });

    it('should return undefined when no config exists', () => {
      expect(findProjectConfig(tempDir)).toBeUndefined();
    });
  });

  describe('readProjectConfig', () => {
    it('should read valid config', () => {
      const configPath = join(tempDir, '.claude-flow.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          project_id: '12345678-1234-1234-1234-123456789012',
          version: 1,
        })
      );

      const config = readProjectConfig(configPath);
      expect(config).toBeDefined();
      expect(config!.project_id).toBe('12345678-1234-1234-1234-123456789012');
    });

    it('should return undefined for missing project_id', () => {
      const configPath = join(tempDir, '.claude-flow.json');
      writeFileSync(configPath, JSON.stringify({ version: 1 }));

      expect(readProjectConfig(configPath)).toBeUndefined();
    });

    it('should return undefined for invalid UUID format', () => {
      const configPath = join(tempDir, '.claude-flow.json');
      writeFileSync(configPath, JSON.stringify({ project_id: 'not-a-uuid' }));

      expect(readProjectConfig(configPath)).toBeUndefined();
    });

    it('should return undefined for non-existent file', () => {
      expect(readProjectConfig(join(tempDir, 'nonexistent.json'))).toBeUndefined();
    });

    it('should return undefined for invalid JSON', () => {
      const configPath = join(tempDir, '.claude-flow.json');
      writeFileSync(configPath, 'not valid json');

      expect(readProjectConfig(configPath)).toBeUndefined();
    });
  });

  describe('writeProjectConfig', () => {
    it('should write valid config', () => {
      const configPath = join(tempDir, '.claude-flow.json');
      const projectId = '12345678-1234-1234-1234-123456789012';

      writeProjectConfig(configPath, projectId);

      const config = readProjectConfig(configPath);
      expect(config).toBeDefined();
      expect(config!.project_id).toBe(projectId);
      expect(config!.version).toBe(1);
    });
  });

  describe('hasProjectConfig', () => {
    it('should return true when config exists', () => {
      writeFileSync(join(tempDir, '.claude-flow.json'), '{}');
      expect(hasProjectConfig(tempDir)).toBe(true);
    });

    it('should return false when config does not exist', () => {
      expect(hasProjectConfig(tempDir)).toBe(false);
    });
  });

  describe('sanitizeProjectName', () => {
    it('should remove unsafe path characters', () => {
      expect(sanitizeProjectName('my/project')).toBe('my-project');
      expect(sanitizeProjectName('my\\project')).toBe('my-project');
      expect(sanitizeProjectName('my:project')).toBe('my-project');
      expect(sanitizeProjectName('my*project')).toBe('my-project');
      expect(sanitizeProjectName('my?project')).toBe('my-project');
      expect(sanitizeProjectName('my"project')).toBe('my-project');
      expect(sanitizeProjectName('my<project>')).toBe('my-project-');
      expect(sanitizeProjectName('my|project')).toBe('my-project');
    });

    it('should remove path traversal', () => {
      expect(sanitizeProjectName('../secret')).toBe('--secret');
      // foo/../bar -> foo/-/bar (/ replaced with -) -> foo---bar (.. replaced with -)
      expect(sanitizeProjectName('foo/../bar')).toBe('foo---bar');
    });

    it('should remove null bytes', () => {
      expect(sanitizeProjectName('my\0project')).toBe('myproject');
    });

    it('should trim whitespace', () => {
      expect(sanitizeProjectName('  my-project  ')).toBe('my-project');
    });

    it('should truncate long names', () => {
      const longName = 'a'.repeat(300);
      expect(sanitizeProjectName(longName).length).toBe(255);
    });

    it('should handle normal names', () => {
      expect(sanitizeProjectName('my-project-123')).toBe('my-project-123');
      expect(sanitizeProjectName('MyProject')).toBe('MyProject');
    });
  });
});
