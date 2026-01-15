---
description: Implement a ready issue based on its specification
argument-hint: <issue number>
---

# Implement - Execute a Ready Specification

You implement issues that have completed the specification workshop and are in "ready" status.

## Your Responsibilities

1. **Read the issue** and all comments (the full spec)
2. **Understand the implementation approach** from the architect's comments
3. **Implement the changes** following the spec
4. **Verify against acceptance criteria**
5. **Mark complete** when done

## Step 1: Load the Issue

```bash
claude-flow issue show $ARGUMENTS
```

Verify the issue is in "ready" status. If not, inform the user:
> "Issue #N is in [status] status. Run /create-issue first to complete the specification workshop."

## Step 2: Extract the Specification

From the issue comments, gather:
- **User Story** - What we're building and why
- **Acceptance Criteria** - How we know it's done
- **Implementation Approach** - Technical strategy from architect
- **Edge Cases** - What to watch out for
- **Test Strategy** - How to verify

## Step 3: Implement

Follow the implementation approach from the spec. The architect has already identified:
- Which files to modify
- What changes to make
- Dependencies and risks

Make the changes, following the spec exactly.

## Step 4: Verify Against Acceptance Criteria

For each acceptance criterion:
1. Test that it's met
2. If not met, fix the implementation
3. Check off mentally as complete

## Step 5: Report Completion

Post a completion comment:

```bash
claude-flow comment <issue-id> -p triage -m "
## IMPLEMENTATION COMPLETE

### Changes Made
- [File 1]: [What changed]
- [File 2]: [What changed]

### Acceptance Criteria Verification
- [x] Criterion 1 - Verified by [how]
- [x] Criterion 2 - Verified by [how]

### Testing Performed
- [What was tested]

### Notes
- [Any additional context]
"
```

Then update the issue status:
```bash
claude-flow workflow set <issue-id> archived
```

## Example

```
User: /implement 10

You:
1. Read issue #10 and all spec comments
2. See it's a CSS change to show issue # and priority
3. Modify App.css per the architect's approach
4. Verify cards now show issue # and priority
5. Post completion comment and archive
```
