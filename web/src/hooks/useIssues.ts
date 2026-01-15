import { useState, useEffect, useCallback } from 'react';
import type { Issue, IssueWithRelations, IssueStatus } from '../types';
import * as api from '../api/client';

export function useIssues(status?: IssueStatus, projectId?: string | null) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getIssues(status, projectId);
      setIssues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch issues');
    } finally {
      setLoading(false);
    }
  }, [status, projectId]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  return { issues, loading, error, refetch: fetchIssues };
}

export function useIssue(id: string | null) {
  const [issue, setIssue] = useState<IssueWithRelations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIssue = useCallback(async () => {
    if (!id) {
      setIssue(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getIssue(id);
      setIssue(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch issue');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchIssue();
  }, [fetchIssue]);

  return { issue, loading, error, refetch: fetchIssue };
}
