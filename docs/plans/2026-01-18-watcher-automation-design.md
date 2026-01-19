# Watcher Automation Design

**Date:** 2026-01-18
**Status:** Draft
**Author:** Claude + Jeff

## Overview

This design introduces an automated watcher system that monitors claude-flow for issue status changes and spawns Claude Code instances to handle refinement, review, and export workflows. The goal is fully autonomous issue refinement with minimal user intervention.

## Problem Statement

Currently, the Three Amigos refinement workflow requires manual orchestration:
1. User creates an issue
2. User manually invokes agents for each phase
3. User coordinates communication between agents
4. User exports to GitHub when ready

This is time-consuming and breaks flow when issues are discovered during QA or code review.

## Solution

A standalone watcher script that:
1. Polls claude-flow for status changes
2. Spawns Claude Code instances with appropriate commands
3. Enables fully autonomous refinement via comment-based communication
4. Auto-exports to GitHub when ready

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    MAIN AGENT SESSION                             │
│  (QA, code-review, or any workflow)                              │
│                                                                   │
│  Discovers issue → claude-flow issue create "Bug: X" -s draft    │
│  (Main agent continues working, doesn't block)                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                  CLAUDE-FLOW WATCHER                              │
│            (Standalone daemon script)                             │
│                                                                   │
│  Polls every 30s for status changes:                             │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  draft → spawn /refine-issue (orchestrator + 3 agents)      │ │
│  │  ready → spawn /export-to-github (or run script directly)   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Tracks: { issue_id: last_seen_status } to avoid re-triggering  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                   SPAWNED CLAUDE INSTANCES                        │
│                                                                   │
│  Each runs: claude --print "/command #N" --allowedTools "..."    │
│                                                                   │
│  All communication via claude-flow comments:                     │
│  - Post questions with QUESTION: prefix                          │
│  - Post answers with RE: prefix                                  │
│  - Post spec sections when complete                              │
│  - Advance workflow when ready                                   │
└──────────────────────────────────────────────────────────────────┘
```

## Workflow States

### Status Types

```typescript
export type IssueStatus =
  | 'draft'           // Just created, waiting for watcher
  | 'refining'        // Three Amigos workshop (all agents work here)
  | 'feedback'        // Needs user input (questions pending)
  | 'ready'           // All specs complete, ready for export
  | 'exported'        // Pushed to GitHub
  | 'archived';       // Closed without export
```

### Persona Types

```typescript
export type PersonaType =
  | 'orchestrator'    // Refinement coordinator
  | 'review-draft'    // Alex - requirements clarity
  | 'architect'       // Sam - technical feasibility
  | 'qa-review'       // Blake - black box QA
  | 'system'          // Automated actions
  | 'user';           // Human input
```

### State Transitions

| From | To | Trigger |
|------|-----|---------|
| `draft` → `refining` | Watcher detects new issue |
| `refining` → `feedback` | Orchestrator can't answer a question |
| `feedback` → `refining` | User answers in UI |
| `refining` → `ready` | All specs complete, no pending questions |
| `ready` → `exported` | Watcher triggers export |
| `ready` → `archived` | User manually closes |
| `feedback` → `archived` | User manually closes |

### Visual Flow

```
┌─────────┐     ┌───────────────────────────────────────┐     ┌──────────┐
│  draft  │────>│              refining                 │────>│  ready   │
└─────────┘     │                                       │     └────┬─────┘
                │  ┌─────────┐ ┌─────────┐ ┌─────────┐  │          │
                │  │  Alex   │ │   Sam   │ │  Blake  │  │          │
                │  │ (reqs)  │ │ (arch)  │ │  (QA)   │  │          ▼
                │  └────┬────┘ └────┬────┘ └────┬────┘  │     ┌──────────┐
                │       │          │          │        │     │ exported │──>GitHub
                │       └──────────┼──────────┘        │     └──────────┘
                │                  ▼                   │
                │         orchestrator answers         │     ┌──────────┐
                │                  │                   │     │ archived │
                │                  ▼                   │     └──────────┘
                │        ┌──────────────────┐          │          ▲
                │        │ can't answer?    │──────────┼──────────┘
                │        └──────────────────┘          │    (manual close)
                │                  │                   │
                │                  ▼                   │
                └─────────────>feedback<───────────────┘
                                  │
                              user answers
                                  │
                                  ▼
                            back to refining
```

## Watcher Script Design

### Core Loop

```typescript
interface WatcherState {
  [issueId: string]: {
    lastStatus: string;
    lastProcessed: Date;
    activeProcess?: number; // PID of spawned Claude
  }
}

const STATUS_TRIGGERS = {
  'draft': {
    command: '/refine-issue',
    description: 'Starting refinement workshop'
  },
  'ready': {
    command: '/export-to-github',
    description: 'Exporting to GitHub'
  }
};

while (running) {
  const issues = await claudeFlow.listIssues();

  for (const issue of issues) {
    const prev = state[issue.id];

    // Skip if status unchanged or already processing
    if (prev?.lastStatus === issue.status) continue;
    if (prev?.activeProcess && isRunning(prev.activeProcess)) continue;

    const trigger = STATUS_TRIGGERS[issue.status];
    if (trigger) {
      log(`[#${issue.number}] ${trigger.description}`);

      const pid = spawn('claude', [
        '--print',
        `${trigger.command} ${issue.number}`,
        '--allowedTools', 'Read,Glob,Grep,Bash',
        '--cwd', projectDir
      ]);

      state[issue.id] = {
        lastStatus: issue.status,
        lastProcessed: new Date(),
        activeProcess: pid
      };
    }
  }

  await sleep(30_000); // Poll every 30s
}
```

### CLI Interface

```bash
# Start watcher in foreground
claude-flow watch --interval 30 --project /path/to/project

# Start as daemon
claude-flow watch --daemon

# Check status
claude-flow watch --status

# Stop daemon
claude-flow watch --stop
```

## Commands Spawned by Watcher

### `/refine-issue` (Orchestrator)

Coordinates the Three Amigos refinement:

1. Read the issue
2. Spawn 3 agents in parallel (background)
   - `review-draft` (Alex) - Requirements clarity
   - `architect` (Sam) - Technical feasibility
   - `qa-review` (Blake) - Black box QA
3. Monitor and answer questions
   - Poll for `QUESTION:` comments
   - Answer with `RE:` comments using context
   - Set status to `feedback` if can't answer
4. Advance to `ready` when all specs complete

### `/export-to-github` (Scriptable)

Simple export designed to become a bash script:

1. Extract issue data as JSON
2. Format for GitHub using `claude-flow export --format=github-md`
3. Create via `gh issue create`
4. Link back to claude-flow issue
5. Set status to `exported`

Future standalone version:
```bash
#!/bin/bash
ISSUE=$1
DATA=$(claude-flow issue show $ISSUE --json)
BODY=$(claude-flow export $ISSUE --format=github-md)
gh issue create --title "$(echo $DATA | jq -r .title)" --body "$BODY"
claude-flow issue update $ISSUE -s exported
```

## Agent Updates

### QA Review Agent (Black Box Perspective)

Blake now thinks from a user/QA perspective with limited access:

**Has access to:**
- The website (UI, forms, flows)
- Browser dev tools (network, console)
- Application logs

**Cannot access:**
- Source code (implementation hidden)
- Database (no direct queries)

**Focus areas:**
- User journeys and observable behavior
- Gherkin acceptance criteria from user perspective
- Black box test matrix (input → expected → how to verify)

## User Interaction

### Web UI Enhancements

```
┌────────────────────────────────────────────────────────────────────┐
│                    CLAUDE-FLOW WEB UI                               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ATTENTION NEEDED (2)                       [View All]      │   │
│  │  ┌────────────────────────────────────────────────────────┐ │   │
│  │  │ #12 - Add rate limiting                                │ │   │
│  │  │ ❓ architect: "What rate limit values should we use?"  │ │   │
│  │  │ ⏱️ 3 min ago | [Quick Reply] [View Issue]              │ │   │
│  │  └────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  KANBAN BOARD                                               │   │
│  │  draft(1) → refining(2) → feedback(1) → ready(3)           │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

**New Components:**

| Component | Purpose |
|-----------|---------|
| `AttentionBanner` | Surfaces unanswered questions across all issues |
| `QuestionCard` | Single question with metadata + reply button |
| `QuickReply` | Inline textarea, posts as `user` persona |

**Question Detection:**
- Parse comments for `QUESTION:` prefix
- Track answered state (has `RE:` response)
- Show time waiting

## Sequence Diagram

```
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌───────┐ ┌───────┐ ┌────────┐ ┌────────┐
│Main     │ │Claude-  │ │Watcher  │ │Orchestr- │ │Alex   │ │Sam    │ │Blake   │ │GitHub  │
│Agent    │ │Flow DB  │ │Script   │ │ator      │ │(Draft)│ │(Arch) │ │(QA)    │ │        │
└────┬────┘ └────┬────┘ └────┬────┘ └────┬─────┘ └───┬───┘ └───┬───┘ └───┬────┘ └───┬────┘
     │           │           │           │           │         │         │          │
     │ issue create "Bug: X" │           │           │         │         │          │
     │──────────>│           │           │           │         │         │          │
     │           │ status=draft          │           │         │         │          │
     │           │           │           │           │         │         │          │
     │ continues │ poll (30s)│           │           │         │         │          │
     │ working   │<──────────│           │           │         │         │          │
     │           │ new draft!│           │           │         │         │          │
     │           │──────────>│           │           │         │         │          │
     │           │           │ spawn /refine-issue   │         │         │          │
     │           │           │──────────>│           │         │         │          │
     │           │           │           │ spawn 3 agents (parallel)     │          │
     │           │           │           │──────────>│         │         │          │
     │           │           │           │─────────────────────>│        │          │
     │           │           │           │───────────────────────────────>│         │
     │           │           │           │           │         │         │          │
     │           │           │           │           │ QUESTION: "Priority?"        │
     │           │           │           │           │────────>│         │          │
     │           │           │           │           │         │ QUESTION: "REST?"  │
     │           │           │           │           │         │────────>│          │
     │           │           │           │ poll for questions   │         │          │
     │           │           │           │──────────>│         │         │          │
     │           │           │           │ RE: "High priority"  │         │          │
     │           │           │           │──────────>│         │         │          │
     │           │           │           │ RE: "REST, see patterns"      │          │
     │           │           │           │──────────>│         │         │          │
     │           │           │           │           │ post SPEC│         │          │
     │           │           │           │           │────────>│         │          │
     │           │           │           │           │         │ post SPEC│         │
     │           │           │           │           │         │────────>│          │
     │           │           │           │           │         │         │          │
     │           │           │           │           │         │         │ QUESTION: "Test tokens?"
     │           │           │           │           │         │         │─────────>│
     │           │           │           │ can't answer → status=feedback│          │
     │           │           │           │──────────>│         │         │          │
┌────────┐      │           │           │           │         │         │          │
│  User  │      │           │           │           │         │         │          │
└───┬────┘      │           │           │           │         │         │          │
    │ sees Attention Banner │           │           │         │         │          │
    │<──────────│           │           │           │         │         │          │
    │ Quick Reply: "Yes, test expired tokens"       │         │         │          │
    │──────────>│ status=refining       │           │         │         │          │
    │           │           │           │           │         │         │ sees answer
    │           │           │           │           │         │         │─────────>│
    │           │           │           │           │         │         │ post SPEC│
    │           │           │           │           │         │         │─────────>│
    │           │           │           │ all specs complete → status=ready        │
    │           │           │           │──────────>│         │         │          │
    │           │ poll      │           │           │         │         │          │
    │           │<──────────│           │           │         │         │          │
    │           │ ready!    │           │           │         │         │          │
    │           │──────────>│           │           │         │         │          │
    │           │           │ spawn /export-to-github         │         │          │
    │           │           │─────────────────────────────────────────────────────>│
    │           │           │           │           │         │         │  gh issue│
    │           │           │           │           │         │         │  create  │
    │           │           │           │           │         │         │─────────>│
    │           │           │           │           │         │         │  #123    │
    │           │           │           │           │         │         │<─────────│
    │           │ status=exported       │           │         │         │          │
    │           │<─────────────────────────────────────────────────────│          │
```

## File Structure

```
claude-flow/
├── src/
│   ├── commands/
│   │   ├── watch.ts          # NEW: Watcher daemon command
│   │   ├── export.ts         # MODIFY: Add --format=github-md
│   │   └── ...
│   │
│   ├── watcher/              # NEW: Watcher module
│   │   ├── index.ts          # Main watcher loop
│   │   ├── triggers.ts       # Status → command mappings
│   │   ├── spawner.ts        # Claude process spawning
│   │   └── state.ts          # Track processed issues
│   │
│   └── utils/
│       └── github-export.ts  # NEW: Format issue for GitHub
│
├── .claude/
│   ├── commands/
│   │   ├── refine-issue.md       # Orchestrator command
│   │   └── export-to-github.md   # Export command
│   │
│   └── agents/
│       ├── review-draft.md       # Alex - requirements
│       ├── architect.md          # Sam - technical
│       └── qa-review.md          # Blake - black box QA
│
├── web/
│   └── src/
│       ├── components/
│       │   ├── AttentionBanner.tsx   # NEW
│       │   ├── QuickReply.tsx        # NEW
│       │   └── QuestionCard.tsx      # NEW
│       │
│       └── hooks/
│           └── useQuestions.ts       # NEW
│
└── scripts/
    └── export-to-github.sh       # Future: standalone export
```

## Implementation Phases

### Phase 1: Core Infrastructure (~4 hours)
- Update `IssueStatus` and `PersonaType` types
- Create watcher module skeleton
- Add `watch` command
- DB migration for new statuses

**Deliverable:** `claude-flow watch` runs, detects `draft`, logs intent

### Phase 2: Refinement Commands (~3 hours)
- Create `/refine-issue` command
- Update agent files for new workflow
- Update `qa-review` for black box perspective
- Add `orchestrator` persona handling

**Deliverable:** Manual `/refine-issue 1` works end-to-end

### Phase 3: Watcher Integration (~4 hours)
- Implement spawner with Claude CLI
- Handle process lifecycle (PID tracking)
- Add `--daemon` and `--status` modes

**Deliverable:** Full `draft → refining → ready` automation

### Phase 4: Export Pipeline (~2 hours)
- Add `--format=github-md` to export command
- Create `/export-to-github` command
- Create standalone `export-to-github.sh`

**Deliverable:** `ready → exported` with GitHub issue created

### Phase 5: Web UI Enhancements (~5 hours)
- Question detection utility
- `AttentionBanner` component
- `QuestionCard` and `QuickReply` components
- Update kanban for new statuses

**Deliverable:** User sees questions, can reply inline

### Phase 6: Polish & Observability (~4 hours)
- Structured logging
- Metrics/stats endpoint
- Error handling & retries
- Documentation and tests

**Deliverable:** Production-ready system

### Dependency Graph

```
Phase 1 (Infrastructure)
    │
    ├──> Phase 2 (Commands) ──> Phase 3 (Integration)
    │                                   │
    │                                   ▼
    │                          Phase 4 (Export)
    │
    └──> Phase 5 (Web UI) ─────────────────────────> Phase 6 (Polish)
```

**Phases 2 and 5 can run in parallel** after Phase 1.

## Open Questions

1. **Concurrent refinements:** How many issues can refine simultaneously? (Suggest: configurable limit, default 3)

2. **Watcher persistence:** Should watcher state persist across restarts? (Suggest: yes, write to `~/.claude-flow/watcher-state.json`)

3. **Timeout handling:** What if an agent hangs? (Suggest: 10 min timeout per agent, log and continue)

4. **GitHub project mapping:** Should exported issues auto-assign to GitHub project? (Suggest: yes, via config)

## Success Criteria

- [ ] Issue created during QA automatically refines without user intervention
- [ ] User only involved when orchestrator can't answer a question
- [ ] Refined issues export to GitHub with full spec
- [ ] Total time from draft to GitHub < 10 minutes (typical)
- [ ] Web UI clearly shows pending questions
- [ ] Watcher runs reliably as daemon

## Appendix: Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Watcher vs webhooks | Watcher (polling) | Simpler, no server dependency |
| Agent communication | claude-flow comments | Async, auditable, survives restarts |
| User interaction | Web UI | Rich interface, mobile-friendly |
| Export format | Scriptable | Can eventually remove Claude from export |
| QA perspective | Black box | Matches real QA workflow |
