#!/usr/bin/env node
import { createContext, EXIT_ERROR, run } from './cli.ts';

const context = createContext();

try {
  process.exitCode = await run(process.argv.slice(2), context);
} catch (error) {
  // Anything reaching here is a bug rather than bad user input.
  context.writeError('Erro inesperado. Isso é um bug no task-cli.');
  context.writeError(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = EXIT_ERROR;
}
