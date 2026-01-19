// Issue types
export type IssueStatus =
  | 'draft'      // Just created, waiting for watcher
  | 'refining'   // Three Amigos workshop in progress
  | 'feedback'   // Needs user input (questions pending)
  | 'ready'      // All specs complete, ready for export
  | 'exported'   // Pushed to GitHub
  | 'archived';  // Closed without export

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export type PersonaType =
  | 'orchestrator'  // Refinement coordinator
  | 'review-draft'  // Alex - requirements clarity
  | 'architect'     // Sam - technical feasibility
  | 'qa-review'     // Blake - black box QA
  | 'triage'        // Nik - PM (legacy)
  | 'system'        // Automated actions
  | 'user';         // Human input

export type LinkType = 'blocks' | 'depends_on' | 'duplicates' | 'related_to';

// Project types
export interface Project {
  id: string;
  name: string;
  gitRemote?: string;
  gitPath?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectCreateInput {
  name: string;
  gitRemote?: string;
  gitPath?: string;
}

export interface ProjectUpdateInput {
  name?: string;
  gitRemote?: string;
  gitPath?: string;
}

export interface ProjectStats {
  total: number;
  byStatus: Record<IssueStatus, number>;
}

// Persona display names - friendly names for the Three Amigos team
export const personaDisplayNames: Record<PersonaType, string> = {
  'orchestrator': 'Orchestrator',
  'review-draft': 'Alex (Technical Product Owner)',
  'architect': 'Sam (Dev Team Leader)',
  'qa-review': 'Blake (QA)',
  'triage': 'Nik (Product Manager)',
  'system': 'System',
  'user': 'User',
};

// Get display name with fallback to raw persona type
export function getPersonaDisplayName(persona: string): string {
  return personaDisplayNames[persona as PersonaType] || persona;
}

export interface Issue {
  id: string;
  number: number;
  title: string;
  description?: string;
  status: IssueStatus;
  priority: Priority;
  parentId?: string;
  projectId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueCreateInput {
  title: string;
  description?: string;
  priority?: Priority;
  parentId?: string;
  projectId?: string;
}

export interface IssueUpdateInput {
  title?: string;
  description?: string;
  status?: IssueStatus;
  priority?: Priority;
  parentId?: string;
  projectId?: string;
}

// Issue Links (typed references between issues)
export interface IssueLink {
  id: string;
  sourceId: string;
  targetId: string;
  linkType: LinkType;
  createdAt: Date;
}

export interface IssueLinkCreateInput {
  sourceId: string;
  targetId: string;
  linkType: LinkType;
}

// Doc Links (references to local documentation)
export interface DocLink {
  id: string;
  issueId: string;
  filePath: string;
  title?: string;
  createdAt: Date;
}

export interface DocLinkCreateInput {
  issueId: string;
  filePath: string;
  title?: string;
}

// Comments (agent collaboration layer)
export interface Comment {
  id: string;
  issueId: string;
  persona: PersonaType;
  content: string;
  parentCommentId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  // For nested display (populated when building tree)
  replies?: Comment[];
  depth?: number;
}

export interface CommentCreateInput {
  issueId: string;
  persona: PersonaType;
  content: string;
  parentCommentId?: string;
  metadata?: Record<string, unknown>;
}

// Full issue with related data
export interface IssueWithRelations extends Issue {
  parent?: Issue;
  children: Issue[];
  links: IssueLink[];
  linkedIssues: { link: IssueLink; issue: Issue }[];
  docs: DocLink[];
  comments: Comment[];
  project?: Project;
}

// Config types
export interface ServerConfig {
  port: number;
  host: string;
}

export interface AppConfig {
  server: ServerConfig;
  dbPath: string;
}

// Command options
export interface IssueListOptions {
  status?: IssueStatus;
  json?: boolean;
  projectId?: string;
  all?: boolean;  // Show all issues across all projects
}

export interface IssueShowOptions {
  json?: boolean;
}

export interface LinkOptions {
  type: LinkType;
  remove?: boolean;
}

export interface DocOptions {
  add?: string;
  title?: string;
  remove?: string;
  list?: boolean;
}

export interface CommentOptions {
  persona: PersonaType;
  message?: string;
  metadata?: string;
}

export interface ServeOptions {
  port?: number;
  host?: string;
  open?: boolean;
}

export interface StatusOptions {
  json?: boolean;
  projectId?: string;
  all?: boolean;  // Show stats across all projects
}

// Export command types
export interface ExportOptions {
  json?: boolean;
  md?: boolean;
  output?: string;
  strict?: boolean;
  noColor?: boolean;
  quiet?: boolean;
}

export interface ExportedSpec {
  version: string;
  issueNumber: number;
  title: string;
  spec: {
    userStory?: string;
    acceptanceCriteria?: string;
    scope?: string;
    implementationApproach?: string;
    nonFunctionalRequirements?: string;
    specificationByExample?: string;
    edgeCases?: string;
    testStrategy?: string;
    definitionOfDone?: string;
  };
  metadata: {
    exportedAt: string;
    sourceStatus: IssueStatus;
    issueId: string;
    parsedFrom: 'synthesized' | 'individual';
    missingSections: string[];
  };
}

export interface ExtractedSections {
  sections: Record<string, string>;
  source: 'synthesized' | 'individual';
  missing: string[];
}
