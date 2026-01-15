import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from './store.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Store', () => {
  let store: Store;
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'claude-flow-test-'));
    store = new Store(join(tempDir, 'test.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Project CRUD', () => {
    it('should create a project', () => {
      const project = store.createProject({
        name: 'test-project',
        gitRemote: 'https://github.com/test/repo.git',
        gitPath: '/path/to/repo',
      });

      expect(project.id).toBeDefined();
      expect(project.name).toBe('test-project');
      expect(project.gitRemote).toBe('https://github.com/test/repo.git');
      expect(project.gitPath).toBe('/path/to/repo');
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a project without git info', () => {
      const project = store.createProject({
        name: 'manual-project',
      });

      expect(project.name).toBe('manual-project');
      expect(project.gitRemote).toBeUndefined();
      expect(project.gitPath).toBeUndefined();
    });

    it('should get a project by id', () => {
      const created = store.createProject({ name: 'get-test' });
      const fetched = store.getProject(created.id);

      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.name).toBe('get-test');
    });

    it('should get a project by name', () => {
      store.createProject({ name: 'by-name-test' });
      const fetched = store.getProjectByName('by-name-test');

      expect(fetched).toBeDefined();
      expect(fetched!.name).toBe('by-name-test');
    });

    it('should get a project by git remote', () => {
      store.createProject({
        name: 'by-remote-test',
        gitRemote: 'https://github.com/test/unique-repo.git',
      });
      const fetched = store.getProjectByRemote('https://github.com/test/unique-repo.git');

      expect(fetched).toBeDefined();
      expect(fetched!.gitRemote).toBe('https://github.com/test/unique-repo.git');
    });

    it('should return undefined for non-existent project', () => {
      expect(store.getProject('non-existent-id')).toBeUndefined();
      expect(store.getProjectByName('non-existent-name')).toBeUndefined();
      expect(store.getProjectByRemote('non-existent-remote')).toBeUndefined();
    });

    it('should get all projects', () => {
      store.createProject({ name: 'project-a' });
      store.createProject({ name: 'project-b' });
      store.createProject({ name: 'project-c' });

      const projects = store.getAllProjects();

      expect(projects).toHaveLength(3);
      // Should be ordered by name
      expect(projects[0].name).toBe('project-a');
      expect(projects[1].name).toBe('project-b');
      expect(projects[2].name).toBe('project-c');
    });

    it('should delete a project', () => {
      const project = store.createProject({ name: 'to-delete' });
      expect(store.getProject(project.id)).toBeDefined();

      const deleted = store.deleteProject(project.id);
      expect(deleted).toBe(true);
      expect(store.getProject(project.id)).toBeUndefined();
    });

    it('should return false when deleting non-existent project', () => {
      expect(store.deleteProject('non-existent-id')).toBe(false);
    });

    it('should enforce unique git_remote constraint', () => {
      store.createProject({
        name: 'project-1',
        gitRemote: 'https://github.com/test/same-repo.git',
      });

      expect(() => {
        store.createProject({
          name: 'project-2',
          gitRemote: 'https://github.com/test/same-repo.git',
        });
      }).toThrow();
    });
  });

  describe('Issue-Project relationship', () => {
    it('should create an issue with project_id', () => {
      const project = store.createProject({ name: 'issue-project' });
      const issue = store.createIssue({
        title: 'Test Issue',
        projectId: project.id,
      });

      expect(issue.projectId).toBe(project.id);
    });

    it('should create an issue without project_id', () => {
      const issue = store.createIssue({ title: 'No Project Issue' });
      expect(issue.projectId).toBeUndefined();
    });

    it('should filter issues by project_id', () => {
      const project1 = store.createProject({ name: 'project-1' });
      const project2 = store.createProject({ name: 'project-2' });

      store.createIssue({ title: 'Issue 1', projectId: project1.id });
      store.createIssue({ title: 'Issue 2', projectId: project1.id });
      store.createIssue({ title: 'Issue 3', projectId: project2.id });
      store.createIssue({ title: 'Issue 4' }); // No project

      const project1Issues = store.getAllIssues(undefined, project1.id);
      expect(project1Issues).toHaveLength(2);
      expect(project1Issues.every(i => i.projectId === project1.id)).toBe(true);

      const project2Issues = store.getAllIssues(undefined, project2.id);
      expect(project2Issues).toHaveLength(1);
      expect(project2Issues[0].projectId).toBe(project2.id);
    });

    it('should filter issues with no project (projectId = null)', () => {
      const project = store.createProject({ name: 'some-project' });

      store.createIssue({ title: 'With Project', projectId: project.id });
      store.createIssue({ title: 'Without Project 1' });
      store.createIssue({ title: 'Without Project 2' });

      const unassigned = store.getAllIssues(undefined, null);
      expect(unassigned).toHaveLength(2);
      expect(unassigned.every(i => i.projectId === undefined)).toBe(true);
    });

    it('should return all issues when projectId is undefined', () => {
      const project = store.createProject({ name: 'some-project' });

      store.createIssue({ title: 'With Project', projectId: project.id });
      store.createIssue({ title: 'Without Project' });

      const allIssues = store.getAllIssues();
      expect(allIssues).toHaveLength(2);
    });

    it('should set project_id to null when project is deleted (ON DELETE SET NULL)', () => {
      const project = store.createProject({ name: 'deletable-project' });
      const issue = store.createIssue({
        title: 'Orphanable Issue',
        projectId: project.id,
      });

      expect(issue.projectId).toBe(project.id);

      store.deleteProject(project.id);

      const updatedIssue = store.getIssue(issue.id);
      expect(updatedIssue).toBeDefined();
      expect(updatedIssue!.projectId).toBeUndefined();
    });

    it('should update issue project_id', () => {
      const project1 = store.createProject({ name: 'original-project' });
      const project2 = store.createProject({ name: 'new-project' });

      const issue = store.createIssue({
        title: 'Movable Issue',
        projectId: project1.id,
      });

      expect(issue.projectId).toBe(project1.id);

      const updated = store.updateIssue(issue.id, { projectId: project2.id });
      expect(updated!.projectId).toBe(project2.id);
    });

    it('should remove project from issue by setting projectId to null', () => {
      const project = store.createProject({ name: 'temp-project' });
      const issue = store.createIssue({
        title: 'Detachable Issue',
        projectId: project.id,
      });

      expect(issue.projectId).toBe(project.id);

      const updated = store.updateIssue(issue.id, { projectId: null });
      expect(updated!.projectId).toBeUndefined();
    });
  });

  describe('Project statistics', () => {
    it('should get stats for a specific project', () => {
      const project = store.createProject({ name: 'stats-project' });

      store.createIssue({ title: 'Draft 1', projectId: project.id });
      store.createIssue({ title: 'Draft 2', projectId: project.id });

      const issue3 = store.createIssue({ title: 'Ready Issue', projectId: project.id });
      store.updateIssue(issue3.id, { status: 'ready' });

      // Issue not in this project
      store.createIssue({ title: 'Other Issue' });

      const stats = store.getProjectStats(project.id);

      expect(stats.total).toBe(3);
      expect(stats.byStatus.draft).toBe(2);
      expect(stats.byStatus.ready).toBe(1);
      expect(stats.byStatus['arch-review']).toBe(0);
    });

    it('should get combined stats with status and project filter', () => {
      const project = store.createProject({ name: 'combined-stats-project' });

      store.createIssue({ title: 'Draft', projectId: project.id });

      const ready = store.createIssue({ title: 'Ready', projectId: project.id });
      store.updateIssue(ready.id, { status: 'ready' });

      // Different project
      const project2 = store.createProject({ name: 'other-project' });
      const otherReady = store.createIssue({ title: 'Other Ready', projectId: project2.id });
      store.updateIssue(otherReady.id, { status: 'ready' });

      // Filter by both status and project
      const readyIssues = store.getAllIssues('ready', project.id);
      expect(readyIssues).toHaveLength(1);
      expect(readyIssues[0].title).toBe('Ready');
    });
  });
});
