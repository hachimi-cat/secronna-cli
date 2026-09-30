import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

// `secronna api <area> <action>`: every feature route, generated from the API spec.
// Calls go through the CLI's own client (lib/api.ts): the session's bearer, the
// resolved base URL, the envelope. The session and fetch are stubbed here.
vi.mock('../lib/session.js', () => ({
  loadSession: vi.fn(() => ({ accessToken: 'tok_test' })),
}));

import { API_ROUTES, buildApiCommand } from '../commands/api.generated.js';

class Exit extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

interface Seen {
  url: string;
  method: string;
  body?: unknown;
  auth?: string;
}
let seen: Seen[];
let stdout: string[];

beforeEach(() => {
  delete process.env.SECRONNA_API_URL;
  delete process.env.SECRONNA;
  seen = [];
  stdout = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      seen.push({
        url,
        method: String(init.method),
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
        auth: headers.Authorization,
      });
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { ok: true }, error: null, meta: {} }) };
    }),
  );
  vi.spyOn(console, 'log').mockImplementation((s: unknown) => void stdout.push(String(s)));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Exit(code ?? 0);
  }) as never);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function run(argv: string[]): Promise<number> {
  const program = new Command().name('secronna').version('0.0.0').exitOverride();
  program.addCommand(buildApiCommand());
  try {
    await program.parseAsync(argv, { from: 'user' });
    return 0;
  } catch (err) {
    if (err instanceof Exit) return err.code;
    throw err;
  }
}

describe('secronna api', () => {
  it('has a command for every feature route', () => {
    const count = API_ROUTES.reduce((n, a) => n + a.routes.length, 0);
    expect(count).toBeGreaterThanOrEqual(19);
    expect(API_ROUTES.map((a) => a.area)).toEqual(
      expect.arrayContaining(['projects', 'environments', 'secrets', 'access-keys', 'webhooks']),
    );
  });

  it('writes a secret from flags with the session bearer, and prints the result', async () => {
    const code = await run(['api', 'environments', 'set-secrets', 'env 1', '--key', 'DATABASE_URL', '--value', 'placeholder']);
    expect(code).toBe(0);
    expect(seen[0]).toEqual({
      url: 'https://secronna.com/api/v1/environments/env%201/secrets',
      method: 'PUT',
      body: { key: 'DATABASE_URL', value: 'placeholder' },
      auth: 'Bearer tok_test',
    });
    expect(JSON.parse(stdout.join(''))).toEqual({ ok: true });
  });

  it('puts query fields in the query (a flag that clashes with --version is --field-version)', async () => {
    expect(await run(['api', 'secrets', 'reveal', 'sec_1', '--field-version', '2'])).toBe(0);
    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.url).toBe('https://secronna.com/api/v1/secrets/sec_1/reveal?version=2');
    expect(seen[0]!.body).toBeUndefined();
    expect(await run(['api', 'audit', 'list', '--limit', '5'])).toBe(0);
    expect(seen[1]!.url).toBe('https://secronna.com/api/v1/audit?limit=5');
  });

  it('refuses a missing required field without calling the API', async () => {
    expect(await run(['api', 'access-keys', 'create', '--expires-in-days', '30'])).toBe(1);
    expect(seen).toHaveLength(0);
  });
});
