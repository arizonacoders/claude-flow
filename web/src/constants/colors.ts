// Status colors
export const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  refining: '#3b82f6',
  feedback: '#f59e0b',
  ready: '#22c55e',
  exported: '#8b5cf6',
  archived: '#64748b',
};

// Priority colors
export const PRIORITY_COLORS: Record<string, string> = {
  low: '#9ca3af',
  medium: '#3b82f6',
  high: '#f97316',
  critical: '#ef4444',
};

// Status labels for display
export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  refining: 'Refining',
  feedback: 'Feedback',
  ready: 'Ready',
  exported: 'Exported',
  archived: 'Archived',
};

// Active statuses (shown in Kanban)
export const ACTIVE_STATUSES = ['draft', 'refining', 'feedback', 'ready'] as const;

// Completed statuses (shown in list)
export const COMPLETED_STATUSES = ['exported', 'archived'] as const;
