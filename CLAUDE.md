# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

claude-flow is a pre-issue refinement system with CLI and Web UI. It serves as the **shared context/memory layer** for a multi-agent orchestration system.

## Purpose & Vision

This tool implements an **interactive specification workshop** using the "Three Amigos" pattern (Product Owner, Developer, Tester) via async sub-agents. Inspired by Janet Gregory's methodology and the [ralph-claude-code](https://github.com/frankbria/ralph-claude-code) project.

```
┌─────────────────────────────────────────────────────────────────┐
│              PRIMARY AGENT (/create-issue)                       │
│  - Has FULL CONTEXT of what's being worked on                   │
│  - Spawns sub-agents ASYNC (they run independently)             │
│  - Monitors claude-flow for sub-agent comments                  │
│  - Attempts to ANSWER sub-agent questions via comments          │
│  - Only asks USER when it cannot answer                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ spawns async
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐
   │review-draft│   │ architect │    │ qa-review │
   │(async)     │   │(async)    │    │(async)    │
   └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
         │                │                │
         │   ALL COMMUNICATE VIA           │
         │   CLAUDE-FLOW COMMENTS          │
         │   (no direct communication)     │
         │                │                │
         └────────────────┼────────────────┘
                          ▼
              ┌─────────────────────┐
              │    claude-flow      │
              │    (issue #N)       │
              │                     │
              │  Comments log:      │
              │  - Questions asked  │
              │  - Answers given    │
              │  - Decisions made   │
              │  - Spec sections    │
              └─────────────────────┘
```

## Key Behaviors

**Primary Agent (Orchestrator):**
- Has full picture of what's being worked on
- Spawns sub-agents to run independently/async
- Monitors claude-flow comments for questions
- Attempts to answer questions by posting comments
- Only escalates to user when it lacks context

**Sub-Agents (Async Workers):**
- Run independently - no direct communication back to primary
- Read issue context from claude-flow
- Ask clarifying questions via comments
- Post their findings/spec sections via comments
- All activity logged in claude-flow for visibility

**Communication Pattern:**
- Sub-agents DO NOT communicate back to primary agent
- All communication happens through claude-flow comments
- Primary agent monitors and responds to questions
- This creates a full audit trail of the refinement process

## Multi-Agent Setup

**Slash Commands** (`.claude/commands/`):
- `create-issue.md` - Specification workshop orchestrator → produces "ready" issue with full spec
- `implement.md` - Takes a "ready" issue and implements it based on the spec

**The Team (Personas)**:
- **Nik (Product Manager)** = `triage` - The Orchestrator who coordinates the workshop and interfaces with stakeholders
- **Alex (Technical Product Owner)** = `review-draft` - User Story, Acceptance Criteria, asks "what/why" questions
- **Sam (Dev Team Leader)** = `architect` - Implementation Approach, Technical Design, asks "how" questions
- **Blake (QA)** = `qa-review` - Edge Cases, Test Strategy, asks "what could go wrong" questions
- **User** = `user` - Human stakeholder providing requirements and answering questions

**Sub-Agents** (`.claude/agents/`):
- `review-draft.md` - Alex: Technical Product Owner persona
- `architect.md` - Sam: Dev Team Leader persona
- `qa-review.md` - Blake: QA / Test Designer persona

## Specification Workshop Output

The collaborative process produces a complete spec with these sections:

1. **User Story** - Who wants what and why (Alex)
2. **Acceptance Criteria** - Measurable "done" conditions (Alex)
3. **Implementation Approach** - Technical strategy (Sam)
4. **Non-Functional Requirements** - Performance, security (Sam)
5. **Edge Cases** - Boundary conditions, error scenarios (Blake)
6. **Test Strategy** - Unit, integration, manual tests (Blake)
7. **Definition of Done** - Final checklist (all agents)

## Build and Run Commands

```bash
# Backend (CLI + Server)
npm install          # Install dependencies
npm run build        # Build backend (tsup → dist/)
npm run dev -- <cmd> # Run CLI command in dev mode (tsx)
npm test             # Run tests (vitest)
npm run test:run     # Run tests once (no watch)

# Web UI
cd web
npm install
npm run build        # Build React app (vite → dist/)
npm run dev          # Run Vite dev server (hot reload)

# Start Server
npm run serve        # or: node dist/index.js serve --port 3010
```

## Architecture

### Data Model
- **Issues**: Refinement items with status workflow (draft → arch-review → test-design → ready → archived)
- **Issue hierarchy**: Parent/child relationships for epics → stories → tasks
- **Comments**: Collaboration layer where personas (review-draft, architect, qa-review, triage, user) post updates
- **Links**: Typed relationships between issues (blocks, depends_on, duplicates, related_to)
- **DocLinks**: References to local markdown files

### Backend Structure (src/)
- `index.ts` - CLI entry point using Commander
- `core/store.ts` - SQLite store (better-sqlite3) for all entities
- `commands/` - CLI command implementations (issue, link, doc, comment, serve, status)
- `server/` - Express 5 API server with routes in `routes/issues.ts`
- `types/index.ts` - All TypeScript type definitions

### Web UI (web/src/)
- React 19 + Vite
- `App.tsx` - Main app with URL routing (History API for `/issue/:number`)
- `components/` - IssueList (kanban), IssueCard, IssueDetail, CommentThread, CreateIssueForm
- `api/client.ts` - API client for backend
- Issue cards color-coded by type: Epic (pink), Subtask (green), Task (blue)

### Database
SQLite stored at `~/.claude-flow/data/orchestrator.db`

Issues have sequential numbers (#1, #2, etc.) in addition to UUIDs. Both can be used for lookups.

## CLI Commands

```bash
claude-flow issue create <title> [-d description] [-p priority] [--parent id]
claude-flow issue list [-s status] [--json]
claude-flow issue show <id|number>
claude-flow issue update <id> [-t title] [-s status] [-p priority]
claude-flow issue delete <id>

claude-flow link <source> <target> -t <type> [--remove]
claude-flow doc <issue-id> --add <path> [--title <title>]
claude-flow comment <issue-id> -p <persona> -m "message"
claude-flow status [--json]
claude-flow serve [-p port]
```

## API Endpoints

- `GET/POST /api/issues` - List/create issues
- `GET/PUT/DELETE /api/issues/:id` - Get/update/delete issue
- `GET/POST /api/issues/:id/comments` - Comments
- `GET/POST /api/issues/:id/links` - Issue links
- `GET/POST /api/issues/:id/docs` - Doc links
