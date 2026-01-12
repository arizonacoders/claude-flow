import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { v5 as uuidv5 } from 'uuid';
import { StateStore } from './state-store.js';
import { logger } from '../utils/logger.js';
import type { Session, PersonaType, OrchestratorConfig } from '../types/index.js';

// UUID namespace for generating deterministic session IDs
const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export interface SessionConfig {
  issueNumber: number;
  persona: PersonaType;
  projectPath: string;
  config: OrchestratorConfig;
  verbose?: boolean;
  fork?: boolean;
}

export class SessionHandle extends EventEmitter {
  private process: ChildProcess;
  private outputBuffer: string = '';

  constructor(
    public readonly sessionId: string,
    process: ChildProcess,
    private store: StateStore
  ) {
    super();
    this.process = process;
    this.setupHandlers();
  }

  get pid(): number | undefined {
    return this.process.pid;
  }

  private setupHandlers(): void {
    if (this.process.stdout) {
      this.process.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        this.outputBuffer += text;
        this.parseStreamJson();
        this.emit('output', text);
      });
    }

    if (this.process.stderr) {
      this.process.stderr.on('data', (data: Buffer) => {
        this.emit('error', data.toString());
      });
    }

    this.process.on('exit', async (code) => {
      const newStatus = code === 0 ? 'waiting' : 'failed';
      this.store.updateSession(this.sessionId, { status: newStatus });
      this.store.recordEvent(this.sessionId, code === 0 ? 'paused' : 'failed', {
        exitCode: code,
      });
      this.emit('exit', code);
    });

    this.process.on('error', (err) => {
      this.store.updateSession(this.sessionId, { status: 'failed' });
      this.store.recordEvent(this.sessionId, 'crashed', { error: err.message });
      this.emit('processError', err);
    });
  }

  private parseStreamJson(): void {
    // Parse newline-delimited JSON from Claude's stream-json output
    const lines = this.outputBuffer.split('\n');
    this.outputBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line);
          this.emit('message', event);
        } catch {
          // Non-JSON output, emit as raw
          this.emit('raw', line);
        }
      }
    }
  }

  async waitForCompletion(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.on('exit', (code) => resolve(code ?? 1));
      this.on('processError', reject);
    });
  }

  kill(): void {
    if (this.process.pid) {
      this.process.kill('SIGTERM');
    }
  }
}

export class SessionManager {
  private store: StateStore;

  constructor(store: StateStore) {
    this.store = store;
  }

  generateSessionId(issueNumber: number, persona: PersonaType, projectPath: string): string {
    const name = `${projectPath}:${persona}:${issueNumber}`;
    return uuidv5(name, NAMESPACE);
  }

  async startOrResume(config: SessionConfig): Promise<SessionHandle> {
    const sessionId = this.generateSessionId(
      config.issueNumber,
      config.persona,
      config.projectPath
    );

    const existing = this.store.getSession(sessionId);

    if (existing && !config.fork) {
      if (existing.status === 'active') {
        throw new SessionAlreadyRunningError(config.issueNumber, sessionId);
      }

      // If session failed/aborted before ever running successfully, start fresh
      // (resumeCount 0 means it never completed a successful run)
      const neverRanSuccessfully =
        (existing.status === 'failed' || existing.status === 'aborted') &&
        existing.resumeCount === 0;

      if (neverRanSuccessfully) {
        logger.debug('Previous session never ran successfully, starting fresh');
        // Delete the old session and start new
        this.store.updateSession(sessionId, { status: 'aborted' });
        return this.start(sessionId, config, true); // true = replace existing
      }

      return this.resume(existing, config);
    }

    return this.start(sessionId, config);
  }

  private start(sessionId: string, config: SessionConfig, replace: boolean = false): SessionHandle {
    logger.session('Starting session', sessionId, `#${config.issueNumber} ${config.persona}`);

    // Create or replace session in database
    if (replace) {
      this.store.updateSession(sessionId, { status: 'active', resumeCount: 0 });
    } else {
      this.store.createSession({
        id: sessionId,
        issueNumber: config.issueNumber,
        persona: config.persona,
        projectPath: config.projectPath,
      });
    }

    this.store.recordEvent(sessionId, 'started', {
      issueNumber: config.issueNumber,
      persona: config.persona,
    });

    // Build Claude command
    const args = this.buildStartCommand(sessionId, config);

    // Spawn Claude process
    const childProcess = spawn('claude', args, {
      cwd: config.projectPath,
      stdio: config.verbose ? ['inherit', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      env: { ...globalThis.process.env },
    });

    logger.debug('Spawned Claude process', { pid: childProcess.pid, args });

    return new SessionHandle(sessionId, childProcess, this.store);
  }

  private resume(session: Session, config: SessionConfig): SessionHandle {
    logger.session(
      'Resuming session',
      session.id,
      `#${config.issueNumber} (attempt ${session.resumeCount + 1})`
    );

    // Update session status
    this.store.updateSession(session.id, {
      status: 'active',
      resumeCount: session.resumeCount + 1,
    });

    this.store.recordEvent(session.id, 'resumed', {
      resumeCount: session.resumeCount + 1,
    });

    // Build resume command
    const args = this.buildResumeCommand(session, config);

    // Spawn Claude process
    const childProcess = spawn('claude', args, {
      cwd: config.projectPath,
      stdio: config.verbose ? ['inherit', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      env: { ...globalThis.process.env },
    });

    logger.debug('Spawned Claude resume process', { pid: childProcess.pid, args });

    return new SessionHandle(session.id, childProcess, this.store);
  }

  private buildStartCommand(sessionId: string, config: SessionConfig): string[] {
    return [
      '--session-id',
      sessionId,
      '-p',
      `/${config.persona} ${config.issueNumber}`,
      '--verbose',
      '--output-format',
      'stream-json',
      '--model',
      config.config.claude.model,
    ];
  }

  private buildResumeCommand(session: Session, config: SessionConfig): string[] {
    const prompt = this.getResumePrompt(session);

    return [
      '--resume',
      session.id,
      '-p',
      prompt,
      '--verbose',
      '--output-format',
      'stream-json',
      '--model',
      config.config.claude.model,
    ];
  }

  private getResumePrompt(session: Session): string {
    return (
      `Continue the ${session.persona} workflow for issue #${session.issueNumber}. ` +
      `Check current status and proceed accordingly. This is resume attempt ${session.resumeCount + 1}.`
    );
  }

  getSession(sessionId: string): Session | undefined {
    return this.store.getSession(sessionId);
  }

  getActiveSessions(): Session[] {
    return this.store.getAllActiveSessions();
  }

  abortSession(sessionId: string): void {
    const session = this.store.getSession(sessionId);
    if (session) {
      this.store.updateSession(sessionId, { status: 'aborted' });
      this.store.recordEvent(sessionId, 'failed', { reason: 'aborted' });
      logger.session('Aborted session', sessionId);
    }
  }

  markCompleted(sessionId: string): void {
    this.store.updateSession(sessionId, {
      status: 'completed',
      completedAt: new Date(),
    });
    this.store.recordEvent(sessionId, 'completed', {});
    logger.session('Completed session', sessionId);
  }
}

// Custom errors
export class SessionAlreadyRunningError extends Error {
  constructor(
    public issueNumber: number,
    public sessionId: string
  ) {
    super(`Session already running for issue #${issueNumber}`);
    this.name = 'SessionAlreadyRunningError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(public issueNumber: number) {
    super(`No session found for issue #${issueNumber}`);
    this.name = 'SessionNotFoundError';
  }
}
