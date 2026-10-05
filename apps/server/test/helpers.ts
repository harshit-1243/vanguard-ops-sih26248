import type { AddressInfo } from 'node:net';
import { io as ioc, type Socket } from 'socket.io-client';
import type { CommandAck, CreateSessionResponse, JoinResponse, RoleId } from '@vanguard/shared';
import { buildApp, type AppContext } from '../src/app';
import { loadConfig } from '../src/config';
import type { EventStore } from '../src/store/types';

export interface TestServer extends AppContext {
  url: string;
  close: () => Promise<void>;
  api: <T = unknown>(method: string, path: string, body?: unknown, token?: string) => Promise<{ status: number; body: T }>;
}

export async function startServer(opts: { tickHz?: number; store?: EventStore; webDist?: string; env?: Record<string, string> } = {}): Promise<TestServer> {
  const config = loadConfig(
    { ...process.env, LOG_LEVEL: 'silent', TICK_HZ: String(opts.tickHz ?? 50), DATABASE_URL: '', ADMIN_KEY: '', ...opts.env },
    { webDist: opts.webDist ?? '/nonexistent-web-dist' },
  );
  const ctx = await buildApp(config, opts.store);
  await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = ctx.app.server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const api = async <T,>(method: string, path: string, body?: unknown, token?: string) => {
    const res = await ctx.app.inject({
      method: method as 'GET',
      url: path,
      payload: body as Record<string, unknown> | undefined,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    const ct = String(res.headers['content-type'] ?? '');
    return { status: res.statusCode, body: (ct.includes('json') ? res.json() : res.body) as T };
  };
  return {
    ...ctx,
    url,
    api,
    close: async () => {
      closeAllClients();
      await ctx.app.close();
    },
  };
}

export async function createSession(srv: TestServer, enabledRoles?: RoleId[], scenarioId = 'iron-bridge') {
  const r = await srv.api<CreateSessionResponse>('POST', '/api/sessions', { scenarioId, enabledRoles });
  if (r.status !== 201) throw new Error(`create failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function join(srv: TestServer, code: string, roleId: RoleId, callsign = `P ${roleId}`.replace('_', '')) {
  const r = await srv.api<JoinResponse>('POST', `/api/sessions/${code}/join`, { roleId, callsign });
  if (r.status !== 200) throw new Error(`join failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export interface Client {
  socket: Socket;
  /** Every payload received, by event name (for leak scanning). */
  received: { event: string; payload: unknown }[];
  last: <T>(event: string) => T | undefined;
  waitFor: <T>(event: string, pred?: (p: T) => boolean, timeoutMs?: number) => Promise<T>;
  cmd: (c: unknown) => Promise<CommandAck>;
  close: () => void;
}

/** Every client ever opened — closed by closeAllClients() so a failing test can't hang shutdown. */
const openClients = new Set<Client>();
export function closeAllClients(): void {
  for (const c of openClients) c.close();
  openClients.clear();
}

export function connect(srv: TestServer, code: string, token: string): Promise<Client> {
  const socket = ioc(srv.url, { auth: { code, token }, transports: ['websocket'], reconnection: false, forceNew: true });
  const received: Client['received'] = [];
  socket.onAny((event, payload) => received.push({ event, payload }));
  const client: Client = {
    socket,
    received,
    last: <T,>(event: string) => [...received].reverse().find((r) => r.event === event)?.payload as T | undefined,
    waitFor: <T,>(event: string, pred: (p: T) => boolean = () => true, timeoutMs = 5000) =>
      new Promise<T>((resolve, reject) => {
        const existing = [...received].reverse().find((r) => r.event === event && pred(r.payload as T));
        if (existing) return resolve(existing.payload as T);
        const timer = setTimeout(() => {
          socket.off(event, handler);
          reject(new Error(`timeout waiting for ${event}`));
        }, timeoutMs);
        const handler = (p: T) => {
          if (!pred(p)) return;
          clearTimeout(timer);
          socket.off(event, handler);
          resolve(p);
        };
        socket.on(event, handler);
      }),
    cmd: (c: unknown) => new Promise<CommandAck>((resolve) => socket.emit('cmd', c, resolve)),
    close: () => socket.close(),
  };
  openClients.add(client);
  return new Promise((resolve, reject) => {
    socket.once('connect_error', (err) => reject(err));
    socket.once('hello', () => resolve(client));
  });
}
