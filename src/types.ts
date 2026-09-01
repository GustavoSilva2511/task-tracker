/**
 * Core domain types for the task tracker.
 */

export const TASK_STATUSES = ['todo', 'in-progress', 'done'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  /** Unique, monotonically increasing identifier. */
  id: number;
  /** Short description of what needs to be done. */
  description: string;
  status: TaskStatus;
  /** ISO 8601 timestamp of when the task was created. */
  createdAt: string;
  /** ISO 8601 timestamp of the last modification. */
  updatedAt: string;
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value);
}
