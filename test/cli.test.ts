import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { EXIT_ERROR, EXIT_OK, run, type CliContext } from '../src/cli.ts';
import { loadTasks } from '../src/storage.ts';
import type { Task } from '../src/types.ts';

interface Harness {
  storePath: string;
  exec: (...argv: string[]) => Promise<{ code: number; out: string; err: string }>;
  read: () => Promise<Task[]>;
}

async function harness(): Promise<Harness> {
  const dir = await mkdtemp(path.join(tmpdir(), 'task-tracker-'));
  const storePath = path.join(dir, 'tasks.json');
  let clock = Date.parse('2026-09-01T10:00:00.000Z');

  const exec = async (...argv: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const context: CliContext = {
      storePath,
      // Advance one minute per command so updatedAt changes are observable.
      now: () => new Date((clock += 60_000)).toISOString(),
      write: (line) => void out.push(line),
      writeError: (line) => void err.push(line),
    };
    const code = await run(argv, context);
    return { code, out: out.join('\n'), err: err.join('\n') };
  };

  return { storePath, exec, read: () => loadTasks(storePath) };
}

test('add creates tasks.json and reports the new id', async () => {
  const { exec, read } = await harness();

  const first = await exec('add', 'Buy groceries');
  assert.equal(first.code, EXIT_OK);
  assert.equal(first.out, 'Task added successfully (ID: 1)');

  const second = await exec('add', 'Cook dinner');
  assert.equal(second.out, 'Task added successfully (ID: 2)');

  const tasks = await read();
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]?.description, 'Buy groceries');
  assert.equal(tasks[0]?.status, 'todo');
});

test('the JSON store is human readable and holds every documented property', async () => {
  const { exec, storePath } = await harness();
  await exec('add', 'Buy groceries');

  const raw = await readFile(storePath, 'utf8');
  assert.match(raw, /^\[\n {2}\{\n/, 'expected pretty-printed JSON');
  assert.deepEqual(Object.keys(JSON.parse(raw)[0]), [
    'id',
    'description',
    'status',
    'createdAt',
    'updatedAt',
  ]);
});

test('update, mark-* and delete work end to end', async () => {
  const { exec, read } = await harness();
  await exec('add', 'Buy groceries');

  const updated = await exec('update', '1', 'Buy groceries and cook dinner');
  assert.equal(updated.code, EXIT_OK);
  assert.match(updated.out, /Task updated successfully/);

  await exec('mark-in-progress', '1');
  assert.equal((await read())[0]?.status, 'in-progress');

  await exec('mark-done', '1');
  assert.equal((await read())[0]?.status, 'done');

  await exec('mark-todo', '1');
  assert.equal((await read())[0]?.status, 'todo');

  const [task] = await read();
  assert.equal(task?.description, 'Buy groceries and cook dinner');
  assert.notEqual(task?.updatedAt, task?.createdAt);

  const deleted = await exec('delete', '1');
  assert.equal(deleted.out, 'Task deleted successfully (ID: 1)');
  assert.deepEqual(await read(), []);
});

test('list shows all tasks and filters by status', async () => {
  const { exec } = await harness();
  await exec('add', 'todo task');
  await exec('add', 'active task');
  await exec('add', 'finished task');
  await exec('mark-in-progress', '2');
  await exec('mark-done', '3');

  const all = await exec('list');
  assert.match(all.out, /ID {2}STATUS/);
  assert.match(all.out, /3 tasks\./);

  const done = await exec('list', 'done');
  assert.match(done.out, /finished task/);
  assert.doesNotMatch(done.out, /todo task/);

  const todo = await exec('list', 'todo');
  assert.match(todo.out, /todo task/);
  assert.doesNotMatch(todo.out, /active task/);

  const inProgress = await exec('list', 'in-progress');
  assert.match(inProgress.out, /active task/);

  const notDone = await exec('list', 'not-done');
  assert.match(notDone.out, /2 tasks\./);
  assert.doesNotMatch(notDone.out, /finished task/);
});

test('list on an empty or unmatched store explains itself instead of printing nothing', async () => {
  const { exec } = await harness();
  assert.equal((await exec('list')).out, 'No tasks yet.');

  await exec('add', 'only task');
  assert.equal((await exec('list', 'done')).out, 'No tasks with status "done".');
});

test('bare invocation and help print usage', async () => {
  const { exec } = await harness();
  for (const argv of [[], ['help'], ['--help'], ['-h']]) {
    const result = await exec(...argv);
    assert.equal(result.code, EXIT_OK);
    assert.match(result.out, /Usage:/);
  }
});

test('user mistakes exit non-zero with an actionable message', async () => {
  const { exec } = await harness();
  await exec('add', 'only task');

  const cases: Array<{ argv: string[]; expect: RegExp }> = [
    { argv: ['frobnicate'], expect: /Unknown command "frobnicate"/ },
    { argv: ['add'], expect: /Missing arguments/ },
    { argv: ['add', ''], expect: /description cannot be empty/ },
    { argv: ['add', 'a', 'b'], expect: /Too many arguments/ },
    { argv: ['update', '1'], expect: /Missing arguments/ },
    { argv: ['update', 'abc', 'x'], expect: /Invalid task ID "abc"/ },
    { argv: ['update', '99', 'x'], expect: /No task found with ID 99/ },
    { argv: ['delete', '-1'], expect: /Invalid task ID "-1"/ },
    { argv: ['delete', '99'], expect: /No task found with ID 99/ },
    { argv: ['mark-done', '99'], expect: /No task found with ID 99/ },
    { argv: ['list', 'nope'], expect: /Unknown status "nope"/ },
    { argv: ['list', 'todo', 'done'], expect: /Too many arguments/ },
  ];

  for (const { argv, expect } of cases) {
    const result = await exec(...argv);
    assert.equal(result.code, EXIT_ERROR, `expected failure for: ${argv.join(' ')}`);
    assert.match(result.err, expect);
    assert.equal(result.out, '', 'failures should not print to stdout');
  }
});

test('a failed command leaves the store untouched', async () => {
  const { exec, read } = await harness();
  await exec('add', 'only task');
  const before = await read();

  await exec('delete', '99');
  assert.deepEqual(await read(), before);
});

test('a corrupt store produces a clear error rather than a crash', async () => {
  const { exec, storePath } = await harness();
  await writeFile(storePath, '{ not json', 'utf8');

  const result = await exec('list');
  assert.equal(result.code, EXIT_ERROR);
  assert.match(result.err, /does not contain valid JSON/);
});

test('a store with a malformed task names the offending entry', async () => {
  const { exec, storePath } = await harness();
  await writeFile(storePath, JSON.stringify([{ id: 1, description: 'x', status: 'maybe' }]), 'utf8');

  const result = await exec('list');
  assert.equal(result.code, EXIT_ERROR);
  assert.match(result.err, /entry 1.*"status" must be todo, in-progress, or done/s);
});

test('an empty file is treated as an empty task list', async () => {
  const { exec, storePath } = await harness();
  await writeFile(storePath, '   \n', 'utf8');

  const result = await exec('add', 'first');
  assert.equal(result.code, EXIT_OK);
  assert.equal(result.out, 'Task added successfully (ID: 1)');
});
