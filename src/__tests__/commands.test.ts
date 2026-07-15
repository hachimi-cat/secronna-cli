import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mergeEnv } from '../commands/run.js';
import { formatSecrets } from '../commands/export.js';
import { formatAuditTable } from '../commands/audit.js';
import { assertSecretPath } from '../commands/get.js';
import type { AuditRow } from '../lib/api.js';

describe('run: mergeEnv injection', () => {
  it('merges secrets over the base env, with secrets winning', () => {
    const base = { PATH: '/bin', SHARED: 'stale' } as NodeJS.ProcessEnv;
    const merged = mergeEnv(base, { SHARED: 'fresh', API_KEY: 'k' });
    expect(merged.PATH).toBe('/bin'); // inherited
    expect(merged.SHARED).toBe('fresh'); // secret wins
    expect(merged.API_KEY).toBe('k'); // injected
  });

  it('does not mutate the base env', () => {
    const base = { A: '1' } as NodeJS.ProcessEnv;
    mergeEnv(base, { B: '2' });
    expect(base).toEqual({ A: '1' });
  });
});

describe('export: formatSecrets', () => {
  const secrets = { DATABASE_URL: 'postgres://u:p@h/db', TOKEN: "a'b" };

  it('dotenv format is KEY=value lines', () => {
    expect(formatSecrets(secrets, 'dotenv')).toBe(
      'DATABASE_URL=postgres://u:p@h/db\nTOKEN=a\'b',
    );
  });

  it('shell format uses export with single-quote escaping', () => {
    expect(formatSecrets(secrets, 'shell')).toBe(
      "export DATABASE_URL='postgres://u:p@h/db'\nexport TOKEN='a'\\''b'",
    );
  });

  it('json format is a pretty object', () => {
    expect(JSON.parse(formatSecrets(secrets, 'json'))).toEqual(secrets);
  });
});

describe('audit: formatAuditTable', () => {
  it('renders a header + rows', () => {
    const rows: AuditRow[] = [
      {
        id: 'a1',
        actorType: 'user',
        actorId: 'sub_1',
        action: 'secret.reveal',
        createdAt: '2026-07-02T00:00:00Z',
      },
    ];
    const out = formatAuditTable(rows);
    expect(out).toContain('WHEN');
    expect(out).toContain('ACTION');
    expect(out).toContain('user:sub_1');
    expect(out).toContain('secret.reveal');
  });

  it('handles empty input', () => {
    expect(formatAuditTable([])).toBe('No audit entries.');
  });
});

describe('get: assertSecretPath validation', () => {
  it('accepts exactly three non-empty slash parts', () => {
    expect(assertSecretPath('project/env/KEY')).toBe('project/env/KEY');
  });
  it('rejects too few parts', () => {
    expect(() => assertSecretPath('project/KEY')).toThrow(/three slash-separated/);
  });
  it('rejects too many parts', () => {
    expect(() => assertSecretPath('project/env/KEY/extra')).toThrow(/three slash-separated/);
  });
  it('rejects empty parts', () => {
    expect(() => assertSecretPath('project//KEY')).toThrow(/three slash-separated/);
  });
});

// `get <path>` POSTs the path to /reveal and prints ONLY the value.
describe('get: reveal by path prints only the value', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.resetModules();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('posts the path and prints the value alone', async () => {
    vi.doMock('../lib/session.js', () => ({
      loadSession: vi.fn(() => ({ accessToken: 'tok' })),
    }));
    const fetchMock = vi.fn(async (..._args: unknown[]) => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ data: { path: 'ops/prod/API_KEY', key: 'API_KEY', version: 1, value: 'the-value' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { get } = await import('../commands/get.js');
    await get.parseAsync(['node', 'secronna', 'ops/prod/API_KEY']);

    // Right endpoint + body.
    const call = fetchMock.mock.calls[0]!;
    expect(String(call[0])).toContain('/api/v1/reveal');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({ path: 'ops/prod/API_KEY' });

    // Only the value on stdout.
    const printed = logSpy.mock.calls.flat();
    expect(printed).toEqual(['the-value']);
  });
});

// `run --env project/env` resolves the slug to an env id, then injects.
describe('run: --env project/env slug resolution', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resolves the slug via by-slug, then lists + reveals against the env id', async () => {
    vi.doMock('../lib/session.js', () => ({
      loadSession: vi.fn(() => ({ accessToken: 'tok' })),
    }));
    const responses = [
      // by-slug resolution
      { data: { project: { id: 'prj_1', name: 'Ops', slug: 'ops' }, environment: { id: 'env_9', name: 'Prod', slug: 'prod' } } },
      // list secrets in env_9
      { data: [{ id: 's1', key: 'API_KEY' }] },
      // reveal s1
      { data: { key: 'API_KEY', version: 1, value: 'secret-v' } },
    ];
    let i = 0;
    const fetchMock = vi.fn(async (..._args: unknown[]) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(responses[i++]),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { run } = await import('../commands/run.js');
    // `true` is a no-op command that exits 0.
    await run.parseAsync(['node', 'secronna', '--env', 'ops/prod', '--', 'true']);
    // Let the spawned child settle (exit handler calls process.exit, which is stubbed).
    await new Promise((r) => setTimeout(r, 50));

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain('/projects/by-slug/ops/environments/prod');
    expect(urls[1]).toContain('/environments/env_9/secrets');
    expect(urls[2]).toContain('/secrets/s1/reveal');
    expect(exitSpy).not.toHaveBeenCalledWith(1);
  });
});

// Verify secret set never echoes the value: run the command action against a
// mocked API and assert the value string never reaches stdout.
describe('secret set: no value echo', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('prints the key + version but never the value', async () => {
    vi.doMock('../lib/session.js', () => ({
      loadSession: vi.fn(() => ({ accessToken: 'tok' })),
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ data: { id: 's1', key: 'API_KEY', version: 1 } }),
      })),
    );
    const { secret } = await import('../commands/secret.js');
    await secret.parseAsync(['node', 'secronna', 'set', 'env1', 'API_KEY', 'top-secret-value']);

    const printed = logSpy.mock.calls.flat().join('\n');
    expect(printed).toContain('API_KEY');
    expect(printed).toContain('version 1');
    expect(printed).not.toContain('top-secret-value');
  });
});
