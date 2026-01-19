import { useState, useMemo } from 'react';
import { useIssue } from '../hooks/useIssues';
import { CommentThread } from './CommentThread';
import { SpecificationView } from './SpecificationView';
import { updateIssue } from '../api/client';
import { parseSpecFromComments, hasSpecContent } from '../utils/specParser';
import type { Issue, IssueStatus, Priority } from '../types';

interface IssueDetailProps {
  issueId: string;
  onBack: () => void;
  onSelectIssue: (issue: Issue) => void;
}

const statusLabels: Record<IssueStatus, string> = {
  'draft': 'Draft',
  'refining': 'Refining',
  'feedback': 'Feedback',
  'ready': 'Ready',
  'exported': 'Exported',
  'archived': 'Archived',
};

const priorityLabels: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

const priorityColors: Record<Priority, string> = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#f59e0b',
  critical: '#ef4444',
};

const linkTypeLabels: Record<string, string> = {
  blocks: 'blocks',
  depends_on: 'depends on',
  duplicates: 'duplicates',
  related_to: 'related to',
};

export function IssueDetail({ issueId, onBack, onSelectIssue }: IssueDetailProps) {
  const { issue, loading, error, refetch } = useIssue(issueId);
  const [archiving, setArchiving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Parse spec fields from comments (must be before early returns per React hooks rules)
  const spec = useMemo(
    () => issue ? parseSpecFromComments(issue.comments) : {},
    [issue?.comments]
  );
  const showSpec = hasSpecContent(spec);

  const handleArchive = async () => {
    if (!issue || archiving) return;

    setArchiving(true);
    try {
      const newStatus = issue.status === 'archived' ? 'draft' : 'archived';
      await updateIssue(issue.id, { status: newStatus });

      const message = newStatus === 'archived'
        ? 'Issue archived and removed from board'
        : 'Issue unarchived';
      setToast({ type: 'success', message });

      // Redirect to list after 1 second for archived, refetch for unarchived
      if (newStatus === 'archived') {
        setTimeout(() => {
          onBack();
        }, 1000);
      } else {
        await refetch();
        setTimeout(() => setToast(null), 3000);
        setArchiving(false);
      }
    } catch (err) {
      setToast({
        type: 'error',
        message: `Failed to ${issue.status === 'archived' ? 'unarchive' : 'archive'} issue. Please try again.`
      });
      setTimeout(() => setToast(null), 3000);
      setArchiving(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading issue...</div>;
  }

  if (error || !issue) {
    return (
      <div className="error">
        <p>Error: {error || 'Issue not found'}</p>
        <button onClick={onBack}>Back to List</button>
      </div>
    );
  }

  return (
    <div className="issue-detail">
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
      <div className="issue-detail-header">
        <button className="back-button" onClick={onBack}>
          &larr; Back to List
        </button>
        <button
          className={`archive-button ${issue.status === 'archived' ? 'unarchive' : ''}`}
          onClick={handleArchive}
          disabled={archiving}
          aria-label={issue.status === 'archived' ? 'Unarchive this issue' : 'Archive this issue'}
        >
          {archiving ? (
            <>
              <span className="archive-spinner" />
              {issue.status === 'archived' ? 'Unarchiving...' : 'Archiving...'}
            </>
          ) : (
            issue.status === 'archived' ? 'Unarchive' : 'Archive'
          )}
        </button>
      </div>

      <div className="issue-detail-content">
        <h1>{issue.title}</h1>

        <div className="issue-meta-row">
          <span className="issue-status-badge">{statusLabels[issue.status]}</span>
          <span
            className="issue-priority-badge"
            style={{ backgroundColor: priorityColors[issue.priority] }}
          >
            {priorityLabels[issue.priority]}
          </span>
          <span className="issue-id-badge">#{issue.number}</span>
        </div>

        {issue.description && (
          <div className="issue-description">
            <h3>Description</h3>
            <p>{issue.description}</p>
          </div>
        )}

        {/* Specification - parsed from comments */}
        {showSpec && <SpecificationView spec={spec} />}

        {/* Hierarchy */}
        {(issue.parent || issue.children.length > 0) && (
          <div className="issue-section">
            <h3>Hierarchy</h3>
            {issue.parent && (
              <div className="issue-parent">
                <span className="label">Parent:</span>
                <button
                  className="issue-link-btn"
                  onClick={() => onSelectIssue(issue.parent!)}
                >
                  {issue.parent.title}
                </button>
              </div>
            )}
            {issue.children.length > 0 && (
              <div className="issue-children">
                <span className="label">Children:</span>
                <ul>
                  {issue.children.map(child => (
                    <li key={child.id}>
                      <button
                        className="issue-link-btn"
                        onClick={() => onSelectIssue(child)}
                      >
                        {child.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Links */}
        {issue.linkedIssues.length > 0 && (
          <div className="issue-section">
            <h3>Links ({issue.linkedIssues.length})</h3>
            <ul className="issue-links-list">
              {issue.linkedIssues.map(({ link, issue: linkedIssue }) => (
                <li key={link.id}>
                  <span className="link-type">{linkTypeLabels[link.linkType]}</span>
                  <button
                    className="issue-link-btn"
                    onClick={() => onSelectIssue(linkedIssue)}
                  >
                    {linkedIssue.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Docs */}
        {issue.docs.length > 0 && (
          <div className="issue-section">
            <h3>Documentation ({issue.docs.length})</h3>
            <ul className="issue-docs-list">
              {issue.docs.map(doc => (
                <li key={doc.id}>
                  <span className="doc-icon">\uD83D\uDCC4</span>
                  <span className="doc-title">{doc.title || doc.filePath}</span>
                  <span className="doc-path">{doc.filePath}</span>
                  {doc.exists === false && (
                    <span className="doc-missing">(file not found)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Comments */}
        <div className="issue-section">
          <CommentThread
            issueId={issue.id}
            comments={issue.comments}
            onCommentAdded={refetch}
          />
        </div>
      </div>
    </div>
  );
}
