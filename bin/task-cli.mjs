#!/usr/bin/env node
// Thin launcher so `task-cli` works after `npm link` / `npm install -g`.
// Node (>= 22.6) strips the TypeScript types at load time, so there is no build step.
import '../src/index.ts';
