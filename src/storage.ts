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
      throw new UserError(`Não é possível ler as tarefas: ${storePath} é um diretório, não um arquivo.`);
    }
    throw new UserError(`Não é possível ler ${storePath}: ${describe(error)}`);
  }

  if (raw.trim() === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UserError(
      `${storePath} não contém JSON válido. Corrija ou remova o arquivo e tente novamente.`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new UserError(`${storePath} deve conter uma matriz JSON de tarefas.`);
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
      throw new UserError(`Não é possível escrever em ${storePath}: permissão negada.`);
    }
    if (isErrnoException(error) && error.code === 'ENOENT') {
      throw new UserError(`Não é possível escrever em ${storePath}: o diretório não existe.`);
    }
    throw new UserError(`Não é possível escrever em ${storePath}: ${describe(error)}`);
  }
}

function parseTask(entry: unknown, index: number, storePath: string): Task {
  const where = `${storePath} (entrada ${index + 1})`;

  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new UserError(`Tarefa malformada em ${where}: esperava um objeto.`);
  }

  const record = entry as Record<string, unknown>;
  const { id, description, status, createdAt, updatedAt } = record;

  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    throw new UserError(`Tarefa malformada em ${where}: "id" deve ser um inteiro positivo.`);
  }
  if (typeof description !== 'string') {
    throw new UserError(`Tarefa malformada em ${where}: "description" deve ser uma string.`);
  }
  if (!isTaskStatus(status)) {
    throw new UserError(
      `Tarefa malformada em ${where}: "status" deve ser todo, in-progress ou done.`,
    );
  }
  if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') {
    throw new UserError(
      `Tarefa malformada em ${where}: "createdAt" e "updatedAt" devem ser strings.`,
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
