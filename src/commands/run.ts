import { EventLoop } from '../core/event-loop.js';
import { loadConfig } from '../utils/config.js';
import { logger, setLogLevel, setJsonMode } from '../utils/logger.js';
import type { PersonaType, WorkflowOptions } from '../types/index.js';

export async function runWorkflow(
  issueNumber: number,
  persona: PersonaType,
  options: WorkflowOptions
): Promise<void> {
  // Set up logging
  if (options.verbose) {
    setLogLevel('debug');
  }
  if (options.json) {
    setJsonMode(true);
  }

  const projectPath = process.cwd();
  const config = loadConfig(projectPath);

  logger.info(`Starting ${persona} workflow for issue #${issueNumber}`);

  const eventLoop = new EventLoop(config);

  try {
    await eventLoop.run({
      issueNumber,
      persona,
      projectPath,
      config,
      options,
    });
  } catch (error) {
    logger.error('Workflow failed', { error: (error as Error).message });
    process.exit(1);
  } finally {
    eventLoop.close();
  }
}
