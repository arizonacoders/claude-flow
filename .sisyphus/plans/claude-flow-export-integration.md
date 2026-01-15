# Work Plan: claude-flow Export & Ticket Integration (v2)

**Created**: 2025-01-15
**Revised**: 2025-01-15 (Addressed Momus review feedback)
**Status**: Ready for implementation
**Scope**: Export system for claude-flow + skill templates for oh-my-claude-sisyphus

---

## Summary

Build a one-way handoff system where claude-flow exports clean specs to external ticket systems (GitHub, Jira), and oh-my-claude-sisyphus can pull from those systems via user-created skills.

```
claude-flow (spec creation) → Export → GitHub/Jira → Pull → oh-my-claude-sisyphus (implementation)
```

---

## Part 1: claude-flow Export Command

### 1.1 New CLI Command

```bash
claude-flow export <id|number> [options]

Options:
  --json           Output as structured JSON
  --md             Output as clean markdown
  --output <file>  Write to file instead of stdout
  --strict         Fail if required sections are missing
  --no-color       Disable colors/emojis (auto-detected for non-TTY)
  -q, --quiet      Suppress warnings
```

**Default behavior** (no flags): Rich CLI output with colors and emojis for terminal viewing.
**Non-TTY detection**: Automatically uses `--no-color` when output is piped or redirected.

### 1.2 Canonical Section Headers

These are the **exact headers** used by sub-agents (case-insensitive matching):

| Section | Source Agent | Header Pattern |
|---------|--------------|----------------|
| User Story | review-draft | `## USER STORY` |
| Acceptance Criteria | review-draft | `## ACCEPTANCE CRITERIA` |
| Scope | review-draft | `## SCOPE` |
| Implementation Approach | architect | `## IMPLEMENTATION APPROACH` |
| Non-Functional Requirements | architect | `## NON-FUNCTIONAL REQUIREMENTS` |
| Specification by Example | qa-review | `## SPECIFICATION BY EXAMPLE` |
| Edge Cases | qa-review | `## EDGE CASES` |
| Test Strategy | qa-review | `## TEST STRATEGY` |
| Definition of Done | triage | `### Definition of Done` (in synthesized spec) |

**Excluded sections** (Q&A, not exported):
- `## OPEN QUESTIONS`
- `## TECHNICAL OPEN QUESTIONS`
- `## TESTING OPEN QUESTIONS`
- Any line starting with `QUESTION:`

### 1.3 Parsing Algorithm

#### Priority Order

1. **First**: Look for `## SPECIFICATION COMPLETE` marker in a `triage` comment
   - This is the authoritative synthesized spec
   - Parse all sections from this single comment

2. **Fallback**: If no synthesized spec found, extract from individual agent comments
   - Use persona-to-section mapping (see below)
   - Take the **latest comment** from each persona containing each section

#### Persona-to-Section Mapping (Fallback Mode)

| Persona | Sections to Extract |
|---------|---------------------|
| `review-draft` | User Story, Acceptance Criteria, Scope |
| `architect` | Implementation Approach, Non-Functional Requirements |
| `qa-review` | Specification by Example, Edge Cases, Test Strategy |
| `triage` | Definition of Done |

#### Parsing Pseudocode

```python
def extract_spec(issue):
    comments = get_comments(issue.id)

    # Priority 1: Look for synthesized spec
    for comment in reversed(comments):  # newest first
        if comment.persona == 'triage':
            if '## SPECIFICATION COMPLETE' in comment.content:
                return parse_sections(comment.content)

    # Priority 2: Fallback to individual agent comments
    spec = {}
    persona_sections = {
        'review-draft': ['USER STORY', 'ACCEPTANCE CRITERIA', 'SCOPE'],
        'architect': ['IMPLEMENTATION APPROACH', 'NON-FUNCTIONAL REQUIREMENTS'],
        'qa-review': ['SPECIFICATION BY EXAMPLE', 'EDGE CASES', 'TEST STRATEGY'],
        'triage': ['Definition of Done']
    }

    for comment in reversed(comments):  # newest first
        sections_to_find = persona_sections.get(comment.persona, [])
        for section in sections_to_find:
            if section not in spec:  # only take first (newest) occurrence
                content = extract_section(comment.content, section)
                if content:
                    spec[section] = content

    return spec

def extract_section(content, header):
    """Extract content between header and next ## header (or end)"""
    pattern = rf'##\s*{header}\s*\n(.*?)(?=\n##|\Z)'
    match = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
    if match:
        section_content = match.group(1).strip()
        # Strip Q&A content
        section_content = strip_questions(section_content)
        return section_content
    return None

def strip_questions(content):
    """Remove lines starting with QUESTION:"""
    lines = content.split('\n')
    return '\n'.join(line for line in lines if not line.strip().startswith('QUESTION:'))
```

### 1.4 Output Formats

#### CLI Output (Default)
```
📋 Issue #42: Add rate limiting to API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 User Story
As an API consumer, I want rate limiting so that...

✅ Acceptance Criteria
• Given a user makes requests...
• When the limit is exceeded...
• Then a 429 response is returned...

🔧 Implementation Approach
...

📊 Non-Functional Requirements
...

🔀 Specification by Example
...

⚠️ Edge Cases
...

🧪 Test Strategy
...

✓ Definition of Done
...
```

#### JSON Output (`--json`)
```json
{
  "version": "1.0",
  "issueNumber": 42,
  "title": "Add rate limiting to API",
  "spec": {
    "userStory": "As an API consumer...",
    "acceptanceCriteria": "- [ ] Given a user makes requests...",
    "scope": "In Scope:\n- Rate limiting per API key...",
    "implementationApproach": "### Technical Strategy\n...",
    "nonFunctionalRequirements": "### Performance\n...",
    "specificationByExample": "```gherkin\nGiven...",
    "edgeCases": "### Data Boundaries\n...",
    "testStrategy": "### Unit Tests\n...",
    "definitionOfDone": "- [ ] All acceptance criteria met..."
  },
  "metadata": {
    "exportedAt": "2025-01-15T12:00:00Z",
    "sourceStatus": "ready",
    "issueId": "uuid-here",
    "parsedFrom": "synthesized",
    "missingSections": []
  }
}
```

#### Markdown Output (`--md`)
```markdown
# Add rate limiting to API

## User Story
As an API consumer...

## Acceptance Criteria
- [ ] Given a user makes requests...

## Scope
**In Scope:**
- Rate limiting per API key

## Implementation Approach
### Technical Strategy
...

## Non-Functional Requirements
### Performance
...

## Specification by Example
```gherkin
Given...
```

## Edge Cases
### Data Boundaries
...

## Test Strategy
### Unit Tests
...

## Definition of Done
- [ ] All acceptance criteria met
```

### 1.5 Status Validation

| Scenario | Behavior |
|----------|----------|
| Status is "ready" | Export normally |
| Status is NOT "ready" | Print warning to stderr, continue |
| Missing required sections + `--strict` | Exit with error code 1 |
| Missing required sections (no --strict) | Print warning, continue |

**Required sections** (for `--strict` mode):
- User Story
- Acceptance Criteria
- Implementation Approach
- Test Strategy
- Definition of Done

**Optional sections**:
- Scope
- Non-Functional Requirements
- Specification by Example
- Edge Cases

### 1.6 Type Definitions

Add to `src/types/index.ts`:

```typescript
// Export options from CLI
export interface ExportOptions {
  json?: boolean;
  md?: boolean;
  output?: string;
  strict?: boolean;
  noColor?: boolean;
  quiet?: boolean;
}

// Exported spec structure
export interface ExportedSpec {
  version: string;
  issueNumber: number;
  title: string;
  spec: {
    userStory?: string;
    acceptanceCriteria?: string;
    scope?: string;
    implementationApproach?: string;
    nonFunctionalRequirements?: string;
    specificationByExample?: string;
    edgeCases?: string;
    testStrategy?: string;
    definitionOfDone?: string;
  };
  metadata: {
    exportedAt: string;
    sourceStatus: IssueStatus;
    issueId: string;
    parsedFrom: 'synthesized' | 'individual';
    missingSections: string[];
  };
}

// Section extraction result
export interface ExtractedSections {
  sections: Record<string, string>;
  source: 'synthesized' | 'individual';
  missing: string[];
}
```

### 1.7 Implementation Tasks

| # | Task | Files | Est. Complexity |
|---|------|-------|-----------------|
| 1.7.1 | Add type definitions | `src/types/index.ts` | Low |
| 1.7.2 | Create `src/commands/export.ts` with command structure | New file | Low |
| 1.7.3 | Implement section parser with priority logic | `export.ts` | Medium |
| 1.7.4 | Implement JSON formatter | `export.ts` | Low |
| 1.7.5 | Implement Markdown formatter | `export.ts` | Low |
| 1.7.6 | Implement CLI formatter (colors, emojis, TTY detection) | `export.ts` | Medium |
| 1.7.7 | Add status validation with warning/strict modes | `export.ts` | Low |
| 1.7.8 | Register command in `src/index.ts` | `index.ts` | Low |
| 1.7.9 | Add tests for section parser | `tests/export.test.ts` | Medium |
| 1.7.10 | Add tests for formatters | `tests/export.test.ts` | Low |

---

## Part 2: oh-my-claude-sisyphus Skill Templates

These are **example skill files** the user creates in their project's `.claude/commands/` directory. They do NOT modify the oh-my-claude-sisyphus plugin.

### 2.1 GitHub Implementation Skill

**File**: `.claude/commands/implement-github.md`

```markdown
---
name: implement-github
description: Fetch a GitHub issue spec and implement it with Sisyphus
argument-hint: <issue-url-or-number>
---

# Implement GitHub Issue

Fetch a spec from GitHub Issues and implement it using Sisyphus orchestration.

## Input

- `$ARGUMENTS` contains: GitHub issue URL or just issue number

Examples:
- `https://github.com/owner/repo/issues/42`
- `42` (uses current repo)
- `owner/repo#42`

## Workflow

### Step 1: Parse Input

Determine the issue reference:
- If URL: extract owner/repo/number
- If number only: use current repo (`gh repo view --json owner,name`)
- If `owner/repo#N`: parse directly

### Step 2: Fetch Issue

```bash
gh issue view <number> --json title,body,labels,state
```

### Step 3: Extract Spec

The issue body may be:
1. **JSON** (from `claude-flow export --json`): Parse the `spec` object
2. **Markdown** (from `claude-flow export --md`): Use as-is
3. **Free-form**: Extract what sections exist

Detection logic:
```javascript
if (body.startsWith('{') && body.includes('"spec"')) {
  // JSON format
  const data = JSON.parse(body);
  spec = formatSpecFromJson(data.spec);
} else {
  // Markdown or free-form
  spec = body;
}
```

### Step 4: Invoke Sisyphus

Use the Skill tool:
```
Skill(skill: "oh-my-claude-sisyphus:sisyphus", args: "Implement this spec:\n\n<spec>\n${spec}\n</spec>")
```

### Step 5: Post Completion (Optional)

After implementation:
```bash
gh issue comment <number> --body "✅ Implementation completed by Claude

Implemented by: oh-my-claude-sisyphus
Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## Error Handling

| Error | Action |
|-------|--------|
| Issue not found | Report error, suggest checking issue number/URL |
| No spec sections found | Warn user, show raw issue body for review |
| gh CLI not authenticated | Prompt user to run `gh auth login` |
```

### 2.2 Jira Implementation Skill

**File**: `.claude/commands/implement-jira.md`

```markdown
---
name: implement-jira
description: Fetch a Jira ticket spec and implement it with Sisyphus
argument-hint: <ticket-id>
---

# Implement Jira Ticket

Fetch a spec from Jira and implement it using Sisyphus orchestration.

## Input

- `$ARGUMENTS` contains: Jira ticket ID (e.g., `PROJ-123`)

## Prerequisites

One of:
- Jira CLI installed (`jira` command)
- Environment variables for API access:
  - `JIRA_BASE_URL` (e.g., `https://company.atlassian.net`)
  - `JIRA_USER` (email)
  - `JIRA_TOKEN` (API token from https://id.atlassian.com/manage-profile/security/api-tokens)

## Workflow

### Step 1: Validate Input

Ensure ticket ID matches pattern: `[A-Z]+-\d+`

### Step 2: Fetch Ticket

**Option A: Jira CLI**
```bash
jira issue view $ARGUMENTS --plain
```

**Option B: REST API**
```bash
curl -s -u "$JIRA_USER:$JIRA_TOKEN" \
  "$JIRA_BASE_URL/rest/api/2/issue/$ARGUMENTS" \
  | jq '{
    key: .key,
    summary: .fields.summary,
    description: .fields.description,
    status: .fields.status.name
  }'
```

### Step 3: Extract Spec

The description field may be:
1. **JSON** (from `claude-flow export --json`): Parse the `spec` object
2. **Markdown** (from `claude-flow export --md`): Use as-is
3. **Jira wiki format**: Convert to markdown first

### Step 4: Invoke Sisyphus

```
Skill(skill: "oh-my-claude-sisyphus:sisyphus", args: "Implement this spec:\n\n<spec>\n${spec}\n</spec>")
```

### Step 5: Update Ticket (Optional)

**Transition to In Progress:**
```bash
jira issue move $ARGUMENTS "In Progress"
```

**Add completion comment:**
```bash
jira issue comment add $ARGUMENTS --body "Implementation completed by Claude"
```

## Configuration

Projects can add Jira config to `.claude-flow.json`:
```json
{
  "jira": {
    "baseUrl": "https://company.atlassian.net",
    "defaultProject": "PROJ"
  }
}
```

## Error Handling

| Error | Action |
|-------|--------|
| Ticket not found | Report error with ticket ID |
| Authentication failed | Prompt to check credentials |
| No description | Warn user, ask if they want to proceed with just the title |
```

### 2.3 Template Installation Tasks

| # | Task | Output |
|---|------|--------|
| 2.3.1 | Create `implement-github.md` skill template | `.claude/commands/implement-github.md` |
| 2.3.2 | Create `implement-jira.md` skill template | `.claude/commands/implement-jira.md` |
| 2.3.3 | Document skill usage in CLAUDE.md | Update documentation |

---

## Part 3: Testing

### 3.1 Unit Tests for Section Parser

```typescript
describe('extractSpec', () => {
  it('extracts from synthesized spec (triage comment)', () => {
    const comments = [{
      persona: 'triage',
      content: `## SPECIFICATION COMPLETE
### User Story
As a user, I want...
### Acceptance Criteria
- [ ] Given...
`
    }];
    const result = extractSpec(comments);
    expect(result.source).toBe('synthesized');
    expect(result.sections.userStory).toContain('As a user');
  });

  it('falls back to individual agent comments', () => {
    const comments = [
      { persona: 'review-draft', content: '## USER STORY\nAs a user...' },
      { persona: 'architect', content: '## IMPLEMENTATION APPROACH\nWe will...' },
    ];
    const result = extractSpec(comments);
    expect(result.source).toBe('individual');
  });

  it('strips QUESTION: lines', () => {
    const comments = [{
      persona: 'review-draft',
      content: `## USER STORY
QUESTION: Who is the user?
As a developer, I want...`
    }];
    const result = extractSpec(comments);
    expect(result.sections.userStory).not.toContain('QUESTION:');
  });

  it('handles case-insensitive headers', () => {
    const comments = [{
      persona: 'review-draft',
      content: '## user story\nAs a...'
    }];
    const result = extractSpec(comments);
    expect(result.sections.userStory).toBeDefined();
  });
});
```

### 3.2 Integration Test Scenario

1. Create issue via `claude-flow issue create "Test feature"`
2. Add mock comments simulating agent output
3. Export as JSON: `claude-flow export <id> --json`
4. Verify JSON is valid and contains expected sections
5. Export as Markdown: `claude-flow export <id> --md`
6. Verify Markdown is clean and readable

### 3.3 Test Cases

| # | Test | Expected |
|---|------|----------|
| 3.3.1 | Export ready issue with synthesized spec | Uses triage's `## SPECIFICATION COMPLETE` |
| 3.3.2 | Export issue without synthesized spec | Falls back to individual agents |
| 3.3.3 | Export non-ready issue | Warning printed, export succeeds |
| 3.3.4 | Export with `--strict` and missing sections | Exit code 1 with error |
| 3.3.5 | Export piped output | No colors/emojis |
| 3.3.6 | Export with `--output` flag | File written correctly |
| 3.3.7 | JSON output is valid JSON | Parses without error |
| 3.3.8 | Markdown output has proper headings | All `##` headers present |

---

## Implementation Order

### Phase 1: Core Export (Tasks 1.7.1 - 1.7.8)
1. Add type definitions
2. Create command structure and register
3. Implement section parser with priority logic
4. Implement JSON output
5. Implement Markdown output
6. Implement CLI output with formatting
7. Add status validation

### Phase 2: Testing (Tasks 1.7.9 - 1.7.10)
1. Write unit tests for section parser
2. Write tests for formatters
3. Integration test

### Phase 3: Skill Templates (Tasks 2.3.1 - 2.3.3)
1. Create GitHub skill template
2. Create Jira skill template
3. Document usage

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/types/index.ts` | Modify | Add ExportOptions, ExportedSpec types |
| `src/commands/export.ts` | Create | Export command implementation |
| `src/index.ts` | Modify | Register export command |
| `.claude/commands/implement-github.md` | Create | GitHub skill template |
| `.claude/commands/implement-jira.md` | Create | Jira skill template |
| `tests/export.test.ts` | Create | Export command tests |

---

## Addressed Review Feedback

| Momus Finding | Resolution |
|---------------|------------|
| Section header mismatch | Documented exact headers from agents (all caps) |
| Parsing algorithm undefined | Added pseudocode with priority logic |
| Persona priority unclear | Defined: triage synthesized > individual agents |
| Missing type definitions | Added ExportOptions, ExportedSpec, ExtractedSections |
| JSON schema versioning | Added `version: "1.0"` field |
| Non-TTY color handling | Added `--no-color` flag with auto-detection |
| Strict mode missing | Added `--strict` flag for CI/validation use |

---

## Definition of Done

- [ ] `claude-flow export` command works with all three output formats
- [ ] Section parser correctly prioritizes synthesized spec
- [ ] Section parser correctly falls back to individual agents
- [ ] JSON output includes version field and is valid JSON
- [ ] Markdown output is clean and readable
- [ ] CLI output has colors and emojis (TTY) or plain text (non-TTY)
- [ ] Warning shown for non-ready issues
- [ ] `--strict` mode fails on missing required sections
- [ ] Skill templates created and documented
- [ ] All tests pass
