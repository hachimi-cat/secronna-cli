/**
 * How the generated `secronna api <area> <action>` commands (commands/api.generated.ts)
 * make their call: this CLI's own client (lib/api.ts — its session bearer, base URL and
 * envelope), its own error output (lib/output.ts).
 */
import type { Command } from 'commander';
import { request } from './api.js';
import { fail } from './output.js';

export async function callRoute(
  _cmd: Command,
  method: string,
  path: string,
  query: Record<string, unknown>,
  body: Record<string, unknown> | undefined,
): Promise<void> {
  try {
    const q = Object.fromEntries(
      Object.entries(query).map(([k, v]): [string, string | number] => [
        k,
        typeof v === 'string' || typeof v === 'number' ? v : JSON.stringify(v),
      ]),
    );
    // lib/api.ts's base already ends in /api/v1; the spec's paths carry it too.
    const data = await request<unknown>(path.replace(/^\/api\/v1(?=\/|$)/, ''), { method, body, query: q });
    console.log(JSON.stringify(data ?? null, null, 2));
  } catch (e) {
    fail(e);
  }
}

/** Bad input to a generated command (a missing field, a value the spec does not allow). */
export async function failRoute(_cmd: Command, err: unknown): Promise<never> {
  fail(err);
}
