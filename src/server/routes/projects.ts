import { Router, Request, Response } from 'express';

export const projectsRouter = Router();

// ============ Projects ============

// List all projects
projectsRouter.get('/', (req: Request, res: Response) => {
  try {
    const projects = req.store.getAllProjects();

    // Include stats for each project
    const projectsWithStats = projects.map((project) => ({
      ...project,
      stats: req.store.getProjectStats(project.id),
    }));

    res.json(projectsWithStats);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Create project (usually done via CLI, but API available)
projectsRouter.post('/', (req: Request, res: Response) => {
  try {
    const { name, gitRemote, gitPath } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    // Check if project with same remote already exists
    if (gitRemote) {
      const existing = req.store.getProjectByRemote(gitRemote);
      if (existing) {
        res.status(409).json({
          error: 'Project with this git remote already exists',
          project: existing,
        });
        return;
      }
    }

    const project = req.store.createProject({
      name,
      gitRemote,
      gitPath,
    });

    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get project by ID
projectsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const project = req.store.getProject(req.params.id);

    if (!project) {
      // Try by name
      const byName = req.store.getProjectByName(req.params.id);
      if (!byName) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json({
        ...byName,
        stats: req.store.getProjectStats(byName.id),
      });
      return;
    }

    res.json({
      ...project,
      stats: req.store.getProjectStats(project.id),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get project stats
projectsRouter.get('/:id/stats', (req: Request, res: Response) => {
  try {
    const project = req.store.getProject(req.params.id);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const stats = req.store.getProjectStats(project.id);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete project
projectsRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const project = req.store.getProject(req.params.id);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const deleted = req.store.deleteProject(project.id);
    res.json({ deleted, id: project.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
