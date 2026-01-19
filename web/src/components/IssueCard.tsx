import { useState } from 'react';
import { STATUS_COLORS, PRIORITY_COLORS } from '../constants/colors';
import type { Issue } from '../types';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / MS_PER_MINUTE);
  const diffHours = Math.floor(diffMs / MS_PER_HOUR);
  const diffDays = Math.floor(diffMs / MS_PER_DAY);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface IssueCardProps {
  issue: Issue;
  allIssues: Issue[];
  onClick: () => void;
  onDragStart?: (e: React.DragEvent, issue: Issue) => void;
  onSelectIssue?: (issue: Issue) => void;
}

const priorityDots: Record<string, string> = {
  low: '\u25CF\u25CB\u25CB\u25CB',
  medium: '\u25CF\u25CF\u25CB\u25CB',
  high: '\u25CF\u25CF\u25CF\u25CB',
  critical: '\u25CF\u25CF\u25CF\u25CF',
};

export function IssueCard({ issue, allIssues, onClick, onDragStart, onSelectIssue }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);
  // Check if this is a subtask
  const hasParent = Boolean(issue.parentId);

  // Find children (subtasks) of this issue
  const children = allIssues.filter(i => i.parentId === issue.id);

  // Determine card type for coloring
  let cardType = 'is-task'; // default: blue
  if (children.length > 0) {
    cardType = 'is-epic'; // has children: pink/red
  } else if (hasParent) {
    cardType = 'is-subtask'; // has parent: green
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (onDragStart) {
      onDragStart(e, issue);
    }
  };

  const lastActivity = issue.updatedAt;

  return (
    <div
      className={`issue-card ${cardType}`}
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
    >
      <div className="issue-card-header">
        <span className="issue-id">#{issue.number}</span>
        <span
          className="issue-priority"
          style={{ color: PRIORITY_COLORS[issue.priority] }}
          title={issue.priority}
        >
          {priorityDots[issue.priority]}
        </span>
      </div>

      <div className="issue-card-title">{issue.title}</div>

      <div className="issue-card-time">
        <span title="Created">📅 {getRelativeTime(issue.createdAt)}</span>
        <span title="Last activity">💬 {getRelativeTime(lastActivity)}</span>
      </div>

      {children.length > 0 && (
        <div className="issue-card-children">
          <button
            className="children-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? '▼' : '▶'} {children.length} subtask{children.length > 1 ? 's' : ''}
          </button>
          {expanded && (
            <ul className="children-list">
              {children.map(child => (
                <li
                  key={child.id}
                  tabIndex={0}
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectIssue?.(child);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectIssue?.(child);
                    }
                  }}
                >
                  <span
                    className="child-status-dot"
                    style={{ backgroundColor: STATUS_COLORS[child.status] }}
                    title={child.status}
                  />
                  <span className="child-number">#{child.number}</span>
                  <span className="child-title">{child.title}</span>
                  <span
                    className="child-priority"
                    style={{ color: PRIORITY_COLORS[child.priority] }}
                  >
                    {priorityDots[child.priority]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
