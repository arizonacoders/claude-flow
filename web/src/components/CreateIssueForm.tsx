import { useState } from 'react';
import type { Priority } from '../types';
import * as api from '../api/client';

interface CreateIssueFormProps {
  onCreated: () => void;
  onCancel: () => void;
  projectId?: string | null;
}

export function CreateIssueForm({ onCreated, onCancel, projectId }: CreateIssueFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      await api.createIssue({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        projectId: projectId || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create issue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="create-issue-overlay">
      <div className="create-issue-modal">
        <h2>Create New Issue</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="title">Title *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Issue title"
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="form-field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
              disabled={submitting}
              rows={4}
            />
          </div>

          <div className="form-field">
            <label htmlFor="priority">Priority</label>
            <select
              id="priority"
              value={priority}
              onChange={e => setPriority(e.target.value as Priority)}
              disabled={submitting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="form-actions">
            <button type="button" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={submitting || !title.trim()}>
              {submitting ? 'Creating...' : 'Create Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
