import { randomBytes } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { UserError } from './errors.ts';
import { isTaskStatus, type Task } from './types.ts';

const DEFAULT_FILE_NAME = 'tasks.json';

/**
 * Location of the JSON store: `tasks.json` in the current working directory,
 * overridable with TASK_TRACKER_FILE (used by the tests).
 */
export function resolveStorePath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const override = env.TASK_TRACKER_FILE?.trim();
  return override ? path.resolve(cwd, override) : path.join(cwd, DEFAULT_FILE_NAME);
}

/**
 * Reads the tasks from disk. A missing file is not an error: it means "no tasks
 * yet", and the file gets created on the first write.
 */
export async function loadTasks(storePath: string): Promise<Task[]> {
  let raw: string;
  try {
    raw = await readFile(storePath, 'utf8');
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return [];
    if (isErrnoException(error) && error.code === 'EISDIR') {
      throw new UserError(`Cannot read tasks: ${storePath} is a directory, not a file.`);
    }
    throw new UserError(`Cannot read ${storePath}: ${describe(error)}`);
  }

  if (raw.trim() === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UserError(
      `${storePath} does not contain valid JSON. Fix or remove the file and try again.`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new UserError(`${storePath} must contain a JSON array of tasks.`);
  }

  return parsed.map((entry, index) => parseTask(entry, index, storePath));
}

/**
 * Writes the tasks to disk. The write goes to a temporary file in the same
 * directory first and is then renamed, so an interrupted run can never leave a
 * half-written store behind.
 */
export async function saveTasks(storePath: string, tasks: readonly Task[]): Promise<void> {
  const serialized = `${JSON.stringify(tasks, null, 2)}\n`;
  const tempPath = `${storePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;

  try {
    await writeFile(tempPath, serialized, 'utf8');
    await rename(tempPath, storePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    if (isErrnoException(error) && (error.code === 'EACCES' || error.code === 'EPERM')) {
      throw new UserError(`Cannot write to ${storePath}: permission denied.`);
    }
    if (isErrnoException(error) && error.code === 'ENOENT') {
      throw new UserError(`Cannot write to ${storePath}: the directory does not exist.`);
    }
    throw new UserError(`Cannot write to ${storePath}: ${describe(error)}`);
  }
}

function parseTask(entry: unknown, index: number, storePath: string): Task {
  const where = `${storePath} (entry ${index + 1})`;

  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new UserError(`Malformed task in ${where}: expected an object.`);
  }

  const record = entry as Record<string, unknown>;
  const { id, description, status, createdAt, updatedAt } = record;

  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    throw new UserError(`Malformed task in ${where}: "id" must be a positive integer.`);
  }
  if (typeof description !== 'string') {
    throw new UserError(`Malformed task in ${where}: "description" must be a string.`);
  }
  if (!isTaskStatus(status)) {
    throw new UserError(
      `Malformed task in ${where}: "status" must be todo, in-progress, or done.`,
    );
  }
  if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') {
    throw new UserError(
      `Malformed task in ${where}: "createdAt" and "updatedAt" must be strings.`,
    );
  }

  return { id, description, status, createdAt, updatedAt };
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
