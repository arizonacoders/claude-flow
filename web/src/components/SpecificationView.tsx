import { useMemo } from 'react';
import type { ParsedSpec } from '../utils/specParser';

interface SpecificationViewProps {
  spec: ParsedSpec;
}

interface SpecFieldProps {
  label: string;
  content: string;
}

function SpecField({ label, content }: SpecFieldProps) {
  return (
    <div className="spec-field">
      <h4 className="spec-field-label">{label}</h4>
      <div className="spec-field-content">
        <pre>{content}</pre>
      </div>
    </div>
  );
}

export function SpecificationView({ spec }: SpecificationViewProps) {
  // Compute which fields to display
  const fields = useMemo(() => {
    const result: { label: string; content: string }[] = [];

    if (spec.userStory) {
      result.push({ label: 'User Story', content: spec.userStory });
    }
    if (spec.acceptanceCriteria) {
      result.push({ label: 'Acceptance Criteria', content: spec.acceptanceCriteria });
    }
    if (spec.inScope) {
      result.push({ label: 'In Scope', content: spec.inScope });
    }
    if (spec.outOfScope) {
      result.push({ label: 'Out of Scope', content: spec.outOfScope });
    }
    if (spec.componentsAffected) {
      result.push({ label: 'Components Affected', content: spec.componentsAffected });
    }

    return result;
  }, [spec]);

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="specification-view">
      <h3>Specification</h3>
      <div className="spec-fields">
        {fields.map(field => (
          <SpecField key={field.label} label={field.label} content={field.content} />
        ))}
      </div>
    </div>
  );
}
