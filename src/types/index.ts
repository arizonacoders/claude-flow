// Session types
export type SessionStatus = 'active' | 'waiting' | 'completed' | 'failed' | 'aborted';

export type PersonaType = 'review-draft' | 'architect' | 'qa-review' | 'triage';

export interface Session {
  id: string;
  issueNumber: number;
  persona: PersonaType;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  resumeCount: number;
  waitingForStatuses?: string[];
  projectPath: string;
}

export interface SessionCreateInput {
  id: string;
  issueNumber: number;
  persona: PersonaType;
  projectPath: string;
  waitingForStatuses?: string[];
}

// Issue types
export interface IssueNode {
  number: number;
  title: string;
  state: string;
  status?: string;
  parentNumber?: number;
  childNumbers: number[];
  children: IssueNode[];
}

export interface IssueGraphEntry {
  issueNumber: number;
  parentNumber?: number;
  sessionId: string;
  currentStatus?: string;
  targetStatus?: string;
}

// Event types
export type SessionEventType = 'started' | 'resumed' | 'paused' | 'completed' | 'failed' | 'crashed';

export interface SessionEvent {
  id: number;
  sessionId: string;
  eventType: SessionEventType;
  eventData?: Record<string, unknown>;
  createdAt: Date;
}

// Status transition
export interface StatusTransition {
  id: number;
  issueNumber: number;
  fromStatus?: string;
  toStatus: string;
  detectedAt: Date;
}

// Config types
export interface GitHubConfig {
  owner: string;
  repo: string;
  projectNumber: number;
}

export interface ClaudeConfig {
  model: string;
  timeout: number;
}

export interface MonitorConfig {
  pollInterval: number;
  maxRetries: number;
}

export interface PersonaConfig {
  targetStatuses: string[];
  feedbackStatus: string;
}

export interface OrchestratorConfig {
  github: GitHubConfig;
  claude: ClaudeConfig;
  monitor: MonitorConfig;
  personas: Record<PersonaType, PersonaConfig>;
}

// Command options
export interface WorkflowOptions {
  timeout?: number;
  pollInterval?: number;
  verbose?: boolean;
  noMonitor?: boolean;
  fork?: boolean;
  json?: boolean;
}

export interface WatchOptions {
  daemon?: boolean;
  pollInterval?: number;
}
