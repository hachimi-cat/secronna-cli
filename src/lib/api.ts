/**
 * Thin API client for the Secronna CLI.
 *
 * Reuses the on-disk session (`lib/session.ts`) for the bearer token and
 * resolves the API base the same way the frontend does: an env override
 * (`<BRAND>_API_URL`, e.g. `SECRONNA_API_URL`) that may be a bare origin
 * OR already include the `/api/v1` prefix — a trailing prefix is stripped
 * so it's appended exactly once (mirrors `frontend/src/lib/api.ts`).
 */
import { loadSession } from './session.js';

function brand(): string {
  return process.env.SECRONNA ?? 'secronna';
}

const API_PREFIX = '/api/v1';

/** Resolve the `<host>/api/v1` base URL. */
export function apiBase(): string {
  const envKey = `${brand().toUpperCase()}_API_URL`;
  const raw = process.env[envKey] || `https://${brand()}.com`;
  const origin = raw.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  return `${origin}${API_PREFIX}`;
}

/** Error carrying the envelope's error code + HTTP status. */
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function bearer(): string {
  const s = loadSession();
  if (!s?.accessToken) {
    throw new ApiError('Not signed in — run `auth login` first.', 'AUTH_REQUIRED', 401);
  }
  return s.accessToken;
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

/** Perform an authenticated request and unwrap the `{data,error,meta}` envelope. */
export async function request<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = 'GET', body, query } = opts;
  const url = new URL(`${apiBase()}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${bearer()}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  type Envelope = { data?: T; error?: { code?: string; message?: string } };
  let envelope: Envelope | null = null;
  const text = await res.text();
  if (text) {
    try {
      envelope = JSON.parse(text) as Envelope;
    } catch {
      throw new ApiError(
        `Unexpected non-JSON response (HTTP ${res.status}).`,
        'INTERNAL_ERROR',
        res.status,
      );
    }
  }

  if (!res.ok || envelope?.error) {
    const code = envelope?.error?.code ?? 'HTTP_ERROR';
    const message = envelope?.error?.message ?? `Request failed (HTTP ${res.status}).`;
    throw new ApiError(message, code, res.status);
  }

  return envelope?.data as T;
}

// ── Typed resource shapes ──
export interface Project {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  createdBy: string;
}
export interface Environment {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}
export interface SecretVersion {
  id: string;
  key: string;
  version: number;
}
export interface SecretRow {
  id: string;
  key: string;
  currentVersion: number;
  createdAt: string;
}
export interface RevealedSecret {
  key: string;
  version: number;
  value: string;
}
export interface RevealedByPath {
  path: string;
  key: string;
  version: number;
  value: string;
}
export interface ResolvedEnvPath {
  project: { id: string; name: string; slug: string };
  environment: { id: string; name: string; slug: string };
}
export interface AuditRow {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  createdAt: string;
  metadata?: unknown;
  [k: string]: unknown;
}

// ── Resource helpers (the testable seam) ──
export const createProject = (name: string) =>
  request<Project>('/projects', { method: 'POST', body: { name } });
export const listProjects = () => request<Project[]>('/projects');

export const createEnvironment = (projectId: string, name: string) =>
  request<Environment>(`/projects/${encodeURIComponent(projectId)}/environments`, {
    method: 'POST',
    body: { name },
  });
export const listEnvironments = (projectId: string) =>
  request<Environment[]>(`/projects/${encodeURIComponent(projectId)}/environments`);

export const putSecret = (envId: string, key: string, value: string) =>
  request<SecretVersion>(`/environments/${encodeURIComponent(envId)}/secrets`, {
    method: 'PUT',
    body: { key, value },
  });
export const listSecrets = (envId: string) =>
  request<SecretRow[]>(`/environments/${encodeURIComponent(envId)}/secrets`);

export const revealSecret = (secretId: string, version?: number) =>
  request<RevealedSecret>(`/secrets/${encodeURIComponent(secretId)}/reveal`, {
    method: 'POST',
    query: { version },
  });
export const deleteSecret = (secretId: string) =>
  request<{ id: string; deleted: boolean }>(`/secrets/${encodeURIComponent(secretId)}`, {
    method: 'DELETE',
  });

export const listAudit = (limit?: number) =>
  request<AuditRow[]>('/audit', { query: { limit } });

/**
 * Reveal a single secret by its Vault-style `project/env/KEY` path.
 * Audited + rate-limited server-side. Returns the plaintext value.
 */
export const revealByPath = (path: string, version?: number) =>
  request<RevealedByPath>('/reveal', { method: 'POST', body: { path, version } });

/**
 * Resolve a `project/env` slug path to its project + environment ids via
 * the by-slug endpoint. Lets `run`/`export` accept a human path in place
 * of an opaque `env_…` id.
 */
export const resolveEnvPath = (projectSlug: string, envSlug: string) =>
  request<ResolvedEnvPath>(
    `/projects/by-slug/${encodeURIComponent(projectSlug)}/environments/${encodeURIComponent(envSlug)}`,
  );

/**
 * Normalise a `--env` argument to an environment id. If it contains a
 * slash it's treated as a `project/env` slug path and resolved via the
 * by-slug endpoint; otherwise it's assumed to already be an env id and
 * returned unchanged (backward-compatible with `env_…` ids).
 */
export async function resolveEnvId(envArg: string): Promise<string> {
  if (!envArg.includes('/')) return envArg;
  const parts = envArg.split('/');
  if (parts.length !== 2 || parts.some((p) => p.length === 0)) {
    throw new ApiError(
      `Invalid env path '${envArg}'. Expected 'project/env' or an env id.`,
      'VALIDATION_ERROR',
      400,
    );
  }
  const [projectSlug, envSlug] = parts;
  const resolved = await resolveEnvPath(projectSlug!, envSlug!);
  return resolved.environment.id;
}

/**
 * Fetch every secret in an environment as a plaintext KEY→value map.
 * Lists the keys, then reveals each at its current version. Shared by
 * `run` and `export` — the only commands whose explicit purpose is to
 * surface values.
 */
export async function collectEnvSecrets(envId: string): Promise<Record<string, string>> {
  const rows = await listSecrets(envId);
  const out: Record<string, string> = {};
  for (const row of rows) {
    const revealed = await revealSecret(row.id);
    out[revealed.key] = revealed.value;
  }
  return out;
}
