// Issue types
export type IssueStatus = 'draft' | 'refining' | 'feedback' | 'ready' | 'exported' | 'archived';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type PersonaType = 'orchestrator' | 'review-draft' | 'architect' | 'qa-review' | 'triage' | 'system' | 'user';
export type LinkType = 'blocks' | 'depends_on' | 'duplicates' | 'related_to';

// Project types
export interface Project {
  id: string;
  name: string;
  gitRemote?: string;
  gitPath?: string;
  createdAt: string;
  updatedAt: string;
  stats?: ProjectStats;
}

export interface ProjectStats {
  total: number;
  byStatus: Record<IssueStatus, number>;
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
  createdAt: string;
  updatedAt: string;
}

export interface IssueLink {
  id: string;
  sourceId: string;
  targetId: string;
  linkType: LinkType;
  createdAt: string;
}

export interface DocLink {
  id: string;
  issueId: string;
  filePath: string;
  title?: string;
  exists?: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  issueId: string;
  persona: PersonaType;
  content: string;
  parentCommentId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  // For nested display (populated when building tree)
  replies?: Comment[];
  depth?: number;
}

export interface IssueWithRelations extends Issue {
  parent?: Issue;
  children: Issue[];
  links: IssueLink[];
  linkedIssues: { link: IssueLink; issue: Issue }[];
  docs: DocLink[];
  comments: Comment[];
  project?: Project;
}

// API response types
export interface LinkWithIssue extends IssueLink {
  linkedIssue: Issue;
  direction: 'incoming' | 'outgoing';
}
