import { Command } from 'commander';
import chalk from 'chalk';
import { createEnvironment, listEnvironments } from '../lib/api.js';
import { fail } from '../lib/output.js';

export const env = new Command('env').description('Manage environments within a project');

env
  .command('create')
  .description('Create an environment in a project')
  .argument('<projectId>', 'project id')
  .argument('<name>', 'environment name (e.g. production)')
  .action(async (projectId: string, name: string) => {
    try {
      const e = await createEnvironment(projectId, name);
      console.log(chalk.green(`Created environment ${chalk.bold(e.name)}`));
      console.log(`  id:   ${e.id}`);
      console.log(`  slug: ${e.slug}`);
    } catch (err) {
      fail(err);
    }
  });

env
  .command('ls')
  .description('List environments in a project')
  .argument('<projectId>', 'project id')
  .action(async (projectId: string) => {
    try {
      const envs = await listEnvironments(projectId);
      if (envs.length === 0) {
        console.log(chalk.dim('No environments yet.'));
        return;
      }
      for (const e of envs) {
        console.log(`${chalk.bold(e.id)}  ${e.name} ${chalk.dim(`(${e.slug})`)}`);
      }
    } catch (err) {
      fail(err);
    }
  });
