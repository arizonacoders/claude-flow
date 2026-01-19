# Web UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign claude-flow Web UI with tabbed navigation, updated Kanban board (new statuses), rich issue cards with nested children, completed list view, and project stats.

**Architecture:** React SPA with three main views (Active/Completed/Stats) managed via tab state. Issue cards enhanced with time metadata and collapsible child issues. New components for completed list and stats dashboard.

**Tech Stack:** React 19, TypeScript, Vite, plain CSS (no framework)

---

## Task 1: Update Types for New Statuses

**Files:**
- Modify: `web/src/types/index.ts:2`

**Step 1: Update IssueStatus type**

```typescript
// Replace line 2
export type IssueStatus = 'draft' | 'refining' | 'feedback' | 'ready' | 'exported' | 'archived';
```

**Step 2: Update PersonaType to include new personas**

```typescript
// Replace line 4
export type PersonaType = 'orchestrator' | 'review-draft' | 'architect' | 'qa-review' | 'triage' | 'system' | 'user';
```

**Step 3: Verify TypeScript compiles**

Run: `cd web && npm run build`
Expected: Build succeeds (or shows errors in components using old statuses - we'll fix those next)

**Step 4: Commit**

```bash
git add web/src/types/index.ts
git commit -m "feat(web): update IssueStatus type for new workflow"
```

---

## Task 2: Create Color Constants File

**Files:**
- Create: `web/src/constants/colors.ts`

**Step 1: Create the colors file**

```typescript
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
```

**Step 2: Commit**

```bash
git add web/src/constants/colors.ts
git commit -m "feat(web): add color and status constants"
```

---

## Task 3: Create TabNavigation Component

**Files:**
- Create: `web/src/components/TabNavigation.tsx`

**Step 1: Create the component**

```typescript
interface TabNavigationProps {
  activeTab: 'active' | 'completed' | 'stats';
  onTabChange: (tab: 'active' | 'completed' | 'stats') => void;
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const tabs = [
    { id: 'active' as const, label: 'Active' },
    { id: 'completed' as const, label: 'Completed' },
    { id: 'stats' as const, label: 'Project Stats' },
  ];

  return (
    <nav className="tab-navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
```

**Step 2: Add styles to App.css**

Add to end of `web/src/App.css`:

```css
/* Tab Navigation */
.tab-navigation {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 0;
}

.tab-button {
  padding: 0.75rem 1.5rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  color: #666;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.tab-button:hover {
  color: #333;
}

.tab-button.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}
```

**Step 3: Verify it renders**

Run: `cd web && npm run dev`
Expected: Dev server starts without errors

**Step 4: Commit**

```bash
git add web/src/components/TabNavigation.tsx web/src/App.css
git commit -m "feat(web): add TabNavigation component"
```

---

## Task 4: Update IssueList with New Statuses

**Files:**
- Modify: `web/src/components/IssueList.tsx`

**Step 1: Update imports and constants**

Replace lines 1-21:

```typescript
import { useState } from 'react';
import { useIssues } from '../hooks/useIssues';
import { IssueCard } from './IssueCard';
import { CreateIssueForm } from './CreateIssueForm';
import { updateIssue } from '../api/client';
import { STATUS_COLORS, STATUS_LABELS, ACTIVE_STATUSES } from '../constants/colors';
import type { Issue, IssueStatus } from '../types';

interface IssueListProps {
  onSelectIssue: (issue: Issue) => void;
  projectId?: string | null;
}
```

**Step 2: Update statuses array in component**

Replace the `statuses` constant and `statusLabels` (remove statusLabels, use imported):

```typescript
export function IssueList({ onSelectIssue, projectId }: IssueListProps) {
  const { issues, loading, error, refetch } = useIssues(undefined, projectId);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draggedIssue, setDraggedIssue] = useState<Issue | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(null);
```

**Step 3: Update the Kanban columns rendering**

Replace the kanban-board section (around line 108-136):

```typescript
      <div className="kanban-board" onDragEnd={handleDragEnd}>
        {ACTIVE_STATUSES.map(status => {
          const columnIssues = issues.filter(issue =>
            issue.status === status && !issue.parentId
          );
          return (
            <div
              key={status}
              className={`kanban-column ${dragOverColumn === status ? 'drag-over' : ''}`}
              style={{ borderLeftColor: STATUS_COLORS[status] }}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
            >
              <div className="kanban-header">
                <span className="kanban-title">{STATUS_LABELS[status]}</span>
                <span className="kanban-count">{columnIssues.length}</span>
              </div>
              <div className="kanban-cards">
                {columnIssues.map(issue => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    allIssues={issues}
                    onClick={() => onSelectIssue(issue)}
                    onDragStart={handleDragStart}
                    onSelectIssue={onSelectIssue}
                  />
                ))}
                {columnIssues.length === 0 && (
                  <div className="kanban-empty">No issues</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
```

**Step 4: Update CSS for status border**

Add to `web/src/App.css`:

```css
.kanban-column {
  border-left: 4px solid #9ca3af;
}

.kanban-count {
  display: inline-block;
  background-color: #e5e5e5;
  padding: 0.125rem 0.5rem;
  border-radius: 10px;
  font-size: 0.75rem;
  margin-left: 0.5rem;
}
```

**Step 5: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add web/src/components/IssueList.tsx web/src/App.css
git commit -m "feat(web): update IssueList with new workflow statuses"
```

---

## Task 5: Enhance IssueCard with Time Info

**Files:**
- Modify: `web/src/components/IssueCard.tsx`

**Step 1: Add relative time utility**

Add at top of file after imports:

```typescript
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
```

**Step 2: Update IssueCardProps interface**

```typescript
interface IssueCardProps {
  issue: Issue;
  allIssues: Issue[];
  onClick: () => void;
  onDragStart?: (e: React.DragEvent, issue: Issue) => void;
  onSelectIssue?: (issue: Issue) => void;
}
```

**Step 3: Update the card JSX**

Replace the return statement with:

```typescript
  const [expanded, setExpanded] = useState(false);

  // Get last activity from comments or updatedAt
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
          style={{ color: priorityColors[issue.priority] }}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectIssue?.(child);
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
                    style={{ color: priorityColors[child.priority] }}
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
```

**Step 4: Add import for colors and useState**

```typescript
import { useState } from 'react';
import { STATUS_COLORS } from '../constants/colors';
import type { Issue } from '../types';
```

**Step 5: Add CSS for enhanced cards**

Add to `web/src/App.css`:

```css
/* Enhanced Issue Card */
.issue-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.issue-card-time {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: #666;
  margin-top: 0.5rem;
}

.issue-card-children {
  margin-top: 0.75rem;
  border-top: 1px solid rgba(0,0,0,0.1);
  padding-top: 0.5rem;
}

.children-toggle {
  background: none;
  border: none;
  color: #666;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.25rem 0;
  width: 100%;
  text-align: left;
}

.children-toggle:hover {
  color: #333;
}

.children-list {
  list-style: none;
  margin: 0.5rem 0 0 0;
  padding: 0;
}

.children-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0;
  font-size: 0.8rem;
  cursor: pointer;
  border-radius: 4px;
}

.children-list li:hover {
  background-color: rgba(0,0,0,0.05);
}

.child-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.child-number {
  color: #888;
  font-family: monospace;
  font-size: 0.75rem;
}

.child-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.child-priority {
  font-size: 0.7rem;
  letter-spacing: -1px;
}
```

**Step 6: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add web/src/components/IssueCard.tsx web/src/App.css
git commit -m "feat(web): enhance IssueCard with time info and nested children"
```

---

## Task 6: Create CompletedList Component

**Files:**
- Create: `web/src/components/CompletedList.tsx`

**Step 1: Create the component**

```typescript
import { useState } from 'react';
import { useIssues } from '../hooks/useIssues';
import { STATUS_COLORS, STATUS_LABELS, COMPLETED_STATUSES } from '../constants/colors';
import type { Issue, IssueStatus } from '../types';

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
              onClick={() => onSelectIssue(issue)}
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
```

**Step 2: Add CSS**

Add to `web/src/App.css`:

```css
/* Completed List */
.completed-list {
  max-width: 900px;
  margin: 0 auto;
}

.completed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.completed-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #333;
}

.filter-select {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background-color: #fff;
  font-size: 0.875rem;
  color: #333;
  cursor: pointer;
}

.completed-empty {
  text-align: center;
  color: #888;
  padding: 3rem;
}

.completed-items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.completed-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.completed-item:hover {
  border-color: #ccc;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.completed-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}

.completed-content {
  flex: 1;
}

.completed-title {
  font-weight: 500;
  color: #333;
  margin-bottom: 0.25rem;
}

.completed-number {
  color: #888;
  font-family: monospace;
  margin-right: 0.5rem;
}

.completed-meta {
  font-size: 0.8rem;
  color: #888;
}
```

**Step 3: Commit**

```bash
git add web/src/components/CompletedList.tsx web/src/App.css
git commit -m "feat(web): add CompletedList component for exported/archived issues"
```

---

## Task 7: Create ProjectStats Component

**Files:**
- Create: `web/src/components/ProjectStats.tsx`

**Step 1: Create the component**

```typescript
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
```

**Step 2: Add CSS**

Add to `web/src/App.css`:

```css
/* Project Stats */
.project-stats {
  max-width: 900px;
  margin: 0 auto;
}

.stats-title {
  margin: 0 0 1.5rem;
  font-size: 1.25rem;
  color: #333;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
}

.stat-value {
  font-size: 2.5rem;
  font-weight: 600;
  color: #333;
  line-height: 1;
}

.stat-label {
  font-size: 0.875rem;
  color: #888;
  margin-top: 0.5rem;
}

.stats-breakdown {
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 1.5rem;
}

.stats-breakdown h3 {
  margin: 0 0 1rem;
  font-size: 1rem;
  color: #333;
}

.status-bars {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.status-bar-row {
  display: grid;
  grid-template-columns: 100px 1fr 40px;
  align-items: center;
  gap: 1rem;
}

.status-bar-label {
  font-size: 0.875rem;
  color: #666;
}

.status-bar-track {
  height: 24px;
  background-color: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}

.status-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
  min-width: 4px;
}

.status-bar-count {
  font-size: 0.875rem;
  color: #333;
  font-weight: 500;
  text-align: right;
}

@media (max-width: 640px) {
  .stats-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

**Step 3: Commit**

```bash
git add web/src/components/ProjectStats.tsx web/src/App.css
git commit -m "feat(web): add ProjectStats component with summary cards and bar chart"
```

---

## Task 8: Update App.tsx with Tab Navigation

**Files:**
- Modify: `web/src/App.tsx`

**Step 1: Update imports**

```typescript
import { useState, useEffect } from 'react';
import { IssueList } from './components/IssueList';
import { IssueDetail } from './components/IssueDetail';
import { ProjectSelector } from './components/ProjectSelector';
import { TabNavigation } from './components/TabNavigation';
import { CompletedList } from './components/CompletedList';
import { ProjectStats } from './components/ProjectStats';
import type { Issue } from './types';
import './App.css';
```

**Step 2: Add tab state**

Add after the existing state declarations:

```typescript
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'stats'>('active');
```

**Step 3: Update the main content**

Replace the `<main>` section:

```typescript
      <main className="app-main">
        {selectedIssueId ? (
          <IssueDetail
            issueId={selectedIssueId}
            onBack={handleBack}
            onSelectIssue={handleSelectIssue}
          />
        ) : (
          <>
            <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
            {activeTab === 'active' && (
              <IssueList onSelectIssue={handleSelectIssue} projectId={selectedProjectId} />
            )}
            {activeTab === 'completed' && (
              <CompletedList onSelectIssue={handleSelectIssue} projectId={selectedProjectId} />
            )}
            {activeTab === 'stats' && (
              <ProjectStats projectId={selectedProjectId} />
            )}
          </>
        )}
      </main>
```

**Step 4: Verify build and test**

Run: `cd web && npm run build && npm run dev`
Expected: Build succeeds, dev server shows tabs

**Step 5: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(web): integrate tab navigation with Active/Completed/Stats views"
```

---

## Task 9: Update Header Layout

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.css`

**Step 1: Update header structure in App.tsx**

Replace the header section:

```typescript
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-title" onClick={handleTitleClick} style={{ cursor: 'pointer' }}>
            claude-flow
          </h1>
        </div>
        <div className="app-header-right">
          <ProjectSelector
            selectedProjectId={selectedProjectId}
            onSelectProject={handleSelectProject}
          />
        </div>
      </header>
```

**Step 2: Update header CSS**

Update the header styles in App.css:

```css
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background-color: #fff;
  border-bottom: 1px solid #e0e0e0;
}

.app-header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.app-header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.app-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #333;
}

.app-subtitle {
  display: none;
}
```

**Step 3: Commit**

```bash
git add web/src/App.tsx web/src/App.css
git commit -m "style(web): update header layout"
```

---

## Task 10: Final Integration Test

**Step 1: Build production bundle**

Run: `cd web && npm run build`
Expected: Build succeeds with no errors

**Step 2: Start the full stack**

Run: `cd /Users/jefferyahern/PhpstormProjects/claude-flow && npm run cli -- serve --port 3010`
Expected: Server starts, serves web UI

**Step 3: Manual testing checklist**

- [ ] Active tab shows 4-column Kanban (draft, refining, feedback, ready)
- [ ] Issue cards show time info (created, last activity)
- [ ] Parent cards show collapsible children
- [ ] Clicking child opens detail view
- [ ] Completed tab shows list of exported/archived
- [ ] Filter dropdown works
- [ ] Stats tab shows summary cards and bar chart
- [ ] Drag-drop still works on Active tab
- [ ] Project selector filters all views

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(web): complete UI redesign with tabs, enhanced cards, and stats"
```

---

## Summary

| Task | Component | Description |
|------|-----------|-------------|
| 1 | types/index.ts | Update IssueStatus type |
| 2 | constants/colors.ts | Create color constants |
| 3 | TabNavigation.tsx | Create tab component |
| 4 | IssueList.tsx | Update columns to new statuses |
| 5 | IssueCard.tsx | Add time info, nested children |
| 6 | CompletedList.tsx | Create completed list view |
| 7 | ProjectStats.tsx | Create stats dashboard |
| 8 | App.tsx | Integrate tabs |
| 9 | App.tsx/css | Update header |
| 10 | - | Integration test |

**Total estimated tasks:** 10
**Files created:** 4 (TabNavigation, CompletedList, ProjectStats, colors.ts)
**Files modified:** 4 (types, IssueList, IssueCard, App.tsx, App.css)
