import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let currentLevel: LogLevel = 'info';
let jsonMode = false;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function formatMessage(level: LogLevel, message: string, data?: Record<string, unknown>): string {
  if (jsonMode) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    });
  }

  const timestamp = new Date().toLocaleTimeString();
  const prefix = {
    debug: chalk.gray(`[${timestamp}] DEBUG`),
    info: chalk.blue(`[${timestamp}] INFO`),
    warn: chalk.yellow(`[${timestamp}] WARN`),
    error: chalk.red(`[${timestamp}] ERROR`),
  }[level];

  let output = `${prefix} ${message}`;
  if (data) {
    output += ` ${chalk.gray(JSON.stringify(data))}`;
  }
  return output;
}

export function debug(message: string, data?: Record<string, unknown>): void {
  if (shouldLog('debug')) {
    console.log(formatMessage('debug', message, data));
  }
}

export function info(message: string, data?: Record<string, unknown>): void {
  if (shouldLog('info')) {
    console.log(formatMessage('info', message, data));
  }
}

export function warn(message: string, data?: Record<string, unknown>): void {
  if (shouldLog('warn')) {
    console.warn(formatMessage('warn', message, data));
  }
}

export function error(message: string, data?: Record<string, unknown>): void {
  if (shouldLog('error')) {
    console.error(formatMessage('error', message, data));
  }
}

// Status-specific formatters
export function session(action: string, sessionId: string, details?: string): void {
  if (jsonMode) {
    info(action, { sessionId, details });
  } else {
    const shortId = sessionId.slice(0, 8);
    console.log(`${chalk.cyan('●')} ${action} ${chalk.dim(`[${shortId}]`)}${details ? ` ${details}` : ''}`);
  }
}

export function issue(number: number, status: string, title?: string): void {
  if (jsonMode) {
    info('Issue status', { number, status, title });
  } else {
    const statusColor = {
      Ready: chalk.green,
      Draft: chalk.yellow,
      'Developer Review': chalk.blue,
      'Test Case Design Review': chalk.magenta,
      'In Progress': chalk.cyan,
    }[status] || chalk.white;

    console.log(`  ${chalk.dim('#')}${number} ${statusColor(status)}${title ? ` ${chalk.dim(title)}` : ''}`);
  }
}

export function success(message: string): void {
  if (jsonMode) {
    info(message, { success: true });
  } else {
    console.log(`${chalk.green('✓')} ${message}`);
  }
}

export function failure(message: string): void {
  if (jsonMode) {
    error(message, { success: false });
  } else {
    console.log(`${chalk.red('✗')} ${message}`);
  }
}

export const logger = {
  debug,
  info,
  warn,
  error,
  session,
  issue,
  success,
  failure,
  setLevel: setLogLevel,
  setJsonMode,
};
