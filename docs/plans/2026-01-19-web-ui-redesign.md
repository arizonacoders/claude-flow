# Web UI Redesign - Kanban Board & Project Stats

**Date:** 2026-01-19
**Status:** Approved

## Summary

Redesign the claude-flow Web UI to support the new workflow statuses and provide a richer, more detailed visual experience similar to Jira/GitHub Projects.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Visual style | Rich & detailed (icons, badges, visual hierarchy) |
| Kanban layout | Tabbed view: Active (4 cols) + Completed + Stats |
| Project stats | Minimal - issue counts by status |
| Issue cards | Time info (created, in-status, last activity) |
| Completed view | List view sorted by completion date |
| Child issues | Nested under parent card (collapsible) |

## New Workflow Statuses

```
draft → refining → feedback → ready → exported → archived
```

**Active tab columns:** draft, refining, feedback, ready
**Completed tab:** exported, archived (list view)

---

## Component Designs

### 1. Overall Layout & Navigation

**Header**
- Logo/title: "claude-flow" on the left
- Project selector dropdown (existing)
- Tab navigation: **Active** | **Completed** | **Project Stats**

**Tab Behavior**
- Active: 4-column Kanban board with drag-drop
- Completed: List view of exported/archived issues
- Project Stats: Summary cards and status breakdown chart

### 2. Issue Cards (Rich & Detailed)

**Card Layout**
```
┌─────────────────────────────────────┐
│ #21 • high ●●●○                     │
├─────────────────────────────────────┤
│ Add rate limiting to API endpoints  │
├─────────────────────────────────────┤
│ 📅 2d ago  ⏱️ 4h  💬 10m ago        │
├─────────────────────────────────────┤
│ ▼ 3 subtasks                        │
│  ├─ #21 Add rate limiting      ●●●○ │
│  ├─ #22 Add CSRF protection    ●●○○ │
│  └─ #23 Audit auth flows       ●○○○ │
└─────────────────────────────────────┘
```

**Visual Elements**
- Priority dots: ○○○○ (low) → ●●●● (critical) with color coding
- Time badges: Relative time ("2d ago", "4h", "10m ago")
- Left border color indicates column/status
- Hover: elevation/shadow effect

**Card Colors by Type**
- Regular issue: White/neutral
- Epic (has children): Light purple tint
- Subtask (has parent): Hidden (nested under parent)

**Nested Children Behavior**
- Subtasks collapsed by default ("▶ 3 subtasks")
- Click chevron to expand/collapse
- Subtasks show: number, truncated title, priority dots, status dot
- Click subtask row opens detail view
- Children only appear under parent (not as separate cards)

### 3. Completed Tab (List View)

**List Layout**
```
┌─────────────────────────────────────────────────────────────────┐
│ Completed Issues                                    Filter ▼    │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ EXPORTED  #21 Add rate limiting to API endpoints            │ │
│ │           Completed Jan 19 • GitHub #310                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ARCHIVED  #18 Legacy auth migration                         │ │
│ │           Archived Jan 15 • Superseded by #21               │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Elements**
- Status badge: EXPORTED (green) or ARCHIVED (gray)
- Issue number + title
- Metadata: Completion date, GitHub issue link (if exported)
- Filter dropdown: All / Exported only / Archived only
- Default sort: Newest completed first

### 4. Project Stats Tab

**Layout**
```
┌─────────────────────────────────────────────────────────────────┐
│ Project: claude-flow                                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │    12    │  │     4    │  │     8    │  │    23    │        │
│  │  Active  │  │  Ready   │  │ Exported │  │  Total   │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                 │
│ By Status                                                       │
│ Draft      ███░░░░░░░░░░░░░░░░░░  3                             │
│ Refining   █████████░░░░░░░░░░░░  5                             │
│ Feedback   ████░░░░░░░░░░░░░░░░░  2                             │
│ Ready      ████████░░░░░░░░░░░░░  4                             │
│ Exported   ████████████████░░░░░  8                             │
│ Archived   ███░░░░░░░░░░░░░░░░░░  1                             │
└─────────────────────────────────────────────────────────────────┘
```

**Elements**
- Summary cards: Active, Ready, Exported, Total counts
- Horizontal bar chart with status breakdown
- Consistent color coding per status

---

## Color Scheme

| Status | Color | Hex |
|--------|-------|-----|
| draft | Gray | `#9ca3af` |
| refining | Blue | `#3b82f6` |
| feedback | Amber | `#f59e0b` |
| ready | Green | `#22c55e` |
| exported | Purple | `#8b5cf6` |
| archived | Slate | `#64748b` |

| Priority | Color |
|----------|-------|
| low | Gray `#9ca3af` |
| medium | Blue `#3b82f6` |
| high | Orange `#f97316` |
| critical | Red `#ef4444` |

---

## Implementation Scope

### Files to Create/Modify

**New Components:**
- `web/src/components/TabNavigation.tsx` - Tab switcher
- `web/src/components/CompletedList.tsx` - List view for completed issues
- `web/src/components/ProjectStats.tsx` - Stats dashboard
- `web/src/components/StatCard.tsx` - Summary stat card
- `web/src/components/StatusBar.tsx` - Horizontal bar chart

**Modified Components:**
- `web/src/App.tsx` - Add tab routing
- `web/src/App.css` - New styles for rich cards, tabs, stats
- `web/src/components/IssueList.tsx` - Update columns to new statuses
- `web/src/components/IssueCard.tsx` - Add time info, nested children
- `web/src/types/index.ts` - Update IssueStatus type

**Backend Changes:**
- `src/types/index.ts` - Already updated with new statuses
- API endpoints - No changes needed (already support all statuses)

### Out of Scope (Future)

- Time-in-stage metrics
- Activity heatmap
- Completion trend charts
- Real-time updates (WebSocket)
- Dark mode

---

## Acceptance Criteria

- [ ] Tab navigation works (Active / Completed / Project Stats)
- [ ] Kanban board shows 4 columns: draft, refining, feedback, ready
- [ ] Issue cards show time info (created, in-status, last activity)
- [ ] Child issues nested under parent cards with collapse/expand
- [ ] Completed tab shows list of exported/archived issues
- [ ] Filter works on completed list (all/exported/archived)
- [ ] Project Stats shows summary cards and status bar chart
- [ ] Drag-drop still works for status changes
- [ ] Colors consistent across all views
- [ ] Responsive on smaller screens
