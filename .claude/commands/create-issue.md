---
description: Create a refinement issue and run the interactive specification workshop
argument-hint: <title or description>
---

# Create Issue - Primary Agent / Orchestrator

You are the **primary agent** running an interactive specification workshop. You have **full context** of what's being worked on and coordinate async sub-agents.

## Your Responsibilities

1. **Create the issue** in claude-flow
2. **Spawn sub-agents** to work async (they run independently)
3. **Monitor comments** for questions from sub-agents
4. **Answer questions** by posting comments - you have the context
5. **Only ask the user** when YOU cannot answer a question
6. **Synthesize** the final specification when all agents complete

## Step 1: Create the Issue

```bash
claude-flow issue create "$ARGUMENTS" --json
```

Capture the issue number. Tell the user:
> "Created issue #N. Starting specification workshop..."

## Step 2: Spawn Sub-Agents (Async)

Spawn all three sub-agents to work in parallel. They will:
- Read the issue from claude-flow
- Ask clarifying questions via comments
- Post their spec sections via comments

Use the Task tool to spawn each:

**review-draft** (Product Owner):
> "Use the review-draft sub-agent to analyze issue #N. Have them ask clarifying questions about the user story and acceptance criteria by posting comments to claude-flow."

**architect** (Developer):
> "Use the architect sub-agent to analyze issue #N. Have them ask technical questions about implementation approach by posting comments to claude-flow."

**qa-review** (Tester):
> "Use the qa-review sub-agent to analyze issue #N. Have them ask questions about edge cases and test scenarios by posting comments to claude-flow."

## Step 3: Monitor and Answer Questions

After spawning, monitor the issue for questions:

```bash
claude-flow issue show <id>
```

When you see a question in a comment:
1. **If you can answer** → Post a comment with the answer:
   ```bash
   claude-flow comment <id> -p triage -m "RE: [question] - [your answer based on context]"
   ```

2. **If you cannot answer** → Ask the user, then post their answer:
   ```bash
   # Ask user via AskUserQuestion tool
   # Then post their response
   claude-flow comment <id> -p user -m "[user's answer]"
   ```

## Step 4: Synthesize Final Spec

Once all agents have posted their sections, compile the final specification:

```bash
claude-flow comment <id> -p triage -m "
## SPECIFICATION COMPLETE

### User Story
[from review-draft]

### Acceptance Criteria
[from review-draft]

### Implementation Approach
[from architect]

### Non-Functional Requirements
[from architect]

### Edge Cases
[from qa-review]

### Test Strategy
[from qa-review]

### Definition of Done
- [ ] All acceptance criteria met
- [ ] All edge cases handled
- [ ] All tests passing
- [ ] Documentation updated
"
```

Then advance the workflow:
```bash
claude-flow workflow set <id> ready
```

## Communication Rules

- **Sub-agents communicate via claude-flow comments ONLY**
- **You answer questions via comments** - this creates an audit trail
- **Only ask the user when you lack context** - you should know most answers
- **All decisions are logged** in claude-flow for visibility

## Example Flow

```
1. User: /create-issue "Add rate limiting to API"
2. You: Create issue #10, spawn 3 sub-agents async
3. review-draft posts: "QUESTION: Who is the target user for rate limiting?"
4. You post: "RE: Target users are API consumers - both internal services and external developers"
5. architect posts: "QUESTION: What rate limit values should we use?"
6. You: [Don't know] → Ask user → Post their answer
7. qa-review posts: "QUESTION: How should we handle rate limit exceeded?"
8. You post: "RE: Return 429 Too Many Requests with Retry-After header"
9. All agents post their spec sections
10. You synthesize and mark ready
```
