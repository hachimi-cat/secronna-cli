import { Command } from 'commander';
import { revealByPath } from '../lib/api.js';
import { fail } from '../lib/output.js';

/**
 * Validate a Vault-style `project/env/KEY` path. Returns the trimmed path
 * when well-formed (exactly three non-empty slash-parts); throws otherwise.
 * Pure — the testable seam.
 */
export function assertSecretPath(path: string): string {
  const parts = path.split('/');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new Error(
      `Invalid path '${path}'. Expected exactly 'project/env/KEY' (three slash-separated parts).`,
    );
  }
  return path;
}

export const get = new Command('get')
  .description('Reveal a single secret by its project/env/KEY path (audited)')
  .argument('<path>', 'secret path, e.g. project/env/KEY')
  .option('--version <n>', 'reveal a specific version', (v) => parseInt(v, 10))
  .action(async (path: string, opts: { version?: number }) => {
    let validated: string;
    try {
      validated = assertSecretPath(path);
    } catch (e) {
      return fail(e);
    }
    try {
      const out = await revealByPath(validated, opts.version);
      // Explicit purpose is to output the value — print value only, to
      // stdout, with nothing else so it stays pipeable.
      console.log(out.value);
    } catch (e) {
      fail(e);
    }
  });
