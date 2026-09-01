import { UserError } from './errors.ts';
import { formatTaskSummary, formatTaskTable } from './format.ts';
import { loadTasks, resolveStorePath, saveTasks } from './storage.ts';
import {
  addTask,
  deleteTask,
  selectTasks,
  setStatus,
  updateTask,
  type ListFilter,
} from './tasks.ts';
import { TASK_STATUSES, isTaskStatus, type Task, type TaskStatus } from './types.ts';

export interface CliContext {
  /** Absolute path of the JSON store. */
  storePath: string;
  /** Returns the current time as an ISO 8601 string. Injected for tests. */
  now: () => string;
  write: (line: string) => void;
  writeError: (line: string) => void;
}

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;

export function createContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    storePath: resolveStorePath(),
    now: () => new Date().toISOString(),
    write: (line) => process.stdout.write(`${line}\n`),
    writeError: (line) => process.stderr.write(`${line}\n`),
    ...overrides,
  };
}

/**
 * Parses positional arguments, runs the requested command and returns the
 * process exit code. Expected problems are reported as one-line messages;
 * unexpected ones are re-thrown for the entry point to surface as bugs.
 */
export async function run(argv: readonly string[], context: CliContext): Promise<number> {
  try {
    await dispatch(argv, context);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof UserError) {
      context.writeError(`Error: ${error.message}`);
      context.writeError(`Run "task-cli help" to see the available commands.`);
      return EXIT_ERROR;
    }
    throw error;
  }
}

async function dispatch(argv: readonly string[], context: CliContext): Promise<void> {
  const [command, ...rest] = argv;

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    context.write(usage());
    return;
  }

  switch (command) {
    case 'add':
      return commandAdd(rest, context);
    case 'update':
      return commandUpdate(rest, context);
    case 'delete':
      return commandDelete(rest, context);
    case 'mark-todo':
      return commandMark(rest, 'todo', context);
    case 'mark-in-progress':
      return commandMark(rest, 'in-progress', context);
    case 'mark-done':
      return commandMark(rest, 'done', context);
    case 'list':
      return commandList(rest, context);
    default:
      throw new UserError(`Unknown command "${command}".`);
  }
}

async function commandAdd(args: readonly string[], context: CliContext): Promise<void> {
  const [description] = expectArgs(args, 1, 'add "<description>"');
  await mutate(context, (tasks) => addTask(tasks, description, context.now()), (task) =>
    `Task added successfully (ID: ${task.id})`,
  );
}

async function commandUpdate(args: readonly string[], context: CliContext): Promise<void> {
  const [rawId, description] = expectArgs(args, 2, 'update <id> "<description>"');
  const id = parseId(rawId);
  await mutate(context, (tasks) => updateTask(tasks, id, description, context.now()), (task) =>
    `Task updated successfully: ${formatTaskSummary(task)}`,
  );
}

async function commandDelete(args: readonly string[], context: CliContext): Promise<void> {
  const [rawId] = expectArgs(args, 1, 'delete <id>');
  const id = parseId(rawId);
  await mutate(context, (tasks) => deleteTask(tasks, id), (task) =>
    `Task deleted successfully (ID: ${task.id})`,
  );
}

async function commandMark(
  args: readonly string[],
  status: TaskStatus,
  context: CliContext,
): Promise<void> {
  const [rawId] = expectArgs(args, 1, `mark-${status} <id>`);
  const id = parseId(rawId);
  await mutate(context, (tasks) => setStatus(tasks, id, status, context.now()), (task) =>
    `Task marked as ${status} (ID: ${task.id})`,
  );
}

async function commandList(args: readonly string[], context: CliContext): Promise<void> {
  if (args.length > 1) {
    throw new UserError(`Too many arguments. Usage: task-cli list [${listFilterNames().join('|')}]`);
  }

  const filter = parseListFilter(args[0]);
  const tasks = selectTasks(await loadTasks(context.storePath), filter);

  if (tasks.length === 0) {
    context.write(filter === 'all' ? 'No tasks yet.' : `No tasks with status "${filter}".`);
    return;
  }

  context.write(formatTaskTable(tasks));
  context.write('');
  context.write(`${tasks.length} task${tasks.length === 1 ? '' : 's'}.`);
}

/** Read the store, apply one change, write it back and report the outcome. */
async function mutate(
  context: CliContext,
  change: (tasks: readonly Task[]) => { tasks: Task[]; task: Task },
  message: (task: Task) => string,
): Promise<void> {
  const result = change(await loadTasks(context.storePath));
  await saveTasks(context.storePath, result.tasks);
  context.write(message(result.task));
}

/**
 * Enforces an exact argument count and hands back a fixed-size tuple, so each
 * command can destructure its arguments without undefined checks.
 */
function expectArgs(args: readonly string[], count: 1, example: string): [string];
function expectArgs(args: readonly string[], count: 2, example: string): [string, string];
function expectArgs(args: readonly string[], count: number, example: string): string[] {
  if (args.length < count) {
    throw new UserError(`Missing arguments. Usage: task-cli ${example}`);
  }
  if (args.length > count) {
    throw new UserError(
      `Too many arguments. Usage: task-cli ${example} ` +
        `(quote descriptions that contain spaces)`,
    );
  }
  return [...args];
}

function parseId(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) {
    throw new UserError(`Invalid task ID "${raw ?? ''}". IDs are positive whole numbers.`);
  }
  const id = Number(raw.trim());
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new UserError(`Invalid task ID "${raw}". IDs are positive whole numbers.`);
  }
  return id;
}

function parseListFilter(raw: string | undefined): ListFilter {
  if (raw === undefined) return 'all';
  const value = raw.trim();
  if (value === 'all' || value === 'not-done' || isTaskStatus(value)) return value;
  throw new UserError(
    `Unknown status "${raw}". Expected one of: ${listFilterNames().join(', ')}.`,
  );
}

function listFilterNames(): string[] {
  return [...TASK_STATUSES, 'not-done', 'all'];
}

function usage(): string {
  return [
    'task-cli - track what you need to do, what you are doing, and what is done.',
    '',
    'Usage:',
    '  task-cli add "<description>"          Add a new task (starts as todo)',
    '  task-cli update <id> "<description>"  Change a task description',
    '  task-cli delete <id>                  Remove a task',
    '  task-cli mark-in-progress <id>        Mark a task as in progress',
    '  task-cli mark-done <id>               Mark a task as done',
    '  task-cli mark-todo <id>               Move a task back to todo',
    '  task-cli list [status]                List tasks, optionally by status',
    '  task-cli help                         Show this message',
    '',
    `Statuses: ${TASK_STATUSES.join(', ')}`,
    'List filters: todo, in-progress, done, not-done (todo + in-progress), all',
    '',
    'Tasks are stored as JSON in tasks.json in the current directory.',
    'Set TASK_TRACKER_FILE to use a different path.',
  ].join('\n');
}
