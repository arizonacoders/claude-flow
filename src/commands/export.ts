import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { Store } from '../core/store.js';
import { getDbPath } from '../utils/config.js';
import type {
  ExportOptions,
  ExportedSpec,
  ExtractedSections,
  Comment,
  IssueStatus,
} from '../types/index.js';

// Section headers used by sub-agents (case-insensitive matching)
const SECTION_HEADERS = {
  userStory: ['USER STORY'],
  acceptanceCriteria: ['ACCEPTANCE CRITERIA'],
  scope: ['SCOPE'],
  implementationApproach: ['IMPLEMENTATION APPROACH'],
  nonFunctionalRequirements: ['NON-FUNCTIONAL REQUIREMENTS', 'NON FUNCTIONAL REQUIREMENTS'],
  specificationByExample: ['SPECIFICATION BY EXAMPLE'],
  edgeCases: ['EDGE CASES'],
  testStrategy: ['TEST STRATEGY'],
  definitionOfDone: ['DEFINITION OF DONE'],
};

// Persona-to-section mapping for fallback mode
const PERSONA_SECTIONS: Record<string, string[]> = {
  'review-draft': ['userStory', 'acceptanceCriteria', 'scope'],
  architect: ['implementationApproach', 'nonFunctionalRequirements'],
  'qa-review': ['specificationByExample', 'edgeCases', 'testStrategy'],
  triage: ['definitionOfDone'],
};

// Required sections for strict mode
const REQUIRED_SECTIONS = [
  'userStory',
  'acceptanceCriteria',
  'implementationApproach',
  'testStrategy',
  'definitionOfDone',
];

// Section display names and emojis for CLI output
const SECTION_DISPLAY: Record<string, { emoji: string; name: string }> = {
  userStory: { emoji: '\u{1F464}', name: 'User Story' },
  acceptanceCriteria: { emoji: '\u2705', name: 'Acceptance Criteria' },
  scope: { emoji: '\u{1F3AF}', name: 'Scope' },
  implementationApproach: { emoji: '\u{1F527}', name: 'Implementation Approach' },
  nonFunctionalRequirements: { emoji: '\u{1F4CA}', name: 'Non-Functional Requirements' },
  specificationByExample: { emoji: '\u{1F500}', name: 'Specification by Example' },
  edgeCases: { emoji: '\u26A0\uFE0F', name: 'Edge Cases' },
  testStrategy: { emoji: '\u{1F9EA}', name: 'Test Strategy' },
  definitionOfDone: { emoji: '\u2713', name: 'Definition of Done' },
};

export async function exportIssue(id: string, options: ExportOptions): Promise<void> {
  const store = new Store(getDbPath());

  try {
    const issue = store.getIssue(id);

    if (!issue) {
      if (options.json) {
        console.log(JSON.stringify({ error: `Issue '${id}' not found` }));
      } else {
        console.error(chalk.red(`Error: Issue '${id}' not found`));
      }
      process.exit(1);
    }

    const comments = store.getCommentsForIssue(issue.id);

    // Extract sections from comments
    const extracted = extractSections(comments);

    // Check status and warn if not ready
    if (issue.status !== 'ready' && !options.quiet) {
      console.error(
        chalk.yellow(`Warning: Issue #${issue.number} is in '${issue.status}' status (not 'ready')`)
      );
    }

    // Check for missing required sections in strict mode
    if (options.strict && extracted.missing.length > 0) {
      const missingRequired = extracted.missing.filter((s) => REQUIRED_SECTIONS.includes(s));
      if (missingRequired.length > 0) {
        const names = missingRequired.map((s) => SECTION_DISPLAY[s]?.name || s);
        console.error(chalk.red(`Error: Missing required sections: ${names.join(', ')}`));
        process.exit(1);
      }
    }

    // Build the exported spec
    const exportedSpec: ExportedSpec = {
      version: '1.0',
      issueNumber: issue.number,
      title: issue.title,
      spec: {
        userStory: extracted.sections.userStory,
        acceptanceCriteria: extracted.sections.acceptanceCriteria,
        scope: extracted.sections.scope,
        implementationApproach: extracted.sections.implementationApproach,
        nonFunctionalRequirements: extracted.sections.nonFunctionalRequirements,
        specificationByExample: extracted.sections.specificationByExample,
        edgeCases: extracted.sections.edgeCases,
        testStrategy: extracted.sections.testStrategy,
        definitionOfDone: extracted.sections.definitionOfDone,
      },
      metadata: {
        exportedAt: new Date().toISOString(),
        sourceStatus: issue.status,
        issueId: issue.id,
        parsedFrom: extracted.source,
        missingSections: extracted.missing,
      },
    };

    // Format output
    let output: string;
    if (options.json) {
      output = formatJson(exportedSpec);
    } else if (options.md) {
      output = formatMarkdown(exportedSpec);
    } else {
      // CLI output - check for TTY
      const useColors = !options.noColor && process.stdout.isTTY;
      output = formatCli(exportedSpec, useColors);
    }

    // Write to file or stdout
    if (options.output) {
      writeFileSync(options.output, output);
      if (!options.quiet) {
        console.error(chalk.green(`Exported to ${options.output}`));
      }
    } else {
      console.log(output);
    }
  } finally {
    store.close();
  }
}

/**
 * Extract spec sections from comments using priority logic:
 * 1. Look for synthesized spec (## SPECIFICATION COMPLETE) from triage
 * 2. Fallback to individual agent comments
 */
function extractSections(comments: Comment[]): ExtractedSections {
  // Priority 1: Look for synthesized spec from triage
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    if (comment.persona === 'triage' && comment.content.includes('## SPECIFICATION COMPLETE')) {
      return parseFromSynthesized(comment.content);
    }
  }

  // Priority 2: Fallback to individual agent comments
  return parseFromIndividual(comments);
}

/**
 * Parse sections from a synthesized spec comment
 */
function parseFromSynthesized(content: string): ExtractedSections {
  const sections: Record<string, string> = {};
  const missing: string[] = [];

  for (const [key, headers] of Object.entries(SECTION_HEADERS)) {
    const extracted = extractSection(content, headers);
    if (extracted) {
      sections[key] = extracted;
    } else {
      missing.push(key);
    }
  }

  return { sections, source: 'synthesized', missing };
}

/**
 * Parse sections from individual agent comments using persona mapping
 */
function parseFromIndividual(comments: Comment[]): ExtractedSections {
  const sections: Record<string, string> = {};
  const missing: string[] = [];

  // Process comments from newest to oldest
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    const sectionsForPersona = PERSONA_SECTIONS[comment.persona];

    if (!sectionsForPersona) continue;

    for (const sectionKey of sectionsForPersona) {
      // Only take first (newest) occurrence
      if (sections[sectionKey]) continue;

      const headers = SECTION_HEADERS[sectionKey as keyof typeof SECTION_HEADERS];
      if (headers) {
        const extracted = extractSection(comment.content, headers);
        if (extracted) {
          sections[sectionKey] = extracted;
        }
      }
    }
  }

  // Determine missing sections
  for (const key of Object.keys(SECTION_HEADERS)) {
    if (!sections[key]) {
      missing.push(key);
    }
  }

  return { sections, source: 'individual', missing };
}

/**
 * Extract content for a section given possible header names
 */
function extractSection(content: string, headers: string[]): string | undefined {
  for (const header of headers) {
    // Try both ## and ### headers, case-insensitive
    const patterns = [
      new RegExp(`##\\s*${escapeRegex(header)}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i'),
      new RegExp(`###\\s*${escapeRegex(header)}\\s*\\n([\\s\\S]*?)(?=\\n###|\\n##|$)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        let sectionContent = match[1].trim();
        // Strip Q&A content
        sectionContent = stripQuestions(sectionContent);
        if (sectionContent) {
          return sectionContent;
        }
      }
    }
  }

  return undefined;
}

/**
 * Remove lines starting with QUESTION: and OPEN QUESTIONS sections
 */
function stripQuestions(content: string): string {
  const lines = content.split('\n');
  const filteredLines: string[] = [];
  let inOpenQuestions = false;

  for (const line of lines) {
    // Check for OPEN QUESTIONS section start
    if (/^##?\s*(OPEN QUESTIONS|TECHNICAL OPEN QUESTIONS|TESTING OPEN QUESTIONS)/i.test(line)) {
      inOpenQuestions = true;
      continue;
    }

    // Check for next section (exit OPEN QUESTIONS)
    if (inOpenQuestions && /^##?\s+\w/i.test(line)) {
      inOpenQuestions = false;
    }

    if (inOpenQuestions) continue;

    // Skip individual QUESTION: lines
    if (line.trim().startsWith('QUESTION:')) continue;

    filteredLines.push(line);
  }

  return filteredLines.join('\n').trim();
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format as JSON
 */
function formatJson(spec: ExportedSpec): string {
  return JSON.stringify(spec, null, 2);
}

/**
 * Format as Markdown
 */
function formatMarkdown(spec: ExportedSpec): string {
  const lines: string[] = [];

  lines.push(`# ${spec.title}`);
  lines.push('');

  const sectionOrder = [
    'userStory',
    'acceptanceCriteria',
    'scope',
    'implementationApproach',
    'nonFunctionalRequirements',
    'specificationByExample',
    'edgeCases',
    'testStrategy',
    'definitionOfDone',
  ];

  for (const key of sectionOrder) {
    const content = spec.spec[key as keyof typeof spec.spec];
    if (content) {
      const display = SECTION_DISPLAY[key];
      lines.push(`## ${display?.name || key}`);
      lines.push(content);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format as CLI output with colors and emojis
 */
function formatCli(spec: ExportedSpec, useColors: boolean): string {
  const lines: string[] = [];

  // Header
  const title = useColors
    ? `\u{1F4CB} Issue #${spec.issueNumber}: ${spec.title}`
    : `Issue #${spec.issueNumber}: ${spec.title}`;
  lines.push(title);
  lines.push(useColors ? chalk.dim('\u2501'.repeat(60)) : '-'.repeat(60));
  lines.push('');

  const sectionOrder = [
    'userStory',
    'acceptanceCriteria',
    'scope',
    'implementationApproach',
    'nonFunctionalRequirements',
    'specificationByExample',
    'edgeCases',
    'testStrategy',
    'definitionOfDone',
  ];

  for (const key of sectionOrder) {
    const content = spec.spec[key as keyof typeof spec.spec];
    if (content) {
      const display = SECTION_DISPLAY[key];
      const header = useColors
        ? `${display?.emoji || ''} ${chalk.bold(display?.name || key)}`
        : display?.name || key;
      lines.push(header);

      // Format content with bullets for list items
      const formattedContent = formatCliContent(content, useColors);
      lines.push(formattedContent);
      lines.push('');
    }
  }

  // Metadata footer
  if (useColors) {
    lines.push(chalk.dim(`Exported: ${spec.metadata.exportedAt}`));
    lines.push(chalk.dim(`Source: ${spec.metadata.parsedFrom} spec`));
    if (spec.metadata.missingSections.length > 0) {
      const names = spec.metadata.missingSections.map((s) => SECTION_DISPLAY[s]?.name || s);
      lines.push(chalk.yellow(`Missing: ${names.join(', ')}`));
    }
  }

  return lines.join('\n');
}

/**
 * Format content for CLI display
 */
function formatCliContent(content: string, useColors: boolean): string {
  const lines = content.split('\n');
  const formattedLines: string[] = [];

  for (const line of lines) {
    // Convert markdown list items to bullets
    if (line.match(/^[-*]\s/)) {
      const bulletLine = useColors
        ? '\u2022 ' + line.replace(/^[-*]\s/, '')
        : '* ' + line.replace(/^[-*]\s/, '');
      formattedLines.push(bulletLine);
    } else if (line.match(/^- \[[ x]\]/i)) {
      // Checkbox items
      const checked = line.match(/^- \[x\]/i);
      const text = line.replace(/^- \[[ x]\]\s*/i, '');
      const checkbox = checked ? (useColors ? '\u2611' : '[x]') : useColors ? '\u2610' : '[ ]';
      formattedLines.push(`${checkbox} ${text}`);
    } else {
      formattedLines.push(line);
    }
  }

  return formattedLines.join('\n');
}
