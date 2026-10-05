import type {
  AdminStatus,
  AnalyticsResponse,
  NarrativeBlock,
  Scenario,
  ScenarioListItem,
  ScenarioValidation,
} from '@vanguard/shared';
import { ApiError } from './api';

/** Course-director key: kept for this browser tab only (sessionStorage), sent as a bearer token. */
const KEY = 'vg-admin-key';

export function getAdminKey(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAdminKey(key: string | null): void {
  try {
    if (key) sessionStorage.setItem(KEY, key);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: key lives only in memory for this page */
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = getAdminKey();
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const isJson = res.headers.get('content-type')?.includes('json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = isJson && data && typeof data === 'object' && 'error' in data ? String(data.error) : `HTTP ${res.status}`;
    const err = new ApiError(res.status, msg) as ApiError & { data?: unknown };
    err.data = data;
    throw err;
  }
  return data as T;
}

const qs = (f: { course?: string | null; scenario?: string | null }) => {
  const p = new URLSearchParams();
  if (f.course !== null && f.course !== undefined) p.set('course', f.course);
  if (f.scenario) p.set('scenario', f.scenario);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const adminApi = {
  status: () => call<AdminStatus>('GET', '/api/admin/status'),
  login: (key: string) => call<{ ok: boolean }>('POST', '/api/admin/login', { key }),
  scenarios: () => call<ScenarioListItem[]>('GET', '/api/scenarios'),
  scenario: (id: string) => call<{ scenario: Scenario; custom: boolean }>('GET', `/api/admin/scenarios/${encodeURIComponent(id)}`),
  validate: (scenario: unknown) => call<ScenarioValidation>('POST', '/api/admin/scenarios/validate', { scenario }),
  save: (id: string, scenario: unknown) =>
    call<{ ok: boolean; id: string; updatedAt: string; validation: ScenarioValidation }>('PUT', `/api/admin/scenarios/${encodeURIComponent(id)}`, { scenario }),
  remove: (id: string) => call<{ ok: boolean }>('DELETE', `/api/admin/scenarios/${encodeURIComponent(id)}`),
  analytics: (f: { course?: string | null; scenario?: string | null }) => call<AnalyticsResponse>('GET', `/api/admin/analytics${qs(f)}`),
  brief: (f: { course?: string | null; scenario?: string | null }) => call<{ briefing: NarrativeBlock | null }>('POST', `/api/admin/analytics/brief${qs(f)}`, {}),
  /** Authenticated download (a plain link cannot carry the bearer token). */
  async downloadCsv(f: { course?: string | null; scenario?: string | null }): Promise<void> {
    const key = getAdminKey();
    const res = await fetch(`/api/admin/analytics.csv${qs(f)}`, { headers: key ? { authorization: `Bearer ${key}` } : {} });
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
    saveBlob(await res.blob(), 'vanguard-analytics.csv');
  },
};

export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
