import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the session store so the client always finds a token.
vi.mock('../lib/session.js', () => ({
  loadSession: vi.fn(() => ({ accessToken: 'tok_abc' })),
}));

import * as session from '../lib/session.js';
import {
  apiBase,
  request,
  ApiError,
  createProject,
  listProjects,
  putSecret,
  revealSecret,
  collectEnvSecrets,
  listAudit,
  revealByPath,
  resolveEnvPath,
  resolveEnvId,
} from '../lib/api.js';

function mockFetch(status: number, envelope: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(envelope),
    })),
  );
}

beforeEach(() => {
  delete process.env.SECRONNA_API_URL;
  delete process.env.SECRONNA;
  vi.mocked(session.loadSession).mockReturnValue({ accessToken: 'tok_abc' } as never);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('apiBase', () => {
  it('defaults to https://<brand>.com/api/v1', () => {
    expect(apiBase()).toBe('https://secronna.com/api/v1');
  });
  it('honours the env override and strips a trailing /api/v1', () => {
    process.env.SECRONNA_API_URL = 'http://localhost:4230/api/v1';
    expect(apiBase()).toBe('http://localhost:4230/api/v1');
  });
  it('appends the prefix to a bare origin', () => {
    process.env.SECRONNA_API_URL = 'http://localhost:4230';
    expect(apiBase()).toBe('http://localhost:4230/api/v1');
  });
});

describe('request', () => {
  it('sends the bearer token and unwraps data', async () => {
    mockFetch(200, { data: { id: 'p1' }, error: null, meta: {} });
    const data = await request<{ id: string }>('/projects');
    expect(data).toEqual({ id: 'p1' });
    const call = vi.mocked(fetch).mock.calls[0]!;
    expect(call[0]).toBe('https://secronna.com/api/v1/projects');
    expect((call[1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tok_abc',
    });
  });

  it('throws AUTH_REQUIRED when no session', async () => {
    vi.mocked(session.loadSession).mockReturnValue(null);
    mockFetch(200, { data: {} });
    await expect(request('/projects')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('throws ApiError with the envelope error code on non-2xx', async () => {
    mockFetch(404, { data: null, error: { code: 'NOT_FOUND', message: 'nope' } });
    await expect(request('/projects/x')).rejects.toBeInstanceOf(ApiError);
    await expect(request('/projects/x')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      message: 'nope',
    });
  });

  it('throws when the envelope carries an error even on 200', async () => {
    mockFetch(200, { data: null, error: { code: 'VALIDATION_ERROR', message: 'bad' } });
    await expect(request('/projects')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('resource helpers', () => {
  it('createProject POSTs the name', async () => {
    mockFetch(201, { data: { id: 'p1', name: 'Ops', slug: 'ops' } });
    const p = await createProject('Ops');
    expect(p.slug).toBe('ops');
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Ops' });
  });

  it('listProjects GETs the collection', async () => {
    mockFetch(200, { data: [{ id: 'p1' }] });
    const list = await listProjects();
    expect(list).toHaveLength(1);
  });

  it('putSecret uses PUT and does not surface the value in the result path', async () => {
    mockFetch(201, { data: { id: 's1', key: 'API_KEY', version: 2 } });
    const out = await putSecret('env1', 'API_KEY', 'super-secret');
    expect(out).toEqual({ id: 's1', key: 'API_KEY', version: 2 });
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('PUT');
  });

  it('revealSecret passes the version query', async () => {
    mockFetch(200, { data: { key: 'K', version: 3, value: 'v' } });
    await revealSecret('s1', 3);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toContain('/secrets/s1/reveal?version=3');
  });

  it('listAudit passes the limit query', async () => {
    mockFetch(200, { data: [] });
    await listAudit(5);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toContain('/audit?limit=5');
  });
});

describe('revealByPath', () => {
  it('POSTs the path to /reveal and returns the value', async () => {
    mockFetch(200, { data: { path: 'ops/prod/API_KEY', key: 'API_KEY', version: 4, value: 'v' } });
    const out = await revealByPath('ops/prod/API_KEY');
    expect(out.value).toBe('v');
    const call = vi.mocked(fetch).mock.calls[0]!;
    expect(call[0]).toBe('https://secronna.com/api/v1/reveal');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ path: 'ops/prod/API_KEY', version: undefined });
  });

  it('includes the version in the body when given', async () => {
    mockFetch(200, { data: { path: 'ops/prod/API_KEY', key: 'API_KEY', version: 2, value: 'v' } });
    await revealByPath('ops/prod/API_KEY', 2);
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ path: 'ops/prod/API_KEY', version: 2 });
  });
});

describe('resolveEnvPath / resolveEnvId', () => {
  it('resolveEnvPath GETs the by-slug endpoint', async () => {
    mockFetch(200, {
      data: {
        project: { id: 'prj_1', name: 'Ops', slug: 'ops' },
        environment: { id: 'env_1', name: 'Prod', slug: 'prod' },
      },
    });
    const out = await resolveEnvPath('ops', 'prod');
    expect(out.environment.id).toBe('env_1');
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(
      'https://secronna.com/api/v1/projects/by-slug/ops/environments/prod',
    );
  });

  it('resolveEnvId passes an env id through untouched (no request)', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const id = await resolveEnvId('env_abc123');
    expect(id).toBe('env_abc123');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('resolveEnvId resolves a project/env slug path to the env id', async () => {
    mockFetch(200, {
      data: {
        project: { id: 'prj_1', name: 'Ops', slug: 'ops' },
        environment: { id: 'env_9', name: 'Prod', slug: 'prod' },
      },
    });
    const id = await resolveEnvId('ops/prod');
    expect(id).toBe('env_9');
    expect(vi.mocked(fetch).mock.calls[0]![0]).toContain('/projects/by-slug/ops/environments/prod');
  });

  it('resolveEnvId rejects a malformed slug path', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(resolveEnvId('ops/prod/extra')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(resolveEnvId('ops/')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe('collectEnvSecrets', () => {
  it('lists keys then reveals each into a KEY→value map', async () => {
    const responses = [
      { data: [{ id: 's1', key: 'A' }, { id: 's2', key: 'B' }] },
      { data: { key: 'A', version: 1, value: 'aaa' } },
      { data: { key: 'B', version: 1, value: 'bbb' } },
    ];
    let i = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(responses[i++]),
      })),
    );
    const map = await collectEnvSecrets('env1');
    expect(map).toEqual({ A: 'aaa', B: 'bbb' });
    // 1 list + 2 reveals
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });
});
