import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'node:child_process';
import { collectEnvSecrets, resolveEnvId } from '../lib/api.js';
import { fail } from '../lib/output.js';

/**
 * Merge the fetched secrets over the current process env. Secrets take
 * precedence so a rotated value always wins over a stale inherited one.
 */
export function mergeEnv(
  base: NodeJS.ProcessEnv,
  secrets: Record<string, string>,
): NodeJS.ProcessEnv {
  return { ...base, ...secrets };
}

export const run = new Command('run')
  .description('Run a command with the environment’s secrets injected as env vars')
  .requiredOption('--env <envRef>', 'env id (env_…) or project/env slug path')
  .argument('<command...>', 'command to run (after `--`)')
  .action(async (command: string[], opts: { env: string }) => {
    if (command.length === 0) {
      console.error(chalk.red('No command given. Usage: secronna run --env <envRef> -- <command...>'));
      process.exit(1);
    }
    let secrets: Record<string, string>;
    try {
      const envId = await resolveEnvId(opts.env);
      secrets = await collectEnvSecrets(envId);
    } catch (e) {
      return fail(e);
    }

    const [cmd, ...args] = command;
    const child = spawn(cmd!, args, {
      stdio: 'inherit',
      env: mergeEnv(process.env, secrets),
    });
    child.on('error', (err) => {
      console.error(chalk.red(`Failed to start command: ${err.message}`));
      process.exit(1);
    });
    child.on('exit', (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 0);
    });
  });
