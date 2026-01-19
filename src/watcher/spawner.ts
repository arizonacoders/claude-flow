import { spawn, ChildProcess } from 'child_process';
import type { StatusTrigger, SpawnResult } from './types.js';

/**
 * Check if a process is still running
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn a Claude process for an issue
 */
export function spawnClaude(
  issueNumber: number,
  trigger: StatusTrigger,
  projectDir: string,
  onExit?: (code: number | null) => void
): SpawnResult {
  const command = `${trigger.command} ${issueNumber}`;
  const args = ['--print', command];

  if (trigger.allowedTools) {
    args.push('--allowedTools', trigger.allowedTools);
  }

  const child: ChildProcess = spawn('claude', args, {
    cwd: projectDir,
    detached: true,
    stdio: 'ignore',
  });

  // Unref so parent can exit independently
  child.unref();

  if (onExit && child.pid) {
    child.on('exit', onExit);
  }

  return {
    pid: child.pid!,
    command,
    issueNumber,
  };
}

/**
 * Kill a Claude process by PID
 */
export function killProcess(pid: number): boolean {
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get process info (basic check)
 */
export function getProcessInfo(pid: number): { running: boolean } {
  return {
    running: isProcessRunning(pid),
  };
}
