import type { Comment } from '../types';

export interface ParsedSpec {
  userStory?: string;
  acceptanceCriteria?: string;
  inScope?: string;
  outOfScope?: string;
  componentsAffected?: string;
}

interface SectionMatch {
  content: string;
  timestamp: Date;
}

/**
 * Extract spec fields from comment markdown.
 * Searches for ## headers (case-insensitive) and extracts content
 * until the next ## header or end of comment.
 */
export function parseSpecFromComments(comments: Comment[]): ParsedSpec {
  const spec: ParsedSpec = {};

  // Track matches with timestamps to keep most recent
  const matches: Record<keyof ParsedSpec, SectionMatch | undefined> = {
    userStory: undefined,
    acceptanceCriteria: undefined,
    inScope: undefined,
    outOfScope: undefined,
    componentsAffected: undefined,
  };

  // Sort comments by createdAt ascending so we process oldest first
  // (later ones will overwrite with most recent)
  const sortedComments = [...comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const comment of sortedComments) {
    const content = comment.content;
    const timestamp = new Date(comment.createdAt);

    // Extract USER STORY
    const userStoryContent = extractSection(content, 'USER STORY');
    if (userStoryContent) {
      matches.userStory = { content: userStoryContent, timestamp };
    }

    // Extract ACCEPTANCE CRITERIA
    const acceptanceCriteriaContent = extractSection(content, 'ACCEPTANCE CRITERIA');
    if (acceptanceCriteriaContent) {
      matches.acceptanceCriteria = { content: acceptanceCriteriaContent, timestamp };
    }

    // Extract SCOPE section and parse In Scope / Out of Scope subsections
    const scopeContent = extractSection(content, 'SCOPE');
    if (scopeContent) {
      const inScopeContent = extractSubsection(scopeContent, 'In Scope');
      const outOfScopeContent = extractSubsection(scopeContent, 'Out of Scope');

      if (inScopeContent) {
        matches.inScope = { content: inScopeContent, timestamp };
      }
      if (outOfScopeContent) {
        matches.outOfScope = { content: outOfScopeContent, timestamp };
      }
    }

    // Extract IMPLEMENTATION APPROACH or Components Affected
    const implementationContent = extractSection(content, 'IMPLEMENTATION APPROACH');
    if (implementationContent) {
      // Look for Components Affected subsection within implementation approach
      // Try both **bold:** format and ### header format
      let componentsContent = extractSubsection(implementationContent, 'Components Affected');
      if (!componentsContent) {
        componentsContent = extractH3Section(implementationContent, 'Components Affected');
      }
      if (componentsContent) {
        matches.componentsAffected = { content: componentsContent, timestamp };
      }
    }

    // Also check for standalone Components Affected section (## level)
    const standaloneComponentsContent = extractSection(content, 'Components Affected');
    if (standaloneComponentsContent) {
      matches.componentsAffected = { content: standaloneComponentsContent, timestamp };
    }
  }

  // Build final spec object (only include fields with content)
  if (matches.userStory) {
    spec.userStory = matches.userStory.content;
  }
  if (matches.acceptanceCriteria) {
    spec.acceptanceCriteria = matches.acceptanceCriteria.content;
  }
  if (matches.inScope) {
    spec.inScope = matches.inScope.content;
  }
  if (matches.outOfScope) {
    spec.outOfScope = matches.outOfScope.content;
  }
  if (matches.componentsAffected) {
    spec.componentsAffected = matches.componentsAffected.content;
  }

  return spec;
}

/**
 * Extract content for a section by header name (case-insensitive).
 * Looks for ## headers and extracts content until next ## header or end.
 */
function extractSection(content: string, sectionName: string): string | undefined {
  // Build regex to match ## SECTION NAME (case-insensitive)
  // Allow for optional text after the section name (e.g., "## USER STORY (draft)")
  const headerPattern = new RegExp(
    `^##\\s+${escapeRegex(sectionName)}(?:\\s|$)`,
    'im'
  );

  const match = content.match(headerPattern);
  if (!match || match.index === undefined) {
    return undefined;
  }

  // Find where the section content starts (after the header line)
  const headerStart = match.index;
  const headerEnd = content.indexOf('\n', headerStart);
  if (headerEnd === -1) {
    return undefined; // Header at end of content with no body
  }

  // Find the next ## header or end of content
  const bodyStart = headerEnd + 1;
  const nextHeaderMatch = content.slice(bodyStart).match(/^##\s+/m);

  let bodyEnd: number;
  if (nextHeaderMatch && nextHeaderMatch.index !== undefined) {
    bodyEnd = bodyStart + nextHeaderMatch.index;
  } else {
    bodyEnd = content.length;
  }

  const body = content.slice(bodyStart, bodyEnd).trim();
  return body || undefined;
}

/**
 * Extract subsection content from within a section.
 * Looks for **Subsection Name:** pattern and extracts until next ** or end.
 */
function extractSubsection(content: string, subsectionName: string): string | undefined {
  // Match **In Scope:** or **Out of Scope:** patterns (case-insensitive)
  const subsectionPattern = new RegExp(
    `\\*\\*${escapeRegex(subsectionName)}:\\*\\*`,
    'i'
  );

  const match = content.match(subsectionPattern);
  if (!match || match.index === undefined) {
    return undefined;
  }

  // Find content after the subsection marker
  const markerEnd = match.index + match[0].length;
  const restOfContent = content.slice(markerEnd);

  // Find next **Something:** marker or end
  const nextMarkerMatch = restOfContent.match(/\n\*\*[^*]+:\*\*/);

  let subsectionContent: string;
  if (nextMarkerMatch && nextMarkerMatch.index !== undefined) {
    subsectionContent = restOfContent.slice(0, nextMarkerMatch.index);
  } else {
    subsectionContent = restOfContent;
  }

  return subsectionContent.trim() || undefined;
}

/**
 * Extract content for an H3 section (### header) within content.
 */
function extractH3Section(content: string, sectionName: string): string | undefined {
  // Build regex to match ### SECTION NAME (case-insensitive)
  const headerPattern = new RegExp(
    `^###\\s+${escapeRegex(sectionName)}(?:\\s|$)`,
    'im'
  );

  const match = content.match(headerPattern);
  if (!match || match.index === undefined) {
    return undefined;
  }

  // Find where the section content starts (after the header line)
  const headerStart = match.index;
  const headerEnd = content.indexOf('\n', headerStart);
  if (headerEnd === -1) {
    return undefined;
  }

  // Find the next ## or ### header or end of content
  const bodyStart = headerEnd + 1;
  const nextHeaderMatch = content.slice(bodyStart).match(/^#{2,3}\s+/m);

  let bodyEnd: number;
  if (nextHeaderMatch && nextHeaderMatch.index !== undefined) {
    bodyEnd = bodyStart + nextHeaderMatch.index;
  } else {
    bodyEnd = content.length;
  }

  const body = content.slice(bodyStart, bodyEnd).trim();
  return body || undefined;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if any spec fields are populated.
 */
export function hasSpecContent(spec: ParsedSpec): boolean {
  return !!(
    spec.userStory ||
    spec.acceptanceCriteria ||
    spec.inScope ||
    spec.outOfScope ||
    spec.componentsAffected
  );
}
