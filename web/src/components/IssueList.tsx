import { useState } from 'react';
import { useIssues } from '../hooks/useIssues';
import { IssueCard } from './IssueCard';
import { CreateIssueForm } from './CreateIssueForm';
import { updateIssue } from '../api/client';
import type { Issue, IssueStatus } from '../types';

interface IssueListProps {
  onSelectIssue: (issue: Issue) => void;
  projectId?: string | null;
}

const statuses: IssueStatus[] = ['draft', 'arch-review', 'test-design', 'ready', 'archived'];

const statusLabels: Record<IssueStatus, string> = {
  'draft': 'Draft',
  'arch-review': 'Architectural Review',
  'test-design': 'Test Case Design',
  'ready': 'Ready',
  'archived': 'Archived',
};

export function IssueList({ onSelectIssue, projectId }: IssueListProps) {
  const { issues, loading, error, refetch } = useIssues(undefined, projectId);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draggedIssue, setDraggedIssue] = useState<Issue | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(null);

  const handleIssueCreated = () => {
    setShowCreateForm(false);
    refetch();
  };

  const handleDragStart = (e: React.DragEvent, issue: Issue) => {
    setDraggedIssue(issue);
    e.dataTransfer.effectAllowed = 'move';
    // Add a slight delay to allow the drag image to be created
    setTimeout(() => {
      (e.target as HTMLElement).style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDraggedIssue(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, status: IssueStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the column entirely (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: IssueStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedIssue || draggedIssue.status === targetStatus) {
      return;
    }

    try {
      await updateIssue(draggedIssue.id, { status: targetStatus });
      refetch();
    } catch (err) {
      console.error('Failed to update issue status:', err);
    }
  };

  if (loading) {
    return <div className="loading">Loading issues...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        <button onClick={refetch}>Retry</button>
      </div>
    );
  }

  // Group issues by status
  const issuesByStatus = statuses.reduce((acc, status) => {
    acc[status] = issues.filter(issue => issue.status === status);
    return acc;
  }, {} as Record<IssueStatus, Issue[]>);

  return (
    <div className="issue-list">
      <div className="issue-list-header">
        <button className="create-issue-btn" onClick={() => setShowCreateForm(true)}>
          + New Issue
        </button>
      </div>

      <div className="kanban-board" onDragEnd={handleDragEnd}>
        {statuses.filter(s => s !== 'archived').map(status => (
          <div
            key={status}
            className={`kanban-column ${dragOverColumn === status ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status)}
          >
            <div className="kanban-header">
              <span className="kanban-title">{statusLabels[status]}</span>
              <span className="kanban-count">{issuesByStatus[status].length}</span>
            </div>
            <div className="kanban-cards">
              {issuesByStatus[status].map(issue => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  allIssues={issues}
                  onClick={() => onSelectIssue(issue)}
                  onDragStart={handleDragStart}
                />
              ))}
              {issuesByStatus[status].length === 0 && (
                <div className="kanban-empty">No issues</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showCreateForm && (
        <CreateIssueForm
          onCreated={handleIssueCreated}
          onCancel={() => setShowCreateForm(false)}
          projectId={projectId}
        />
      )}
    </div>
  );
}
