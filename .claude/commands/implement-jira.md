---
name: implement-jira
description: Fetch a Jira ticket spec and implement it with Sisyphus
argument-hint: <ticket-id>
---

# Implement Jira Ticket

Fetch a spec from Jira and implement it using Sisyphus orchestration.

## Input

`$ARGUMENTS` contains: Jira ticket ID (e.g., `PROJ-123`)

## Prerequisites

One of the following must be configured:

**Option A: Jira CLI**
- Install: `brew install ankitpokhrel/jira-cli/jira-cli` or see https://github.com/ankitpokhrel/jira-cli
- Authenticate: `jira init`

**Option B: Environment Variables for REST API**
- `JIRA_BASE_URL` - Your Jira instance (e.g., `https://company.atlassian.net`)
- `JIRA_USER` - Your email address
- `JIRA_TOKEN` - API token from https://id.atlassian.com/manage-profile/security/api-tokens

**Option C: Project Config**
Add to `.claude-flow.json` in the project root:
```json
{
  "jira": {
    "baseUrl": "https://company.atlassian.net",
    "defaultProject": "PROJ"
  }
}
```

## Workflow

### Step 1: Validate Input

Ensure ticket ID matches Jira format:
```
Pattern: [A-Z]+-\d+
Examples: PROJ-123, ABC-1, FEATURE-9999
```

If invalid format, report error and exit.

### Step 2: Fetch Ticket

**Using Jira CLI (preferred):**
```bash
jira issue view $ARGUMENTS --plain
```

**Using REST API (fallback):**
```bash
curl -s -u "$JIRA_USER:$JIRA_TOKEN" \
  "$JIRA_BASE_URL/rest/api/2/issue/$ARGUMENTS" \
  | jq '{
    key: .key,
    summary: .fields.summary,
    description: .fields.description,
    status: .fields.status.name,
    type: .fields.issuetype.name
  }'
```

### Step 3: Extract Spec

The description field may be in different formats:

**JSON format** (from `claude-flow export --json`):
- Description starts with `{` and contains `"spec"`
- Parse JSON and extract the `spec` object

**Markdown format** (from `claude-flow export --md`):
- Use the description content as-is

**Jira Wiki format** (native Jira):
- Convert wiki markup to markdown:
  - `h1.` → `#`
  - `*bold*` → `**bold**`
  - `_italic_` → `*italic*`
  - `{code}` → ` ``` `

Detection logic:
```javascript
if (description.trim().startsWith('{') && description.includes('"spec"')) {
  // JSON format
  const data = JSON.parse(description);
  spec = formatSpecFromJson(data.spec);
} else if (description.includes('h1.') || description.includes('{code}')) {
  // Jira wiki format - convert to markdown
  spec = convertWikiToMarkdown(description);
} else {
  // Markdown or plain text
  spec = description;
}
```

### Step 4: Invoke Sisyphus

Use the Skill tool to invoke Sisyphus with the extracted spec:

```
Skill(skill: "oh-my-claude-sisyphus:sisyphus", args: "Implement this specification from Jira ticket $ARGUMENTS:\n\n<spec>\n${spec}\n</spec>\n\nFollow the implementation approach and ensure all acceptance criteria are met.")
```

### Step 5: Update Ticket (Optional)

**Transition to In Progress:**
```bash
# Using Jira CLI
jira issue move $ARGUMENTS "In Progress"

# Or via API
curl -X POST -u "$JIRA_USER:$JIRA_TOKEN" \
  -H "Content-Type: application/json" \
  "$JIRA_BASE_URL/rest/api/2/issue/$ARGUMENTS/transitions" \
  -d '{"transition": {"id": "21"}}'  # ID varies by workflow
```

**Add completion comment:**
```bash
# Using Jira CLI
jira issue comment add $ARGUMENTS --body "Implementation completed by Claude

Implemented by: oh-my-claude-sisyphus
Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)

All acceptance criteria have been addressed. Please review the changes."

# Or via API
curl -X POST -u "$JIRA_USER:$JIRA_TOKEN" \
  -H "Content-Type: application/json" \
  "$JIRA_BASE_URL/rest/api/2/issue/$ARGUMENTS/comment" \
  -d '{"body": "Implementation completed by Claude"}'
```

## Error Handling

| Error | Action |
|-------|--------|
| Invalid ticket format | Report: "Invalid Jira ticket format. Expected format: PROJ-123" |
| Ticket not found | Report: "Ticket $ARGUMENTS not found. Check the ticket ID." |
| Authentication failed | Report: "Jira authentication failed. Check your credentials." |
| No Jira config | Report: "No Jira configuration found. Set JIRA_BASE_URL or configure .claude-flow.json" |
| Empty description | Warn: "Ticket has no description. Only the summary is available: <summary>" |
| API rate limited | Report: "Jira API rate limit exceeded. Please wait and try again." |

## Example Session

```
User: /implement-jira PROJ-42

Claude: Let me fetch Jira ticket PROJ-42...

[Runs: jira issue view PROJ-42 --plain]

Found ticket: "Add rate limiting to API"
Type: Story
Status: To Do

Extracting spec...
- User Story: As an API consumer...
- Acceptance Criteria: 5 items
- Implementation Approach: Token bucket algorithm...

Now invoking Sisyphus to implement this spec...

[Invokes oh-my-claude-sisyphus:sisyphus with the spec]

...implementation proceeds...

Implementation complete! Adding completion comment to Jira.

[Runs: jira issue comment add PROJ-42 --body "..."]

Done! Ticket PROJ-42 has been implemented.
```

## Jira Wiki to Markdown Conversion

For native Jira tickets, convert wiki markup:

| Jira Wiki | Markdown |
|-----------|----------|
| `h1. Title` | `# Title` |
| `h2. Title` | `## Title` |
| `*bold*` | `**bold**` |
| `_italic_` | `*italic*` |
| `-strikethrough-` | `~~strikethrough~~` |
| `{code:java}...{code}` | ` ```java\n...\n``` ` |
| `{noformat}...{noformat}` | ` ```\n...\n``` ` |
| `# numbered` | `1. numbered` |
| `* bullet` | `- bullet` |
| `[link\|url]` | `[link](url)` |

## Notes

- This skill works with Jira Cloud and Jira Server/Data Center
- For Jira Server, the API endpoints may differ slightly
- The skill does NOT automatically transition the ticket to Done - that should be done after review
- Custom fields (like "Acceptance Criteria" in separate field) may require additional API calls
- Rate limits vary by Jira instance - cloud typically allows 500 requests/5 minutes
