import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { getDbPath } from '../utils/config.js';
import type {
  Session,
  SessionCreateInput,
  SessionStatus,
  SessionEvent,
  SessionEventType,
  IssueGraphEntry,
  StatusTransition,
} from '../types/index.js';

export class StateStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath || getDbPath();

    // Ensure directory exists
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        issue_number INTEGER NOT NULL,
        persona TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        resume_count INTEGER DEFAULT 0,
        waiting_for_statuses TEXT,
        project_path TEXT NOT NULL,
        UNIQUE(issue_number, persona, project_path)
      );

      CREATE TABLE IF NOT EXISTS issue_graph (
        issue_number INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        parent_number INTEGER,
        current_status TEXT,
        target_status TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (issue_number, session_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS status_transitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_number INTEGER NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        detected_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_issue ON sessions(issue_number);
      CREATE INDEX IF NOT EXISTS idx_issue_graph_session ON issue_graph(session_id);
      CREATE INDEX IF NOT EXISTS idx_issue_graph_parent ON issue_graph(parent_number);
    `);
  }

  // Session methods
  createSession(input: SessionCreateInput): Session {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, issue_number, persona, status, project_path, waiting_for_statuses)
      VALUES (?, ?, ?, 'active', ?, ?)
    `);

    stmt.run(
      input.id,
      input.issueNumber,
      input.persona,
      input.projectPath,
      input.waitingForStatuses ? JSON.stringify(input.waitingForStatuses) : null
    );

    return this.getSession(input.id)!;
  }

  getSession(id: string): Session | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
    return row ? this.rowToSession(row) : undefined;
  }

  getSessionByIssue(issueNumber: number, persona: string, projectPath: string): Session | undefined {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE issue_number = ? AND persona = ? AND project_path = ?')
      .get(issueNumber, persona, projectPath) as SessionRow | undefined;
    return row ? this.rowToSession(row) : undefined;
  }

  getSessionsByStatus(statuses: SessionStatus[]): Session[] {
    const placeholders = statuses.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM sessions WHERE status IN (${placeholders})`)
      .all(...statuses) as SessionRow[];
    return rows.map((r) => this.rowToSession(r));
  }

  getAllActiveSessions(): Session[] {
    return this.getSessionsByStatus(['active', 'waiting']);
  }

  getSessionsForIssue(issueNumber: number): Session[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions WHERE issue_number = ?')
      .all(issueNumber) as SessionRow[];
    return rows.map((r) => this.rowToSession(r));
  }

  updateSession(
    id: string,
    updates: Partial<Pick<Session, 'status' | 'resumeCount' | 'completedAt' | 'waitingForStatuses'>>
  ): void {
    const parts: string[] = ["updated_at = datetime('now')"];
    const values: unknown[] = [];

    if (updates.status !== undefined) {
      parts.push('status = ?');
      values.push(updates.status);
    }
    if (updates.resumeCount !== undefined) {
      parts.push('resume_count = ?');
      values.push(updates.resumeCount);
    }
    if (updates.completedAt !== undefined) {
      parts.push('completed_at = ?');
      values.push(updates.completedAt.toISOString());
    }
    if (updates.waitingForStatuses !== undefined) {
      parts.push('waiting_for_statuses = ?');
      values.push(JSON.stringify(updates.waitingForStatuses));
    }

    values.push(id);
    this.db.prepare(`UPDATE sessions SET ${parts.join(', ')} WHERE id = ?`).run(...values);
  }

  // Issue graph methods
  upsertIssueGraph(entry: IssueGraphEntry): void {
    this.db
      .prepare(
        `
      INSERT INTO issue_graph (issue_number, session_id, parent_number, current_status, target_status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(issue_number, session_id) DO UPDATE SET
        parent_number = excluded.parent_number,
        current_status = excluded.current_status,
        target_status = excluded.target_status,
        updated_at = datetime('now')
    `
      )
      .run(
        entry.issueNumber,
        entry.sessionId,
        entry.parentNumber,
        entry.currentStatus,
        entry.targetStatus
      );
  }

  getTrackedIssues(sessionId: string): number[] {
    const rows = this.db
      .prepare('SELECT issue_number FROM issue_graph WHERE session_id = ?')
      .all(sessionId) as { issue_number: number }[];
    return rows.map((r) => r.issue_number);
  }

  updateIssueStatus(issueNumber: number, sessionId: string, status: string): void {
    this.db
      .prepare(
        `
      UPDATE issue_graph SET current_status = ?, updated_at = datetime('now')
      WHERE issue_number = ? AND session_id = ?
    `
      )
      .run(status, issueNumber, sessionId);
  }

  getIssueStatus(issueNumber: number, sessionId: string): string | undefined {
    const row = this.db
      .prepare('SELECT current_status FROM issue_graph WHERE issue_number = ? AND session_id = ?')
      .get(issueNumber, sessionId) as { current_status: string } | undefined;
    return row?.current_status;
  }

  // Session events methods
  recordEvent(sessionId: string, eventType: SessionEventType, data?: Record<string, unknown>): void {
    this.db
      .prepare(
        `
      INSERT INTO session_events (session_id, event_type, event_data)
      VALUES (?, ?, ?)
    `
      )
      .run(sessionId, eventType, data ? JSON.stringify(data) : null);
  }

  getSessionEvents(sessionId: string): SessionEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM session_events WHERE session_id = ? ORDER BY created_at')
      .all(sessionId) as SessionEventRow[];

    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      eventType: r.event_type as SessionEventType,
      eventData: r.event_data ? JSON.parse(r.event_data) : undefined,
      createdAt: new Date(r.created_at),
    }));
  }

  // Status transitions
  recordTransition(issueNumber: number, fromStatus: string | undefined, toStatus: string): void {
    this.db
      .prepare(
        `
      INSERT INTO status_transitions (issue_number, from_status, to_status)
      VALUES (?, ?, ?)
    `
      )
      .run(issueNumber, fromStatus, toStatus);
  }

  getTransitions(issueNumber: number): StatusTransition[] {
    const rows = this.db
      .prepare('SELECT * FROM status_transitions WHERE issue_number = ? ORDER BY detected_at')
      .all(issueNumber) as StatusTransitionRow[];

    return rows.map((r) => ({
      id: r.id,
      issueNumber: r.issue_number,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      detectedAt: new Date(r.detected_at),
    }));
  }

  // Utility
  close(): void {
    this.db.close();
  }

  private rowToSession(row: SessionRow): Session {
    return {
      id: row.id,
      issueNumber: row.issue_number,
      persona: row.persona as Session['persona'],
      status: row.status as SessionStatus,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      resumeCount: row.resume_count,
      waitingForStatuses: row.waiting_for_statuses
        ? JSON.parse(row.waiting_for_statuses)
        : undefined,
      projectPath: row.project_path,
    };
  }
}

// Row types for SQLite
interface SessionRow {
  id: string;
  issue_number: number;
  persona: string;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  resume_count: number;
  waiting_for_statuses: string | null;
  project_path: string;
}

interface SessionEventRow {
  id: number;
  session_id: string;
  event_type: string;
  event_data: string | null;
  created_at: string;
}

interface StatusTransitionRow {
  id: number;
  issue_number: number;
  from_status: string | null;
  to_status: string;
  detected_at: string;
}
