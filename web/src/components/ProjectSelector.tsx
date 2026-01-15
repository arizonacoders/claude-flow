import { useState, useEffect } from 'react';
import type { Project } from '../types';

const API_BASE = '/api';

interface ProjectSelectorProps {
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
}

export function ProjectSelector({ selectedProjectId, onSelectProject }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetch(`${API_BASE}/projects`);
      if (!response.ok) throw new Error('Failed to load projects');
      const data = await response.json();
      setProjects(data);
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  if (loading) {
    return <span className="project-selector loading">Loading...</span>;
  }

  if (error) {
    return <span className="project-selector error">{error}</span>;
  }

  if (projects.length === 0) {
    return (
      <span className="project-selector empty">
        No projects. Run <code>claude-flow project init</code> to create one.
      </span>
    );
  }

  return (
    <div className="project-selector">
      <label htmlFor="project-select">Project:</label>
      <select
        id="project-select"
        value={selectedProjectId || ''}
        onChange={(e) => onSelectProject(e.target.value || null)}
      >
        <option value="">All Projects</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name} ({project.stats?.total || 0} issues)
          </option>
        ))}
      </select>
    </div>
  );
}
