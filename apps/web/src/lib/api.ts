import type {
  CreateSessionResponse,
  JoinResponse,
  LobbyInfo,
  RoleId,
  ScenarioListItem,
  SessionSettings,
} from '@vanguard/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const isJson = res.headers.get('content-type')?.includes('json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = isJson && data && typeof data === 'object' && 'error' in data ? String(data.error) : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export interface Briefing {
  title: string;
  theatre: string;
  summary: string;
  brief: { situation: string; mission: string; execution: string; sustainment: string; command: string };
  intent: string;
  terrain: string[];
  objectives: { id: string; text: string; cell: string }[];
  features: { id: string; label: string; kind: string; cell: string }[];
}

export const api = {
  demo: () => request<CreateSessionResponse>('POST', '/api/demo', {}),
  scenarios: () => request<ScenarioListItem[]>('GET', '/api/scenarios'),
  create: (scenarioId: string, enabledRoles?: RoleId[], seed?: number, settings?: SessionSettings, course?: string) =>
    request<CreateSessionResponse>('POST', '/api/sessions', { scenarioId, enabledRoles, seed, settings, course: course?.trim() || undefined }),
  instructorLogin: (code: string, pin: string) =>
    request<{ instructorToken: string }>('POST', `/api/sessions/${code}/instructor`, { pin }),
  lobby: (code: string) => request<LobbyInfo>('GET', `/api/sessions/${code}/lobby`),
  join: (code: string, roleId: RoleId, callsign: string) =>
    request<JoinResponse>('POST', `/api/sessions/${code}/join`, { roleId, callsign }),
  me: (code: string, token: string) =>
    request<{ actor: string; phase: string }>('GET', `/api/sessions/${code}/me`, undefined, token),
  briefing: (code: string) => request<Briefing>('GET', `/api/sessions/${code}/briefing`),
  get: <T>(path: string, token: string) => request<T>('GET', path, undefined, token),
  post: <T>(path: string, body: unknown, token: string) => request<T>('POST', path, body, token),
};
