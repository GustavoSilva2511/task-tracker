import { UserError } from './errors.ts';
import type { Task, TaskStatus } from './types.ts';

/**
 * Pure operations over a list of tasks. Every function returns a new array
 * instead of mutating its input, which keeps the CLI layer (read -> transform
 * -> write) simple and makes these trivially testable.
 */

const MAX_DESCRIPTION_LENGTH = 500;

export function nextId(tasks: readonly Task[]): number {
  // Max + 1 rather than length + 1, so ids stay unique after deletions.
  return tasks.reduce((max, task) => Math.max(max, task.id), 0) + 1;
}

export function addTask(
  tasks: readonly Task[],
  description: string,
  now: string,
): { tasks: Task[]; task: Task } {
  const task: Task = {
    id: nextId(tasks),
    description: normalizeDescription(description),
    status: 'todo',
    createdAt: now,
    updatedAt: now,
  };
  return { tasks: [...tasks, task], task };
}

export function updateTask(
  tasks: readonly Task[],
  id: number,
  description: string,
  now: string,
): { tasks: Task[]; task: Task } {
  const cleaned = normalizeDescription(description);
  return replace(tasks, id, (task) => ({ ...task, description: cleaned, updatedAt: now }));
}

export function setStatus(
  tasks: readonly Task[],
  id: number,
  status: TaskStatus,
  now: string,
): { tasks: Task[]; task: Task } {
  return replace(tasks, id, (task) =>
    // Don't bump updatedAt when the status is already what was asked for.
    task.status === status ? task : { ...task, status, updatedAt: now },
  );
}

export function deleteTask(
  tasks: readonly Task[],
  id: number,
): { tasks: Task[]; task: Task } {
  const task = findTask(tasks, id);
  return { tasks: tasks.filter((candidate) => candidate.id !== id), task };
}

/**
 * `all` lists everything, `not-done` covers todo + in-progress, and any status
 * value matches exactly.
 */
export type ListFilter = TaskStatus | 'all' | 'not-done';

export function selectTasks(tasks: readonly Task[], filter: ListFilter): Task[] {
  const matches = (task: Task): boolean => {
    if (filter === 'all') return true;
    if (filter === 'not-done') return task.status !== 'done';
    return task.status === filter;
  };
  return tasks.filter(matches).sort((a, b) => a.id - b.id);
}

export function findTask(tasks: readonly Task[], id: number): Task {
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) throw new UserError(`Nenhuma tarefa encontrada com ID ${id}.`);
  return task;
}

function replace(
  tasks: readonly Task[],
  id: number,
  transform: (task: Task) => Task,
): { tasks: Task[]; task: Task } {
  const updated = transform(findTask(tasks, id));
  return {
    tasks: tasks.map((task) => (task.id === id ? updated : task)),
    task: updated,
  };
}

function normalizeDescription(description: string): string {
  const trimmed = description.trim();
  if (trimmed === '') {
    throw new UserError('A descrição da tarefa não pode estar vazia.');
  }
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new UserError(
      `A descrição da tarefa não pode ter mais de ${MAX_DESCRIPTION_LENGTH} caracteres.`,
    );
  }
  return trimmed;
}
