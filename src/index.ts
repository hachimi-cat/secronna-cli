import { Command } from 'commander';
import { auth } from './commands/auth.js';
import { project } from './commands/project.js';
import { env } from './commands/env.js';
import { secret } from './commands/secret.js';
import { get } from './commands/get.js';
import { run } from './commands/run.js';
import { exportCmd } from './commands/export.js';
import { audit } from './commands/audit.js';
import { buildApiCommand } from './commands/api.generated.js';

const brand = process.env.SECRONNA ?? 'secronna';

const program = new Command()
  .name(brand)
  .description(`CLI for ${brand} — part of the Forjio commerce suite.`)
  .version('0.3.0');

program.addCommand(auth);
program.addCommand(project);
program.addCommand(env);
program.addCommand(secret);
program.addCommand(get);
program.addCommand(run);
program.addCommand(exportCmd);
program.addCommand(audit);
// Every route of the API, one command each (generated from the API spec: scripts/apigen.sh)
program.addCommand(buildApiCommand());

program.parseAsync(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
