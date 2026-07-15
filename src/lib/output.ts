import chalk from 'chalk';
import { ApiError } from './api.js';

/** Print a command error to stderr and exit non-zero. */
export function fail(e: unknown): never {
  if (e instanceof ApiError) {
    console.error(chalk.red(`Error [${e.code}]: ${e.message}`));
  } else if (e instanceof Error) {
    console.error(chalk.red(`Error: ${e.message}`));
  } else {
    console.error(chalk.red(`Error: ${String(e)}`));
  }
  process.exit(1);
}
