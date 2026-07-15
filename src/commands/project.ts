import { Command } from 'commander';
import chalk from 'chalk';
import { createProject, listProjects } from '../lib/api.js';
import { fail } from '../lib/output.js';

export const project = new Command('project').description('Manage projects');

project
  .command('create')
  .description('Create a new project')
  .argument('<name>', 'human-readable project name')
  .action(async (name: string) => {
    try {
      const p = await createProject(name);
      console.log(chalk.green(`Created project ${chalk.bold(p.name)}`));
      console.log(`  id:   ${p.id}`);
      console.log(`  slug: ${p.slug}`);
    } catch (e) {
      fail(e);
    }
  });

project
  .command('ls')
  .description('List projects')
  .action(async () => {
    try {
      const projects = await listProjects();
      if (projects.length === 0) {
        console.log(chalk.dim('No projects yet.'));
        return;
      }
      for (const p of projects) {
        console.log(`${chalk.bold(p.id)}  ${p.name} ${chalk.dim(`(${p.slug})`)}`);
      }
    } catch (e) {
      fail(e);
    }
  });
