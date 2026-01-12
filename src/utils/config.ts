import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { OrchestratorConfig, PersonaType } from '../types/index.js';

const DEFAULT_CONFIG: OrchestratorConfig = {
  github: {
    owner: 'arizonacoders',
    repo: 'Pattison-Engineering-v2',
    projectNumber: 3,
  },
  claude: {
    model: 'sonnet',
    timeout: 120,
  },
  monitor: {
    pollInterval: 60,
    maxRetries: 3,
  },
  personas: {
    'review-draft': {
      targetStatuses: ['Developer Review', 'Ready'],
      feedbackStatus: 'Draft',
    },
    architect: {
      targetStatuses: ['Test Case Design Review', 'Ready'],
      feedbackStatus: 'Developer Review',
    },
    'qa-review': {
      targetStatuses: ['Developer Review', 'Ready'],
      feedbackStatus: 'Test Case Design Review',
    },
    triage: {
      targetStatuses: ['Backlog'],
      feedbackStatus: 'Unplanned',
    },
  },
};

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

export function loadConfig(projectPath: string = process.cwd()): OrchestratorConfig {
  const configPath = join(projectPath, 'claude-flow.config.json');

  if (existsSync(configPath)) {
    try {
      const userConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<OrchestratorConfig>;
      return deepMerge(DEFAULT_CONFIG, userConfig);
    } catch {
      console.warn(`Warning: Could not parse ${configPath}, using defaults`);
    }
  }

  return DEFAULT_CONFIG;
}

export function getPersonaConfig(persona: PersonaType, config: OrchestratorConfig) {
  return config.personas[persona];
}

export function getDataDir(): string {
  // Store data in user's home directory under .claude-flow
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return join(home, '.claude-flow', 'data');
}

export function getDbPath(): string {
  return join(getDataDir(), 'orchestrator.db');
}
