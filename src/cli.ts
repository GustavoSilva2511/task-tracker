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

// Mapeamento de status para exibição em português
const statusLabels: Record<TaskStatus, string> = {
  todo: 'pendente',
  'in-progress': 'andamento',
  done: 'concluído',
};

// Mapeamento de filtros para exibição em português
const filterLabels: Record<ListFilter, string> = {
  all: 'todos',
  'not-done': 'não-concluído',
  todo: 'pendente',
  'in-progress': 'andamento',
  done: 'concluído',
};

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
      context.writeError(`Erro: ${error.message}`);
      context.writeError(`Execute "task-cli ajuda" para ver os comandos disponíveis.`);
      return EXIT_ERROR;
    }
    throw error;
  }
}

async function dispatch(argv: readonly string[], context: CliContext): Promise<void> {
  const [command, ...rest] = argv;

  if (command === undefined || command === 'ajuda' || command === '--help' || command === '-h') {
    context.write(usage());
    return;
  }

  switch (command) {
    case 'adicionar':
      return commandAdd(rest, context);
    case 'atualizar':
      return commandUpdate(rest, context);
    case 'excluir':
      return commandDelete(rest, context);
    case 'marcar-pendente':
      return commandMark(rest, 'todo', context);
    case 'marcar-andamento':
      return commandMark(rest, 'in-progress', context);
    case 'marcar-concluído':
      return commandMark(rest, 'done', context);
    case 'listar':
      return commandList(rest, context);
    default:
      throw new UserError(`Comando desconhecido "${command}".`);
  }
}

async function commandAdd(args: readonly string[], context: CliContext): Promise<void> {
  const [description] = expectArgs(args, 1, 'adicionar "<descrição>"');
  await mutate(context, (tasks) => addTask(tasks, description, context.now()), (task) =>
    `Tarefa adicionada com sucesso (ID: ${task.id})`,
  );
}

async function commandUpdate(args: readonly string[], context: CliContext): Promise<void> {
  const [rawId, description] = expectArgs(args, 2, 'atualizar <id> "<descrição>"');
  const id = parseId(rawId);
  await mutate(context, (tasks) => updateTask(tasks, id, description, context.now()), (task) =>
    `Tarefa atualizada com sucesso: ${formatTaskSummary(task)}`,
  );
}

async function commandDelete(args: readonly string[], context: CliContext): Promise<void> {
  const [rawId] = expectArgs(args, 1, 'excluir <id>');
  const id = parseId(rawId);
  await mutate(context, (tasks) => deleteTask(tasks, id), (task) =>
    `Tarefa excluída com sucesso (ID: ${task.id})`,
  );
}

async function commandMark(
  args: readonly string[],
  status: TaskStatus,
  context: CliContext,
): Promise<void> {
  const [rawId] = expectArgs(args, 1, `marcar-${status} <id>`);
  const id = parseId(rawId);
  await mutate(context, (tasks) => setStatus(tasks, id, status, context.now()), (task) =>
    `Tarefa marcada como ${statusLabels[status]} (ID: ${task.id})`,
  );
}

async function commandList(args: readonly string[], context: CliContext): Promise<void> {
  if (args.length > 1) {
    throw new UserError(`Muitos argumentos. Uso: task-cli listar [${listFilterNames().join('|')}]`);
  }

  const filter = parseListFilter(args[0]);
  const tasks = selectTasks(await loadTasks(context.storePath), filter);

  if (tasks.length === 0) {
    context.write(filter === 'all' ? 'Nenhuma tarefa ainda.' : `Nenhuma tarefa com status "${filterLabels[filter]}".`);
    return;
  }

  context.write(formatTaskTable(tasks));
  context.write('');
  context.write(`${tasks.length} tarefa${tasks.length === 1 ? '' : 's'}.`);
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
    throw new UserError(`Argumentos faltando. Uso: task-cli ${example}`);
  }
  if (args.length > count) {
    throw new UserError(
      `Muitos argumentos. Uso: task-cli ${example} ` +
        `(cite descrições com espaços entre aspas)`,
    );
  }
  return [...args];
}

function parseId(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) {
    throw new UserError(`ID de tarefa inválido "${raw ?? ''}". IDs são números inteiros positivos.`);
  }
  const id = Number(raw.trim());
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new UserError(`ID de tarefa inválido "${raw}". IDs são números inteiros positivos.`);
  }
  return id;
}

function parseListFilter(raw: string | undefined): ListFilter {
  if (raw === undefined) return 'all';
  const value = raw.trim();
  // Aceita tanto os nomes em português quanto os originais em inglês para compatibilidade
  if (value === 'todos' || value === 'all') return 'all';
  if (value === 'nao-concluido' || value === 'not-done') return 'not-done';
  if (value === 'pendente' || value === 'todo') return 'todo';
  if (value === 'andamento' || value === 'in-progress') return 'in-progress';
  if (value === 'concluido' || value === 'done') return 'done';
  throw new UserError(
    `Status desconhecido "${raw}". Esperado um dos: ${listFilterNames().join(', ')}.`,
  );
}

function listFilterNames(): string[] {
  return ['pendente', 'andamento', 'concluído', 'não-concluído', 'todos'];
}

function usage(): string {
  return [
    'task-cli - registre o que você precisa fazer, o que está fazendo e o que concluiu.',
    '',
    'Uso:',
    '  task-cli adicionar "<descrição>"          Adiciona uma nova tarefa (começa como pendente)',
    '  task-cli atualizar <id> "<descrição>"  Altera a descrição de uma tarefa',
    '  task-cli excluir <id>                  Remove uma tarefa',
    '  task-cli marcar-andamento <id>        Marca uma tarefa como em andamento',
    '  task-cli marcar-concluído <id>         Marca uma tarefa como concluída',
    '  task-cli marcar-pendente <id>         Volta uma tarefa para pendente',
    '  task-cli listar [status]                Lista tarefas, opcionalmente por status',
    '  task-cli ajuda                          Mostra esta mensagem',
    '',
    `Status: ${TASK_STATUSES.join(', ')}`,
    'Filtros de lista: pendente, andamento, concluído, não-concluído (pendente + andamento), todos',
    '',
    'As tarefas são armazenadas em JSON em tasks.json no diretório atual.',
    'Defina TASK_TRACKER_FILE para usar um caminho diferente.',
  ].join('\n');
}
