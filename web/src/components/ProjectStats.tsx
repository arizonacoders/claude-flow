import { useIssues } from '../hooks/useIssues';
import { STATUS_COLORS, STATUS_LABELS } from '../constants/colors';
import type { IssueStatus } from '../types';

interface ProjectStatsProps {
  projectId?: string | null;
  projectName?: string;
}

const ALL_STATUSES: IssueStatus[] = ['draft', 'refining', 'feedback', 'ready', 'exported', 'archived'];

export function ProjectStats({ projectId, projectName }: ProjectStatsProps) {
  const { issues, loading, error } = useIssues(undefined, projectId);

  if (loading) {
    return <div className="loading">Loading stats...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  // Calculate stats
  const total = issues.length;
  const byStatus = ALL_STATUSES.reduce((acc, status) => {
    acc[status] = issues.filter(i => i.status === status).length;
    return acc;
  }, {} as Record<IssueStatus, number>);

  const active = byStatus.draft + byStatus.refining + byStatus.feedback + byStatus.ready;
  const maxCount = Math.max(...Object.values(byStatus), 1);

  return (
    <div className="project-stats">
      <h2 className="stats-title">
        {projectName ? `Project: ${projectName}` : 'All Projects'}
      </h2>

      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-value">{active}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{byStatus.ready}</div>
          <div className="stat-label">Ready</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{byStatus.exported}</div>
          <div className="stat-label">Exported</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{total}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>

      <div className="stats-breakdown">
        <h3>By Status</h3>
        <div className="status-bars">
          {ALL_STATUSES.map(status => (
            <div key={status} className="status-bar-row">
              <span className="status-bar-label">{STATUS_LABELS[status]}</span>
              <div className="status-bar-track">
                <div
                  className="status-bar-fill"
                  style={{
                    width: `${(byStatus[status] / maxCount) * 100}%`,
                    backgroundColor: STATUS_COLORS[status],
                  }}
                />
              </div>
              <span className="status-bar-count">{byStatus[status]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
