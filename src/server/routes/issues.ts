import { Router, Request, Response } from 'express';
import { existsSync, readFileSync } from 'fs';
import type {
  IssueStatus,
  Priority,
  LinkType,
  PersonaType,
} from '../../types/index.js';

export const issuesRouter = Router();

// ============ Issues ============

// List all issues
issuesRouter.get('/', (req: Request, res: Response) => {
  try {
    const status = req.query.status as IssueStatus | undefined;
    const projectId = req.query.project_id as string | undefined;

    // If project_id is provided, filter by it. Otherwise show all.
    const issues = req.store.getAllIssues(status, projectId);
    res.json(issues);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Create issue
issuesRouter.post('/', (req: Request, res: Response) => {
  try {
    const { title, description, priority, parentId, projectId } = req.body;

    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    // Resolve parent if provided
    let resolvedParentId: string | undefined;
    if (parentId) {
      const parent = req.store.getIssue(parentId);
      if (!parent) {
        res.status(400).json({ error: `Parent issue '${parentId}' not found` });
        return;
      }
      resolvedParentId = parent.id;
    }

    // Validate project if provided
    if (projectId) {
      const project = req.store.getProject(projectId);
      if (!project) {
        res.status(400).json({ error: `Project '${projectId}' not found` });
        return;
      }
    }

    const issue = req.store.createIssue({
      title,
      description,
      priority: priority as Priority,
      parentId: resolvedParentId,
      projectId,
    });

    res.status(201).json(issue);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get issue by ID
issuesRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const issue = req.store.getIssue(req.params.id);

    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    // Get related data
    const children = req.store.getChildIssues(issue.id);
    const links = req.store.getLinksForIssue(issue.id);
    const docs = req.store.getDocLinksForIssue(issue.id);
    const comments = req.store.getCommentsForIssue(issue.id);
    const parent = issue.parentId ? req.store.getIssue(issue.parentId) : undefined;
    const project = issue.projectId ? req.store.getProject(issue.projectId) : undefined;

    // Get linked issues
    const linkedIssues = links.map((link) => {
      const otherId = link.sourceId === issue.id ? link.targetId : link.sourceId;
      const otherIssue = req.store.getIssue(otherId);
      return { link, issue: otherIssue };
    });

    res.json({
      ...issue,
      parent,
      children,
      links,
      linkedIssues,
      docs,
      comments,
      project,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update issue
issuesRouter.put('/:id', (req: Request, res: Response) => {
  try {
    const issue = req.store.getIssue(req.params.id);

    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    const { title, description, status, priority, parentId, projectId } = req.body;

    // Resolve parent if provided
    let resolvedParentId: string | undefined;
    if (parentId !== undefined) {
      if (parentId) {
        const parent = req.store.getIssue(parentId);
        if (!parent) {
          res.status(400).json({ error: `Parent issue '${parentId}' not found` });
          return;
        }
        resolvedParentId = parent.id;
      } else {
        resolvedParentId = undefined; // Remove parent
      }
    }

    // Validate project if provided
    if (projectId) {
      const project = req.store.getProject(projectId);
      if (!project) {
        res.status(400).json({ error: `Project '${projectId}' not found` });
        return;
      }
    }

    const updated = req.store.updateIssue(issue.id, {
      title,
      description,
      status: status as IssueStatus,
      priority: priority as Priority,
      parentId: parentId !== undefined ? resolvedParentId : undefined,
      projectId: projectId !== undefined ? (projectId || undefined) : undefined,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete issue
issuesRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const issue = req.store.getIssue(req.params.id);

    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    const deleted = req.store.deleteIssue(issue.id);
    res.json({ deleted, id: issue.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============ Comments ============

// Get comments for issue
issuesRouter.get('/:id/comments', (req: Request, res: Response) => {
  try {
    const issue = req.store.getIssue(req.params.id);

    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    const comments = req.store.getCommentsForIssue(issue.id);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add comment to issue
issuesRouter.post('/:id/comments', (req: Request, res: Response) => {
  try {
    const issue = req.store.getIssue(req.params.id);

    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    const { persona, content, parentCommentId, metadata } = req.body;

    if (!persona) {
      res.status(400).json({ error: 'Persona is required' });
      return;
    }

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'Comment content cannot be empty' });
      return;
    }

    // Validate parentCommentId if provided
    if (parentCommentId) {
      const parentComment = req.store.getComment(parentCommentId);
      if (!parentComment) {
        res.status(400).json({ error: 'Parent comment not found' });
        return;
      }

      // Validate parent comment belongs to same issue
      if (parentComment.issueId !== issue.id) {
        res.status(400).json({ error: 'Parent comment must belong to the same issue' });
        return;
      }
    }

    const comment = req.store.createComment({
      issueId: issue.id,
      persona: persona as PersonaType,
      content,
      parentCommentId,
      metadata,
    });

    res.status(201).json(comment);
  } catch (error) {
    const errorMessage = (error as Error).message;
    // Return 400 for validation errors
    if (errorMessage.includes('Maximum nesting depth') ||
        errorMessage.includes('Parent comment not found') ||
        errorMessage.includes('Cannot reply to self')) {
      res.status(400).json({ error: errorMessage });
    } else {
      res.status(500).json({ error: errorMessage });
    }
  }
});

// ============ Links ============

// Get links for issue
issuesRouter.get('/:id/links', (req: Request, res: Response) => {
  try {
    const issue = req.store.getIssue(req.params.id);

    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    const links = req.store.getLinksForIssue(issue.id);

    // Include linked issue info
    const linksWithIssues = links.map((link) => {
      const otherId = link.sourceId === issue.id ? link.targetId : link.sourceId;
      const otherIssue = req.store.getIssue(otherId);
      const direction = link.sourceId === issue.id ? 'outgoing' : 'incoming';
      return { ...link, linkedIssue: otherIssue, direction };
    });

    res.json(linksWithIssues);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Create link from issue
issuesRouter.post('/:id/links', (req: Request, res: Response) => {
  try {
    const sourceIssue = req.store.getIssue(req.params.id);

    if (!sourceIssue) {
      res.status(404).json({ error: 'Source issue not found' });
      return;
    }

    const { targetId, linkType } = req.body;

    if (!targetId) {
      res.status(400).json({ error: 'Target ID is required' });
      return;
    }

    if (!linkType) {
      res.status(400).json({ error: 'Link type is required' });
      return;
    }

    const targetIssue = req.store.getIssue(targetId);
    if (!targetIssue) {
      res.status(400).json({ error: `Target issue '${targetId}' not found` });
      return;
    }

    // Check for self-link
    if (sourceIssue.id === targetIssue.id) {
      res.status(400).json({ error: 'Cannot link an issue to itself' });
      return;
    }

    // Check if link exists
    const existing = req.store.findLink(sourceIssue.id, targetIssue.id, linkType as LinkType);
    if (existing) {
      res.status(409).json({ error: 'Link already exists', link: existing });
      return;
    }

    const link = req.store.createLink({
      sourceId: sourceIssue.id,
      targetId: targetIssue.id,
      linkType: linkType as LinkType,
    });

    res.status(201).json({ ...link, targetIssue });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete link
issuesRouter.delete('/links/:linkId', (req: Request, res: Response) => {
  try {
    const link = req.store.getLink(req.params.linkId);

    if (!link) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }

    const deleted = req.store.deleteLink(link.id);
    res.json({ deleted, id: link.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============ Docs ============

// Get doc links for issue
issuesRouter.get('/:id/docs', (req: Request, res: Response) => {
  try {
    const issue = req.store.getIssue(req.params.id);

    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    const docs = req.store.getDocLinksForIssue(issue.id);

    // Add existence check
    const docsWithStatus = docs.map((doc) => ({
      ...doc,
      exists: existsSync(doc.filePath),
    }));

    res.json(docsWithStatus);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add doc link to issue
issuesRouter.post('/:id/docs', (req: Request, res: Response) => {
  try {
    const issue = req.store.getIssue(req.params.id);

    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    const { filePath, title } = req.body;

    if (!filePath) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }

    const doc = req.store.createDocLink({
      issueId: issue.id,
      filePath,
      title,
    });

    res.status(201).json({ ...doc, exists: existsSync(filePath) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get doc content
issuesRouter.get('/docs/:docId/content', (req: Request, res: Response) => {
  try {
    const doc = req.store.getDocLink(req.params.docId);

    if (!doc) {
      res.status(404).json({ error: 'Doc link not found' });
      return;
    }

    if (!existsSync(doc.filePath)) {
      res.status(404).json({ error: 'File not found', filePath: doc.filePath });
      return;
    }

    const content = readFileSync(doc.filePath, 'utf-8');
    res.json({ ...doc, content });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete doc link
issuesRouter.delete('/docs/:docId', (req: Request, res: Response) => {
  try {
    const doc = req.store.getDocLink(req.params.docId);

    if (!doc) {
      res.status(404).json({ error: 'Doc link not found' });
      return;
    }

    const deleted = req.store.deleteDocLink(doc.id);
    res.json({ deleted, id: doc.id });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
