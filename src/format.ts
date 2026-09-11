import type { Task } from './types.ts';

const HEADERS = ['ID', 'STATUS', 'CRIADO', 'ATUALIZADO', 'DESCRIÇÃO'] as const;

// Mapeamento de status para português
const statusLabels: Record<string, string> = {
  todo: 'pendente',
  'in-progress': 'andamento',
  done: 'concluído',
};

/**
 * Renders tasks as a fixed-width table. Column widths are computed from the
 * content so short lists stay compact.
 */
export function formatTaskTable(tasks: readonly Task[]): string {
  const rows = tasks.map((task) => [
    String(task.id),
    statusLabels[task.status] || task.status,
    formatTimestamp(task.createdAt),
    formatTimestamp(task.updatedAt),
    task.description,
  ]);

  const widths = HEADERS.map((header, column) =>
    rows.reduce((max, row) => Math.max(max, row[column]?.length ?? 0), header.length),
  );

  const renderRow = (cells: readonly string[]): string =>
    cells
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join('  ')
      .trimEnd();

  const separator = widths.map((width) => '-'.repeat(width)).join('  ');

  return [renderRow(HEADERS), separator, ...rows.map(renderRow)].join('\n');
}

/** One-line summary used in confirmation messages. */
export function formatTaskSummary(task: Task): string {
  return `[${task.id}] ${task.description} (${statusLabels[task.status] || task.status})`;
}

/**
 * Turns an ISO timestamp into a compact local `YYYY-MM-DD HH:mm`. Unparseable
 * values are passed through untouched rather than shown as "Invalid Date".
 */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const pad = (value: number): string => String(value).padStart(2, '0');
  const parts = [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ];
  return parts.join('');
}
