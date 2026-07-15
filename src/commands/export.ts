import { Command } from 'commander';
import chalk from 'chalk';
import { collectEnvSecrets, resolveEnvId } from '../lib/api.js';
import { fail } from '../lib/output.js';

export type ExportFormat = 'dotenv' | 'json' | 'shell';

/** Render a secret map in the requested format. Pure — the testable seam. */
export function formatSecrets(secrets: Record<string, string>, format: ExportFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(secrets, null, 2);
    case 'shell':
      return Object.entries(secrets)
        .map(([k, v]) => `export ${k}='${v.replace(/'/g, `'\\''`)}'`)
        .join('\n');
    case 'dotenv':
    default:
      return Object.entries(secrets)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
  }
}

export const exportCmd = new Command('export')
  .description('Print all secrets in an environment (PLAINTEXT)')
  .requiredOption('--env <envRef>', 'env id (env_…) or project/env slug path')
  .option('--format <format>', 'dotenv | json | shell', 'dotenv')
  .action(async (opts: { env: string; format: string }) => {
    const format = opts.format as ExportFormat;
    if (!['dotenv', 'json', 'shell'].includes(format)) {
      console.error(chalk.red(`Unknown format '${opts.format}'. Use dotenv | json | shell.`));
      process.exit(1);
    }
    try {
      const envId = await resolveEnvId(opts.env);
      const secrets = await collectEnvSecrets(envId);
      // Warn on stderr — the output on stdout is plaintext secrets.
      console.error(chalk.yellow('⚠  This prints secret values in plaintext.'));
      console.log(formatSecrets(secrets, format));
    } catch (e) {
      fail(e);
    }
  });
