# claude-flow

CLI orchestrator for Claude Code sessions tied to GitHub issues. Spawns Claude with deterministic session IDs, monitors GitHub status changes, and auto-resumes sessions when issues need attention.

## Features

- **Session Management**: Deterministic session IDs tied to issue+persona, enabling seamless resume
- **Issue Tracking**: Builds and tracks parent/child issue graphs
- **Status Monitoring**: Polls GitHub for status changes and auto-resumes when needed
- **Persona Workflows**: Built-in support for review-draft, architect, qa-review, and triage
- **Daemon Mode**: Background monitoring with auto-resume capabilities

## Installation

```bash
# From npm (when published)
npm install -g claude-flow

# From source
git clone https://github.com/arizonacoders/claude-flow.git
cd claude-flow
npm install
npm run build
npm link
```

## Requirements

- Node.js 18+
- [Claude Code CLI](https://claude.ai/code) installed and configured
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated

## Usage

### Persona Workflows

```bash
# Start PM review workflow for an issue
claude-flow review-draft 200

# Start architect technical review
claude-flow architect 200

# Start QA test design review
claude-flow qa-review 200

# Triage an unplanned issue
claude-flow triage 200
```

### Options

```bash
--verbose          # Show Claude output in real-time
--no-monitor       # Exit after starting session (don't wait for completion)
--fork             # Create new session instead of resuming
--json             # Output in JSON format
--timeout <min>    # Max session duration (default: 120)
--poll-interval <s> # Status check interval (default: 60)
```

### Session Management

```bash
# Show all active sessions
claude-flow status

# Show sessions for a specific issue
claude-flow status 200

# Manually resume a session
claude-flow resume 200

# Abort a session
claude-flow abort 200
```

### Background Monitoring

```bash
# Start monitor (foreground)
claude-flow watch

# Start as daemon
claude-flow watch --daemon

# Custom poll interval
claude-flow watch --poll-interval 30
```

## Configuration

Create a `claude-flow.config.json` in your project root to customize:

```json
{
  "github": {
    "owner": "your-org",
    "repo": "your-repo",
    "projectNumber": 1
  },
  "claude": {
    "model": "sonnet",
    "timeout": 120
  },
  "monitor": {
    "pollInterval": 60,
    "maxRetries": 3
  },
  "personas": {
    "review-draft": {
      "targetStatuses": ["Developer Review", "Ready"],
      "feedbackStatus": "Draft"
    }
  }
}
```

## How It Works

### Session IDs

Sessions are identified by a deterministic UUID generated from:
- Project path
- Persona type
- Issue number

This means:
- Same issue + persona = same session ID = automatic resume
- Different personas can work on the same issue independently
- Sessions are scoped to the project

### Workflow

1. **Start**: `claude-flow review-draft 200`
2. **Build Graph**: Fetches issue #200 and all sub-issues
3. **Spawn Claude**: `claude --session-id <uuid> -p "/review-draft 200"`
4. **Track**: Records all issues in SQLite for monitoring
5. **Monitor**: Polls GitHub for status changes
6. **Auto-Resume**: When any issue returns to feedback status, resumes the session
7. **Complete**: When all issues reach target status, marks session complete

### Data Storage

Session data is stored in `~/.claude-flow/data/orchestrator.db` (SQLite).

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev -- review-draft 200

# Build
npm run build

# Run tests
npm test
```

## License

MIT
