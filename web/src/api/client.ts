import type {
  Issue,
  IssueWithRelations,
  Comment,
  LinkWithIssue,
  DocLink,
  IssueStatus,
  Priority,
  LinkType,
  PersonaType,
} from '../types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Issues
export async function getIssues(status?: IssueStatus, projectId?: string | null): Promise<Issue[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (projectId) params.set('project_id', projectId);
  const queryString = params.toString();
  const url = queryString ? `${API_BASE}/issues?${queryString}` : `${API_BASE}/issues`;
  return fetchJson<Issue[]>(url);
}

export async function getIssue(id: string): Promise<IssueWithRelations> {
  return fetchJson<IssueWithRelations>(`${API_BASE}/issues/${id}`);
}

export async function createIssue(data: {
  title: string;
  description?: string;
  priority?: Priority;
  parentId?: string;
  projectId?: string;
}): Promise<Issue> {
  return fetchJson<Issue>(`${API_BASE}/issues`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateIssue(
  id: string,
  data: {
    title?: string;
    description?: string;
    status?: IssueStatus;
    priority?: Priority;
  }
): Promise<Issue> {
  return fetchJson<Issue>(`${API_BASE}/issues/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteIssue(id: string): Promise<{ deleted: boolean }> {
  return fetchJson<{ deleted: boolean }>(`${API_BASE}/issues/${id}`, {
    method: 'DELETE',
  });
}

// Comments
export async function getComments(issueId: string): Promise<Comment[]> {
  return fetchJson<Comment[]>(`${API_BASE}/issues/${issueId}/comments`);
}

export async function addComment(
  issueId: string,
  data: { persona: PersonaType; content: string; parentCommentId?: string; metadata?: Record<string, unknown> }
): Promise<Comment> {
  return fetchJson<Comment>(`${API_BASE}/issues/${issueId}/comments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Links
export async function getLinks(issueId: string): Promise<LinkWithIssue[]> {
  return fetchJson<LinkWithIssue[]>(`${API_BASE}/issues/${issueId}/links`);
}

export async function createLink(
  issueId: string,
  data: { targetId: string; linkType: LinkType }
): Promise<LinkWithIssue> {
  return fetchJson<LinkWithIssue>(`${API_BASE}/issues/${issueId}/links`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteLink(linkId: string): Promise<{ deleted: boolean }> {
  return fetchJson<{ deleted: boolean }>(`${API_BASE}/issues/links/${linkId}`, {
    method: 'DELETE',
  });
}

// Docs
export async function getDocs(issueId: string): Promise<DocLink[]> {
  return fetchJson<DocLink[]>(`${API_BASE}/issues/${issueId}/docs`);
}

export async function addDoc(
  issueId: string,
  data: { filePath: string; title?: string }
): Promise<DocLink> {
  return fetchJson<DocLink>(`${API_BASE}/issues/${issueId}/docs`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getDocContent(docId: string): Promise<DocLink & { content: string }> {
  return fetchJson<DocLink & { content: string }>(`${API_BASE}/issues/docs/${docId}/content`);
}

export async function deleteDoc(docId: string): Promise<{ deleted: boolean }> {
  return fetchJson<{ deleted: boolean }>(`${API_BASE}/issues/docs/${docId}`, {
    method: 'DELETE',
  });
}
