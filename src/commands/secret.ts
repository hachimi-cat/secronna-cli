import { Command } from 'commander';
import chalk from 'chalk';
import { putSecret, listSecrets, revealSecret, deleteSecret } from '../lib/api.js';
import { fail } from '../lib/output.js';

export const secret = new Command('secret').description('Manage secrets within an environment');

secret
  .command('set')
  .description('Create or rotate a secret (writes a new version)')
  .argument('<envId>', 'environment id')
  .argument('<KEY>', 'secret key (env-var name)')
  .argument('<value>', 'secret value')
  .action(async (envId: string, key: string, value: string) => {
    try {
      const out = await putSecret(envId, key, value);
      // NEVER echo the value back.
      console.log(chalk.green(`Set ${chalk.bold(out.key)} → version ${out.version}`));
      console.log(`  id: ${out.id}`);
    } catch (e) {
      fail(e);
    }
  });

secret
  .command('ls')
  .description('List secret keys in an environment (never values)')
  .argument('<envId>', 'environment id')
  .action(async (envId: string) => {
    try {
      const rows = await listSecrets(envId);
      if (rows.length === 0) {
        console.log(chalk.dim('No secrets yet.'));
        return;
      }
      for (const r of rows) {
        console.log(`${chalk.bold(r.key)}  ${chalk.dim(`v${r.currentVersion}`)}  ${r.id}`);
      }
    } catch (e) {
      fail(e);
    }
  });

secret
  .command('reveal')
  .description('Reveal a secret value (audited)')
  .argument('<secretId>', 'secret id')
  .option('--version <n>', 'reveal a specific version', (v) => parseInt(v, 10))
  .action(async (secretId: string, opts: { version?: number }) => {
    try {
      const out = await revealSecret(secretId, opts.version);
      // Explicit purpose is to output the value — print value only, to stdout.
      console.log(out.value);
    } catch (e) {
      fail(e);
    }
  });

secret
  .command('rm')
  .description('Delete a secret')
  .argument('<secretId>', 'secret id')
  .action(async (secretId: string) => {
    try {
      const out = await deleteSecret(secretId);
      if (out.deleted) {
        console.log(chalk.green(`Deleted ${out.id}`));
      } else {
        console.log(chalk.yellow(`Not deleted: ${out.id}`));
      }
    } catch (e) {
      fail(e);
    }
  });
