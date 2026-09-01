Task tracker is a project used to track and manage your tasks. In this task, you will build a simple command line interface (CLI) to track what you need to do, what you have done, and what you are currently working on. This project will help you practice your programming skills, including working with the filesystem, handling user

Requirements
The application should run from the command line, accept user actions and inputs as arguments, and store the tasks in a JSON file. The user should be able to:

Add, Update, and Delete tasks

Mark a task as in progress or done

List all tasks

List all tasks that are done

List all tasks that are not done

List all tasks that are in progress

Here are some constraints to guide the implementation:

You can use any programming language to build this project.

Use positional arguments in command line to accept user inputs.

Use a JSON file to store the tasks in the current directory.

The JSON file should be created if it does not exist.

Use the native file system module of your programming language to interact with the JSON file.

Do not use any external libraries or frameworks to build this project.

Ensure to handle errors and edge cases gracefully.

Example
The list of commands and their usage is given below:

bash

# Adding a new task
task-cli add "Buy groceries"
# Output: Task added successfully (ID: 1)
# Updating and deleting tasks
task-cli update 1 "Buy groceries and cook dinner"
task-cli delete 1
# Marking a task as in progress or done
task-cli mark-in-progress 1
task-cli mark-done 1
# Listing all tasks
task-cli list
# Listing tasks by status
task-cli list done
task-cli list todo
task-cli list in-progress
Task Properties
Each task should have the following properties:

id: A unique identifier for the task

description: A short description of the task

status: The status of the task (todo, in-progress, done)

createdAt: The date and time when the task was created

updatedAt: The date and time when the task was last updated

Make sure to add these properties to the JSON file when adding a new task and update them when updating a task.

---

## Implementation

Written in TypeScript with **zero runtime dependencies**. Node 22.6+ strips the
types at load time, so `src/*.ts` runs directly — there is no build step and no
bundler. Only Node's own modules are used: `node:fs/promises`, `node:path`,
`node:crypto`, and `node:test` for the tests. TypeScript itself is a dev-only
dependency used for type checking.

### Requirements

- Node.js >= 22.6 (tested on 24.16)
- pnpm >= 10 (tested on 11.5.3) — `corepack enable pnpm` picks up the pinned
  version from `packageManager` in `package.json`

### Install

```bash
pnpm install            # dev dependencies only: typescript + @types/node
pnpm link --global      # optional: puts `task-cli` on your PATH
```

Without `pnpm link --global`, invoke it directly:

```bash
node /path/to/task-tracker/bin/task-cli.mjs list
```

### Usage

```bash
task-cli add "Buy groceries"                    # Task added successfully (ID: 1)
task-cli update 1 "Buy groceries and cook dinner"
task-cli delete 1
task-cli mark-in-progress 1
task-cli mark-done 1
task-cli mark-todo 1                            # move a task back to todo
task-cli list                                   # all tasks
task-cli list todo
task-cli list in-progress
task-cli list done
task-cli list not-done                          # todo + in-progress
task-cli help
```

`list` prints an aligned table:

```
ID  STATUS       CREATED           UPDATED           DESCRIPTION
--  -----------  ----------------  ----------------  -----------------------------
1   in-progress  2026-09-01 19:55  2026-09-01 19:55  Buy groceries and cook dinner
2   done         2026-09-01 19:55  2026-09-01 19:55  Write the report

2 tasks.
```

Commands exit `0` on success and `1` on any error, with the message on stderr —
so the CLI composes cleanly in scripts.

### Storage

Tasks live in `tasks.json` in the current working directory, created on the first
write and stored as pretty-printed JSON. Set `TASK_TRACKER_FILE` to point at a
different path.

Writes go to a temporary file in the same directory and are then renamed, so an
interrupted run can never leave a half-written store behind.

### Project layout

| File | Responsibility |
| --- | --- |
| `src/types.ts` | `Task` / `TaskStatus` and their runtime guards |
| `src/storage.ts` | Reading, validating and atomically writing `tasks.json` |
| `src/tasks.ts` | Pure, immutable task operations (add/update/delete/status/filter) |
| `src/format.ts` | Table and summary rendering |
| `src/cli.ts` | Positional argument parsing and command dispatch |
| `src/index.ts` | Entry point and exit codes |
| `bin/task-cli.mjs` | Launcher for `pnpm link` / global installs |

### Edge cases handled

- Missing, empty or corrupt `tasks.json` — clear message, never a stack trace
- Malformed task entries — the error names the offending entry and field
- Unknown commands, wrong argument counts, non-numeric or unknown IDs
- Blank or over-long (>500 char) descriptions
- IDs are `max + 1`, so they stay unique after deletions
- A failed command leaves the store byte-for-byte unchanged
- `updatedAt` is not bumped when a `mark-*` is a no-op

### Development

```bash
pnpm test         # 22 tests via node:test
pnpm typecheck
```

