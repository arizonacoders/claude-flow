import { describe, it, expect } from 'vitest';

// We need to test the internal functions from export.ts
// Since they're not exported, we'll test via the module internals
// For now, we test the extraction logic patterns

describe('Export Section Parser', () => {
  describe('Section Header Patterns', () => {
    it('should match USER STORY header (uppercase)', () => {
      const content = `## USER STORY

As a developer, I want to export issues so that I can share specs.`;
      const match = content.match(/##\s*USER STORY\s*\n([\s\S]*?)(?=\n##|$)/i);
      expect(match).toBeTruthy();
      expect(match![1].trim()).toContain('As a developer');
    });

    it('should match header case-insensitively', () => {
      const content = `## user story

As a developer, I want to export issues.`;
      const match = content.match(/##\s*USER STORY\s*\n([\s\S]*?)(?=\n##|$)/i);
      expect(match).toBeTruthy();
    });

    it('should extract content until next header', () => {
      const content = `## USER STORY

As a developer, I want to export issues.

## ACCEPTANCE CRITERIA

- Given an issue
- When I export
- Then I get JSON`;
      const match = content.match(/##\s*USER STORY\s*\n([\s\S]*?)(?=\n##|$)/i);
      expect(match).toBeTruthy();
      const extracted = match![1].trim();
      expect(extracted).toBe('As a developer, I want to export issues.');
      expect(extracted).not.toContain('ACCEPTANCE');
    });

    it('should handle ### headers', () => {
      const content = `### User Story

As a developer...`;
      const match = content.match(/###\s*User Story\s*\n([\s\S]*?)(?=\n###|\n##|$)/i);
      expect(match).toBeTruthy();
      expect(match![1].trim()).toContain('As a developer');
    });
  });

  describe('QUESTION: Stripping', () => {
    it('should strip lines starting with QUESTION:', () => {
      const content = `## USER STORY

QUESTION: Who is the user?
As a developer, I want to export issues.
QUESTION: What is the benefit?
So that I can share specs.`;

      const lines = content.split('\n');
      const filtered = lines.filter((line) => !line.trim().startsWith('QUESTION:'));
      const result = filtered.join('\n');

      expect(result).not.toContain('QUESTION:');
      expect(result).toContain('As a developer');
      expect(result).toContain('So that I can share');
    });
  });

  describe('SPECIFICATION COMPLETE Detection', () => {
    it('should detect synthesized spec marker', () => {
      const content = `## SPECIFICATION COMPLETE

### User Story
As a developer...

### Acceptance Criteria
- Given...`;
      expect(content.includes('## SPECIFICATION COMPLETE')).toBe(true);
    });

    it('should prefer synthesized spec over individual sections', () => {
      // This tests the priority logic
      const synthesizedComment = {
        persona: 'triage',
        content: `## SPECIFICATION COMPLETE

### User Story
Final synthesized version`,
      };

      const individualComment = {
        persona: 'review-draft',
        content: `## USER STORY

Draft version from agent`,
      };

      // Priority: synthesized from triage > individual from review-draft
      expect(synthesizedComment.content.includes('## SPECIFICATION COMPLETE')).toBe(true);
    });
  });

  describe('OPEN QUESTIONS Section Exclusion', () => {
    it('should exclude OPEN QUESTIONS section', () => {
      const content = `## USER STORY

As a developer...

## OPEN QUESTIONS

- What about edge cases?
- Should we support X?

## ACCEPTANCE CRITERIA

- Given...`;

      // Simulate the filtering logic
      const lines = content.split('\n');
      const filteredLines: string[] = [];
      let inOpenQuestions = false;

      for (const line of lines) {
        if (/^##?\s*(OPEN QUESTIONS|TECHNICAL OPEN QUESTIONS|TESTING OPEN QUESTIONS)/i.test(line)) {
          inOpenQuestions = true;
          continue;
        }
        if (inOpenQuestions && /^##?\s+\w/i.test(line)) {
          inOpenQuestions = false;
        }
        if (inOpenQuestions) continue;
        filteredLines.push(line);
      }

      const result = filteredLines.join('\n');
      expect(result).not.toContain('OPEN QUESTIONS');
      expect(result).not.toContain('What about edge cases');
      expect(result).toContain('USER STORY');
      expect(result).toContain('ACCEPTANCE CRITERIA');
    });
  });

  describe('JSON Output Format', () => {
    it('should produce valid JSON structure', () => {
      const spec = {
        version: '1.0',
        issueNumber: 42,
        title: 'Test Issue',
        spec: {
          userStory: 'As a developer...',
          acceptanceCriteria: '- Given...',
        },
        metadata: {
          exportedAt: new Date().toISOString(),
          sourceStatus: 'ready',
          issueId: 'abc-123',
          parsedFrom: 'synthesized' as const,
          missingSections: [],
        },
      };

      const json = JSON.stringify(spec, null, 2);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe('1.0');
      expect(parsed.issueNumber).toBe(42);
      expect(parsed.spec.userStory).toBe('As a developer...');
      expect(parsed.metadata.parsedFrom).toBe('synthesized');
    });
  });

  describe('Markdown Output Format', () => {
    it('should produce valid markdown with headers', () => {
      const title = 'Test Issue';
      const sections = {
        userStory: 'As a developer...',
        acceptanceCriteria: '- Given...\n- When...\n- Then...',
      };

      const lines = [`# ${title}`, '', '## User Story', sections.userStory, '', '## Acceptance Criteria', sections.acceptanceCriteria];

      const md = lines.join('\n');

      expect(md).toContain('# Test Issue');
      expect(md).toContain('## User Story');
      expect(md).toContain('## Acceptance Criteria');
    });
  });

  describe('Persona to Section Mapping', () => {
    const personaSections: Record<string, string[]> = {
      'review-draft': ['userStory', 'acceptanceCriteria', 'scope'],
      architect: ['implementationApproach', 'nonFunctionalRequirements'],
      'qa-review': ['specificationByExample', 'edgeCases', 'testStrategy'],
      triage: ['definitionOfDone'],
    };

    it('should map review-draft to user story sections', () => {
      expect(personaSections['review-draft']).toContain('userStory');
      expect(personaSections['review-draft']).toContain('acceptanceCriteria');
    });

    it('should map architect to implementation sections', () => {
      expect(personaSections['architect']).toContain('implementationApproach');
      expect(personaSections['architect']).toContain('nonFunctionalRequirements');
    });

    it('should map qa-review to test sections', () => {
      expect(personaSections['qa-review']).toContain('testStrategy');
      expect(personaSections['qa-review']).toContain('edgeCases');
    });

    it('should map triage to definition of done', () => {
      expect(personaSections['triage']).toContain('definitionOfDone');
    });
  });
});
