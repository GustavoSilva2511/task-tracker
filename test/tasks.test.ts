import assert from 'node:assert/strict';
import { test } from 'node:test';

import { UserError } from '../src/errors.ts';
import { addTask, deleteTask, nextId, selectTasks, setStatus, updateTask } from '../src/tasks.ts';
import type { Task } from '../src/types.ts';

const T0 = '2026-09-01T10:00:00.000Z';
const T1 = '2026-09-01T11:00:00.000Z';

function seed(): Task[] {
  return [
    { id: 1, description: 'a', status: 'todo', createdAt: T0, updatedAt: T0 },
    { id: 2, description: 'b', status: 'in-progress', createdAt: T0, updatedAt: T0 },
    { id: 3, description: 'c', status: 'done', createdAt: T0, updatedAt: T0 },
  ];
}

test('nextId starts at 1 and skips reused ids after deletions', () => {
  assert.equal(nextId([]), 1);
  assert.equal(nextId(seed()), 4);
  const { tasks } = deleteTask(seed(), 3);
  assert.equal(nextId(tasks), 3, 'ids are max + 1, not length + 1');
});

test('addTask creates a todo task with matching timestamps', () => {
  const { tasks, task } = addTask([], '  Buy groceries  ', T0);
  assert.equal(tasks.length, 1);
  assert.deepEqual(task, {
    id: 1,
    description: 'Buy groceries',
    status: 'todo',
    createdAt: T0,
    updatedAt: T0,
  });
});

test('addTask rejects blank and over-long descriptions', () => {
  assert.throws(() => addTask([], '   ', T0), UserError);
  assert.throws(() => addTask([], 'x'.repeat(501), T0), UserError);
});

test('addTask does not mutate the input list', () => {
  const tasks = seed();
  addTask(tasks, 'd', T0);
  assert.equal(tasks.length, 3);
});

test('updateTask changes the description and bumps updatedAt only', () => {
  const { task } = updateTask(seed(), 1, 'a2', T1);
  assert.equal(task.description, 'a2');
  assert.equal(task.createdAt, T0);
  assert.equal(task.updatedAt, T1);
});

test('setStatus moves a task between statuses', () => {
  const { task } = setStatus(seed(), 1, 'done', T1);
  assert.equal(task.status, 'done');
  assert.equal(task.updatedAt, T1);
});

test('setStatus is a no-op when the status already matches', () => {
  const { task } = setStatus(seed(), 3, 'done', T1);
  assert.equal(task.updatedAt, T0, 'updatedAt should not change');
});

test('deleteTask removes only the requested task', () => {
  const { tasks, task } = deleteTask(seed(), 2);
  assert.equal(task.id, 2);
  assert.deepEqual(
    tasks.map((entry) => entry.id),
    [1, 3],
  );
});

test('operations on a missing id report a clear error', () => {
  for (const act of [
    () => updateTask(seed(), 99, 'x', T1),
    () => deleteTask(seed(), 99),
    () => setStatus(seed(), 99, 'done', T1),
  ]) {
    assert.throws(act, (error: unknown) => {
      assert.ok(error instanceof UserError);
      assert.match(error.message, /No task found with ID 99/);
      return true;
    });
  }
});

test('selectTasks filters by status', () => {
  const tasks = seed();
  const ids = (filter: Parameters<typeof selectTasks>[1]): number[] =>
    selectTasks(tasks, filter).map((task) => task.id);

  assert.deepEqual(ids('all'), [1, 2, 3]);
  assert.deepEqual(ids('todo'), [1]);
  assert.deepEqual(ids('in-progress'), [2]);
  assert.deepEqual(ids('done'), [3]);
  assert.deepEqual(ids('not-done'), [1, 2]);
});

test('selectTasks sorts by id', () => {
  const shuffled = [...seed()].reverse();
  assert.deepEqual(
    selectTasks(shuffled, 'all').map((task) => task.id),
    [1, 2, 3],
  );
});
