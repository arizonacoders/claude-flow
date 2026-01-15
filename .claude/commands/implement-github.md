---
name: implement-github
description: Fetch a GitHub issue spec and implement it with Sisyphus
argument-hint: <issue-url-or-number>
---

# Implement GitHub Issue

Fetch a spec from GitHub Issues and implement it using Sisyphus orchestration.

## Input

`$ARGUMENTS` contains: GitHub issue URL or just issue number

Examples:
- `https://github.com/owner/repo/issues/42`
- `42` (uses current repo)
- `owner/repo#42`

## Workflow

### Step 1: Parse Input

Determine the issue reference from `$ARGUMENTS`:

```bash
# If URL, extract owner/repo/number
# If number only, use current repo
# If owner/repo#N, parse directly
```

For number-only input, get current repo:
```bash
gh repo view --json nameWithOwner -q '.nameWithOwner'
```

### Step 2: Fetch Issue

```bash
gh issue view <number> --json title,body,labels,state
```

Save the response and extract the body content.

### Step 3: Extract Spec

The issue body may be in different formats:

**JSON format** (from `claude-flow export --json`):
- Body starts with `{` and contains `"spec"`
- Parse JSON and extract the `spec` object

**Markdown format** (from `claude-flow export --md` or manual):
- Use the body content as-is

Detection logic:
```javascript
if (body.trim().startsWith('{') && body.includes('"spec"')) {
  // JSON format - parse and format spec sections
  const data = JSON.parse(body);
  const spec = data.spec;
  // Format spec object into readable text
} else {
  // Markdown or free-form - use as-is
  spec = body;
}
```

### Step 4: Invoke Sisyphus

Use the Skill tool to invoke Sisyphus with the extracted spec:

```
Skill(skill: "oh-my-claude-sisyphus:sisyphus", args: "Implement this specification from GitHub issue #<number>:\n\n<spec>\n${spec}\n</spec>\n\nFollow the implementation approach and ensure all acceptance criteria are met.")
```

### Step 5: Post Completion Comment (Optional)

After successful implementation:

```bash
gh issue comment <number> --body "$(cat <<'EOF'
✅ Implementation completed by Claude

**Implemented by:** oh-my-claude-sisyphus
**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)

All acceptance criteria have been addressed. Please review the changes.
EOF
)"
```

## Error Handling

| Error | Action |
|-------|--------|
| Issue not found | Report error: "Issue #N not found. Check the issue number or URL." |
| No spec sections found | Warn: "No structured spec found in issue body. Showing raw content for review." Then show the raw body. |
| gh CLI not authenticated | Report: "GitHub CLI not authenticated. Run `gh auth login` first." |
| gh CLI not installed | Report: "GitHub CLI not found. Install from https://cli.github.com/" |
| Empty issue body | Warn: "Issue has no description. Only the title is available: <title>" |

## Example Session

```
User: /implement-github 42

Claude: Let me fetch issue #42 from GitHub...

[Runs: gh issue view 42 --json title,body,labels,state]

Found issue: "Add rate limiting to API"
Status: open

Extracting spec...
- User Story: As an API consumer...
- Acceptance Criteria: 5 items
- Implementation Approach: Token bucket algorithm...

Now invoking Sisyphus to implement this spec...

[Invokes oh-my-claude-sisyphus:sisyphus with the spec]

...implementation proceeds...

Implementation complete! Posting completion comment to GitHub.

[Runs: gh issue comment 42 --body "..."]

Done! Issue #42 has been implemented.
```

## Notes

- This skill requires the GitHub CLI (`gh`) to be installed and authenticated
- The skill does NOT automatically close the issue - that should be done after review
- For private repos, ensure `gh` has appropriate permissions
- JSON-formatted specs (from `claude-flow export --json`) provide the most structured data