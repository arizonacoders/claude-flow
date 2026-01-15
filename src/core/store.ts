import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import type {
  Issue,
  IssueCreateInput,
  IssueUpdateInput,
  IssueLink,
  IssueLinkCreateInput,
  DocLink,
  DocLinkCreateInput,
  Comment,
  CommentCreateInput,
  IssueStatus,
  Priority,
  LinkType,
  PersonaType,
  Project,
  ProjectCreateInput,
  ProjectStats,
} from '../types/index.js';

export class Store {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      -- Projects table
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        git_remote TEXT UNIQUE,
        git_path TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Core issues
      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        number INTEGER UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'draft',
        priority TEXT DEFAULT 'medium',
        parent_id TEXT REFERENCES issues(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Add number column if it doesn't exist (migration)
      -- SQLite doesn't support IF NOT EXISTS for columns, so we handle this in code
    `);

    // Migration: Add number column if missing
    const columns = this.db.prepare("PRAGMA table_info(issues)").all() as { name: string }[];
    const hasNumber = columns.some(c => c.name === 'number');
    if (!hasNumber) {
      // Add column without UNIQUE first (SQLite limitation)
      this.db.exec('ALTER TABLE issues ADD COLUMN number INTEGER');
      // Assign numbers to existing issues
      const issues = this.db.prepare('SELECT id FROM issues ORDER BY created_at').all() as { id: string }[];
      const updateStmt = this.db.prepare('UPDATE issues SET number = ? WHERE id = ?');
      issues.forEach((issue, index) => {
        updateStmt.run(index + 1, issue.id);
      });
    }
    // Ensure unique index exists (handles partial migrations)
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_number ON issues(number)');
    // Ensure any issues without numbers get assigned one
    const unnumbered = this.db.prepare('SELECT id FROM issues WHERE number IS NULL ORDER BY created_at').all() as { id: string }[];
    if (unnumbered.length > 0) {
      const maxNumber = this.db.prepare('SELECT MAX(number) as max FROM issues').get() as { max: number | null };
      let nextNum = (maxNumber.max || 0) + 1;
      const updateStmt = this.db.prepare('UPDATE issues SET number = ? WHERE id = ?');
      for (const issue of unnumbered) {
        updateStmt.run(nextNum++, issue.id);
      }
    }

    // Migration: Add project_id column if missing (for existing databases)
    const hasProjectId = columns.some(c => c.name === 'project_id');
    if (!hasProjectId) {
      this.db.exec('ALTER TABLE issues ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL');
    }
    // Create index on project_id for faster filtering
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id)');

    this.db.exec(`

      -- Issue links (typed references between issues)
      CREATE TABLE IF NOT EXISTS issue_links (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        link_type TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(source_id, target_id, link_type)
      );

      -- Doc links (references to local markdown files)
      CREATE TABLE IF NOT EXISTS doc_links (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        title TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Comments (agent collaboration layer)
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        persona TEXT NOT NULL,
        content TEXT NOT NULL,
        parent_comment_id TEXT REFERENCES comments(id) ON DELETE SET NULL,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
      CREATE INDEX IF NOT EXISTS idx_issues_parent ON issues(parent_id);
      CREATE INDEX IF NOT EXISTS idx_links_source ON issue_links(source_id);
      CREATE INDEX IF NOT EXISTS idx_links_target ON issue_links(target_id);
      CREATE INDEX IF NOT EXISTS idx_docs_issue ON doc_links(issue_id);
      CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(issue_id);
      CREATE INDEX IF NOT EXISTS idx_comments_persona ON comments(persona);
    `);

    // Migration: Add parent_comment_id column if missing (for existing databases)
    const commentColumns = this.db.prepare("PRAGMA table_info(comments)").all() as { name: string }[];
    const hasParentCommentId = commentColumns.some(c => c.name === 'parent_comment_id');
    if (!hasParentCommentId) {
      this.db.exec('ALTER TABLE comments ADD COLUMN parent_comment_id TEXT REFERENCES comments(id) ON DELETE SET NULL');
    }
    // Create index after ensuring column exists
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id)');
  }

  // ============ Issue Methods ============

  createIssue(input: IssueCreateInput): Issue {
    const id = randomUUID();

    // Get the next issue number
    const maxNumber = this.db.prepare('SELECT MAX(number) as max FROM issues').get() as { max: number | null };
    const nextNumber = (maxNumber.max || 0) + 1;

    const stmt = this.db.prepare(`
      INSERT INTO issues (id, number, title, description, priority, parent_id, project_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      nextNumber,
      input.title,
      input.description || null,
      input.priority || 'medium',
      input.parentId || null,
      input.projectId || null
    );

    return this.getIssue(id)!;
  }

  getIssue(idOrNumber: string): Issue | undefined {
    // Try by issue number first (if it looks like a number)
    if (/^\d+$/.test(idOrNumber)) {
      const row = this.db.prepare('SELECT * FROM issues WHERE number = ?').get(parseInt(idOrNumber)) as IssueRow | undefined;
      if (row) return this.rowToIssue(row);
    }

    // Try exact UUID match
    let row = this.db.prepare('SELECT * FROM issues WHERE id = ?').get(idOrNumber) as IssueRow | undefined;

    // If not found and id looks like partial UUID, try prefix match
    if (!row && idOrNumber.length < 36 && !/^\d+$/.test(idOrNumber)) {
      row = this.db.prepare('SELECT * FROM issues WHERE id LIKE ?').get(`${idOrNumber}%`) as IssueRow | undefined;
    }

    return row ? this.rowToIssue(row) : undefined;
  }

  getAllIssues(status?: IssueStatus, projectId?: string | null): Issue[] {
    let query = 'SELECT * FROM issues';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    // projectId = undefined means no filter (show all)
    // projectId = null means show only unassigned issues
    // projectId = string means filter by that project
    if (projectId !== undefined) {
      if (projectId === null) {
        conditions.push('project_id IS NULL');
      } else {
        conditions.push('project_id = ?');
        params.push(projectId);
      }
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const rows = this.db.prepare(query).all(...params) as IssueRow[];
    return rows.map((r) => this.rowToIssue(r));
  }

  getChildIssues(parentId: string): Issue[] {
    const rows = this.db
      .prepare('SELECT * FROM issues WHERE parent_id = ? ORDER BY created_at')
      .all(parentId) as IssueRow[];
    return rows.map((r) => this.rowToIssue(r));
  }

  updateIssue(id: string, updates: IssueUpdateInput): Issue | undefined {
    const parts: string[] = ["updated_at = datetime('now')"];
    const values: unknown[] = [];

    if (updates.title !== undefined) {
      parts.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      parts.push('description = ?');
      values.push(updates.description);
    }
    if (updates.status !== undefined) {
      parts.push('status = ?');
      values.push(updates.status);
    }
    if (updates.priority !== undefined) {
      parts.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.parentId !== undefined) {
      parts.push('parent_id = ?');
      values.push(updates.parentId || null);
    }
    if (updates.projectId !== undefined) {
      parts.push('project_id = ?');
      values.push(updates.projectId || null);
    }

    values.push(id);
    this.db.prepare(`UPDATE issues SET ${parts.join(', ')} WHERE id = ?`).run(...values);

    return this.getIssue(id);
  }

  deleteIssue(id: string): boolean {
    const result = this.db.prepare('DELETE FROM issues WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============ Issue Link Methods ============

  createLink(input: IssueLinkCreateInput): IssueLink {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO issue_links (id, source_id, target_id, link_type)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, input.sourceId, input.targetId, input.linkType);

    return this.getLink(id)!;
  }

  getLink(id: string): IssueLink | undefined {
    const row = this.db.prepare('SELECT * FROM issue_links WHERE id = ?').get(id) as IssueLinkRow | undefined;
    return row ? this.rowToIssueLink(row) : undefined;
  }

  getLinksForIssue(issueId: string): IssueLink[] {
    // Get links where issue is either source or target
    const rows = this.db
      .prepare(
        'SELECT * FROM issue_links WHERE source_id = ? OR target_id = ? ORDER BY created_at'
      )
      .all(issueId, issueId) as IssueLinkRow[];
    return rows.map((r) => this.rowToIssueLink(r));
  }

  findLink(sourceId: string, targetId: string, linkType: LinkType): IssueLink | undefined {
    const row = this.db
      .prepare('SELECT * FROM issue_links WHERE source_id = ? AND target_id = ? AND link_type = ?')
      .get(sourceId, targetId, linkType) as IssueLinkRow | undefined;
    return row ? this.rowToIssueLink(row) : undefined;
  }

  deleteLink(id: string): boolean {
    const result = this.db.prepare('DELETE FROM issue_links WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deleteLinkByDetails(sourceId: string, targetId: string, linkType: LinkType): boolean {
    const result = this.db
      .prepare('DELETE FROM issue_links WHERE source_id = ? AND target_id = ? AND link_type = ?')
      .run(sourceId, targetId, linkType);
    return result.changes > 0;
  }

  // ============ Doc Link Methods ============

  createDocLink(input: DocLinkCreateInput): DocLink {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO doc_links (id, issue_id, file_path, title)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, input.issueId, input.filePath, input.title || null);

    return this.getDocLink(id)!;
  }

  getDocLink(id: string): DocLink | undefined {
    const row = this.db.prepare('SELECT * FROM doc_links WHERE id = ?').get(id) as DocLinkRow | undefined;
    return row ? this.rowToDocLink(row) : undefined;
  }

  getDocLinksForIssue(issueId: string): DocLink[] {
    const rows = this.db
      .prepare('SELECT * FROM doc_links WHERE issue_id = ? ORDER BY created_at')
      .all(issueId) as DocLinkRow[];
    return rows.map((r) => this.rowToDocLink(r));
  }

  deleteDocLink(id: string): boolean {
    const result = this.db.prepare('DELETE FROM doc_links WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============ Comment Methods ============

  // Maximum nesting depth for comment threads (root = 0, reply = 1, reply-to-reply = 2)
  private static readonly MAX_COMMENT_DEPTH = 2;

  createComment(input: CommentCreateInput): Comment {
    const id = randomUUID();

    // Validate parentCommentId if provided
    if (input.parentCommentId) {
      const parentComment = this.getComment(input.parentCommentId);
      if (!parentComment) {
        throw new Error('Parent comment not found');
      }

      // Validate parent comment belongs to same issue
      if (parentComment.issueId !== input.issueId) {
        throw new Error('Parent comment must belong to the same issue');
      }

      // Validate self-reference
      if (input.parentCommentId === id) {
        throw new Error('Cannot reply to self');
      }

      // Validate nesting depth
      const depth = this.getCommentDepth(input.parentCommentId);
      if (depth >= Store.MAX_COMMENT_DEPTH) {
        throw new Error(`Maximum nesting depth (${Store.MAX_COMMENT_DEPTH}) exceeded`);
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO comments (id, issue_id, persona, content, parent_comment_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.issueId,
      input.persona,
      input.content,
      input.parentCommentId || null,
      input.metadata ? JSON.stringify(input.metadata) : null
    );

    return this.getComment(id)!;
  }

  // Get the depth of a comment in the thread (0 = root, 1 = first reply, 2 = reply to reply)
  private getCommentDepth(commentId: string): number {
    let depth = 0;
    let currentId: string | undefined = commentId;

    while (currentId) {
      const comment = this.getComment(currentId);
      if (!comment || !comment.parentCommentId) break;
      depth++;
      currentId = comment.parentCommentId;
    }

    return depth;
  }

  getComment(id: string): Comment | undefined {
    // Try exact UUID match first
    let row = this.db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as CommentRow | undefined;

    // If not found and id looks like partial UUID, try prefix match
    if (!row && id.length < 36) {
      row = this.db.prepare('SELECT * FROM comments WHERE id LIKE ?').get(`${id}%`) as CommentRow | undefined;
    }

    return row ? this.rowToComment(row) : undefined;
  }

  getCommentsForIssue(issueId: string): Comment[] {
    const rows = this.db
      .prepare('SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at')
      .all(issueId) as CommentRow[];
    return rows.map((r) => this.rowToComment(r));
  }

  deleteComment(id: string): boolean {
    const result = this.db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============ Project Methods ============

  createProject(input: ProjectCreateInput): Project {
    const id = randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, git_remote, git_path)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.name,
      input.gitRemote || null,
      input.gitPath || null
    );

    return this.getProject(id)!;
  }

  getProject(id: string): Project | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    return row ? this.rowToProject(row) : undefined;
  }

  getProjectByName(name: string): Project | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE name = ?').get(name) as ProjectRow | undefined;
    return row ? this.rowToProject(row) : undefined;
  }

  getProjectByRemote(gitRemote: string): Project | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE git_remote = ?').get(gitRemote) as ProjectRow | undefined;
    return row ? this.rowToProject(row) : undefined;
  }

  getAllProjects(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY name').all() as ProjectRow[];
    return rows.map((r) => this.rowToProject(r));
  }

  getProjectStats(projectId: string): ProjectStats {
    return this.getStats(projectId);
  }

  deleteProject(id: string): boolean {
    // Note: Issues with this project_id will have it set to NULL due to ON DELETE SET NULL
    const result = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============ Statistics ============

  getStats(projectId?: string | null): { total: number; byStatus: Record<IssueStatus, number> } {
    let countQuery = 'SELECT COUNT(*) as count FROM issues';
    let statusQuery = 'SELECT status, COUNT(*) as count FROM issues';
    const params: unknown[] = [];

    // projectId = undefined means no filter (show all)
    // projectId = null means show only unassigned issues
    // projectId = string means filter by that project
    if (projectId !== undefined) {
      if (projectId === null) {
        countQuery += ' WHERE project_id IS NULL';
        statusQuery += ' WHERE project_id IS NULL';
      } else {
        countQuery += ' WHERE project_id = ?';
        statusQuery += ' WHERE project_id = ?';
        params.push(projectId);
      }
    }

    statusQuery += ' GROUP BY status';

    const total = (this.db.prepare(countQuery).get(...params) as { count: number }).count;
    const statusCounts = this.db.prepare(statusQuery).all(...params) as { status: IssueStatus; count: number }[];

    const byStatus: Record<IssueStatus, number> = {
      draft: 0,
      'arch-review': 0,
      'test-design': 0,
      ready: 0,
      archived: 0,
    };

    for (const row of statusCounts) {
      byStatus[row.status] = row.count;
    }

    return { total, byStatus };
  }

  // ============ Utility ============

  close(): void {
    this.db.close();
  }

  // ============ Row Converters ============

  private rowToIssue(row: IssueRow): Issue {
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      description: row.description || undefined,
      status: row.status as IssueStatus,
      priority: row.priority as Priority,
      parentId: row.parent_id || undefined,
      projectId: row.project_id || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      gitRemote: row.git_remote || undefined,
      gitPath: row.git_path || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToIssueLink(row: IssueLinkRow): IssueLink {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      linkType: row.link_type as LinkType,
      createdAt: new Date(row.created_at),
    };
  }

  private rowToDocLink(row: DocLinkRow): DocLink {
    return {
      id: row.id,
      issueId: row.issue_id,
      filePath: row.file_path,
      title: row.title || undefined,
      createdAt: new Date(row.created_at),
    };
  }

  private rowToComment(row: CommentRow): Comment {
    return {
      id: row.id,
      issueId: row.issue_id,
      persona: row.persona as PersonaType,
      content: row.content,
      parentCommentId: row.parent_comment_id || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
    };
  }
}

// Row types for SQLite
interface IssueRow {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  parent_id: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  git_remote: string | null;
  git_path: string | null;
  created_at: string;
  updated_at: string;
}

interface IssueLinkRow {
  id: string;
  source_id: string;
  target_id: string;
  link_type: string;
  created_at: string;
}

interface DocLinkRow {
  id: string;
  issue_id: string;
  file_path: string;
  title: string | null;
  created_at: string;
}

interface CommentRow {
  id: string;
  issue_id: string;
  persona: string;
  content: string;
  parent_comment_id: string | null;
  metadata: string | null;
  created_at: string;
}
