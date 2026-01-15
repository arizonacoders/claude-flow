import type { Issue } from '../types';

interface IssueCardProps {
  issue: Issue;
  allIssues: Issue[];
  onClick: () => void;
  onDragStart?: (e: React.DragEvent, issue: Issue) => void;
}

const priorityColors: Record<string, string> = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#f59e0b',
  critical: '#ef4444',
};

const priorityDots: Record<string, string> = {
  low: '\u25CF\u25CB\u25CB\u25CB',
  medium: '\u25CF\u25CF\u25CB\u25CB',
  high: '\u25CF\u25CF\u25CF\u25CB',
  critical: '\u25CF\u25CF\u25CF\u25CF',
};

export function IssueCard({ issue, allIssues, onClick, onDragStart }: IssueCardProps) {
  // Find parent issue if this is a subtask
  const parent = issue.parentId
    ? allIssues.find(i => i.id === issue.parentId)
    : null;

  // Find children (subtasks) of this issue
  const children = allIssues.filter(i => i.parentId === issue.id);

  // Determine card type for coloring
  let cardType = 'is-task'; // default: blue
  if (children.length > 0) {
    cardType = 'is-epic'; // has children: pink/red
  } else if (parent) {
    cardType = 'is-subtask'; // has parent: green
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (onDragStart) {
      onDragStart(e, issue);
    }
  };

  return (
    <div
      className={`issue-card ${cardType}`}
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
    >
      {parent && (
        <div className="issue-card-parent" title={`Subtask of: ${parent.title}`}>
          ↳ {parent.title.length > 25 ? parent.title.substring(0, 25) + '...' : parent.title}
        </div>
      )}
      <div className="issue-card-title">{issue.title}</div>
      <div className="issue-card-meta">
        <span
          className="issue-priority"
          style={{ color: priorityColors[issue.priority] }}
          title={issue.priority}
        >
          {priorityDots[issue.priority]}
        </span>
        {children.length > 0 && (
          <span className="issue-subtask-count" title={`${children.length} subtask(s)`}>
            {children.length} subtask{children.length > 1 ? 's' : ''}
          </span>
        )}
        <span className="issue-id">#{issue.number}</span>
      </div>
      {issue.description && (
        <div className="issue-card-desc">
          {issue.description.length > 80
            ? issue.description.substring(0, 80) + '...'
            : issue.description}
        </div>
      )}
    </div>
  );
}
