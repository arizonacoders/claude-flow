import { useState } from 'react';
import { useIssues } from '../hooks/useIssues';
import { STATUS_COLORS, STATUS_LABELS, COMPLETED_STATUSES } from '../constants/colors';
import type { Issue } from '../types';

interface CompletedListProps {
  onSelectIssue: (issue: Issue) => void;
  projectId?: string | null;
}

type FilterOption = 'all' | 'exported' | 'archived';

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function CompletedList({ onSelectIssue, projectId }: CompletedListProps) {
  const { issues, loading, error } = useIssues(undefined, projectId);
  const [filter, setFilter] = useState<FilterOption>('all');

  if (loading) {
    return <div className="loading">Loading issues...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  // Filter to completed statuses
  const completedIssues = issues
    .filter(issue => COMPLETED_STATUSES.includes(issue.status as typeof COMPLETED_STATUSES[number]))
    .filter(issue => filter === 'all' || issue.status === filter)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div className="completed-list">
      <div className="completed-header">
        <h2>Completed Issues</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterOption)}
          className="filter-select"
        >
          <option value="all">All ({issues.filter(i => COMPLETED_STATUSES.includes(i.status as typeof COMPLETED_STATUSES[number])).length})</option>
          <option value="exported">Exported ({issues.filter(i => i.status === 'exported').length})</option>
          <option value="archived">Archived ({issues.filter(i => i.status === 'archived').length})</option>
        </select>
      </div>

      {completedIssues.length === 0 ? (
        <div className="completed-empty">No completed issues</div>
      ) : (
        <div className="completed-items">
          {completedIssues.map(issue => (
            <div
              key={issue.id}
              className="completed-item"
              tabIndex={0}
              role="button"
              onClick={() => onSelectIssue(issue)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectIssue(issue);
                }
              }}
            >
              <span
                className="completed-badge"
                style={{ backgroundColor: STATUS_COLORS[issue.status] }}
              >
                {STATUS_LABELS[issue.status].toUpperCase()}
              </span>
              <div className="completed-content">
                <div className="completed-title">
                  <span className="completed-number">#{issue.number}</span>
                  {issue.title}
                </div>
                <div className="completed-meta">
                  Completed {formatDate(issue.updatedAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
