import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { issuesRouter } from './routes/issues.js';
import { projectsRouter } from './routes/projects.js';
import { Store } from '../core/store.js';

import { getDbPath } from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ServerOptions {
  port: number;
  host: string;
}

// Extend Express Request to include store
declare global {
  namespace Express {
    interface Request {
      store: Store;
    }
  }
}

export function createServer(options: ServerOptions): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Attach store to request
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.store = new Store(getDbPath());

    // Clean up store on response finish
    res.on('finish', () => {
      req.store.close();
    });

    next();
  });

  // API Routes
  app.use('/api/issues', issuesRouter);
  app.use('/api/projects', projectsRouter);

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Serve static files from React build
  // Look in multiple locations: relative to dist (production) and relative to src (dev)
  const possibleWebDirs = [
    join(__dirname, '../../web/dist'),  // When running from dist/
    join(__dirname, '../web/dist'),     // Alternative path
    join(process.cwd(), 'web/dist'),    // From project root
  ];

  const webDir = possibleWebDirs.find(dir => existsSync(dir));

  if (webDir) {
    app.use(express.static(webDir));

    // Catch-all middleware for client-side routing - serve index.html
    // This handles any GET requests that weren't matched by API routes or static files
    app.use((req: Request, res: Response, next: NextFunction) => {
      // Only serve index.html for GET requests that accept HTML
      if (req.method === 'GET' && req.accepts('html')) {
        res.sendFile(join(webDir, 'index.html'));
      } else {
        next();
      }
    });
  }

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message });
  });

  return app;
}

export async function startServer(options: ServerOptions): Promise<void> {
  const app = createServer(options);

  // Check if web UI is available
  const possibleWebDirs = [
    join(__dirname, '../../web/dist'),
    join(__dirname, '../web/dist'),
    join(process.cwd(), 'web/dist'),
  ];
  const webAvailable = possibleWebDirs.some(dir => existsSync(dir));

  return new Promise((resolve) => {
    app.listen(options.port, options.host, () => {
      console.log(`Server running at http://${options.host}:${options.port}`);
      console.log('');

      if (webAvailable) {
        console.log('Web UI: http://' + options.host + ':' + options.port);
        console.log('');
      } else {
        console.log('Web UI: Not built. Run "npm run build:web" in the web/ directory.');
        console.log('');
      }

      console.log('API Endpoints:');
      console.log('  GET    /api/issues              List issues (?project_id=)');
      console.log('  POST   /api/issues              Create issue');
      console.log('  GET    /api/issues/:id          Get issue');
      console.log('  PUT    /api/issues/:id          Update issue');
      console.log('  DELETE /api/issues/:id          Delete issue');
      console.log('  GET    /api/issues/:id/comments Get comments');
      console.log('  POST   /api/issues/:id/comments Add comment');
      console.log('  GET    /api/issues/:id/links    Get links');
      console.log('  POST   /api/issues/:id/links    Create link');
      console.log('  GET    /api/issues/:id/docs     Get doc links');
      console.log('  POST   /api/issues/:id/docs     Add doc link');
      console.log('');
      console.log('  GET    /api/projects            List projects');
      console.log('  GET    /api/projects/:id        Get project');
      console.log('  GET    /api/projects/:id/stats  Get project stats');
      console.log('');
      resolve();
    });
  });
}
