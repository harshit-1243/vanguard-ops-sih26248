import { io, type Socket } from 'socket.io-client';

/**
 * Load test: `pnpm --filter @vanguard/server loadtest [url] [sessions] [seconds]`
 * N concurrent exercises, each DS + 6 trainee sockets, running at ×4 (4 sim-steps per wall second
 * at TICK_HZ=1). Reports whether the sim clock keeps pace and how fast pictures arrive.
 */
const base = (process.argv[2] ?? 'http://127.0.0.1:8095').replace(/\/$/, '');
const N = Number(process.argv[3] ?? 10);
const SECONDS = Number(process.argv[4] ?? 45);
const ROLES = ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW', 'NLO'] as const;

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}
const connect = (code: string, token: string) =>
  new Promise<Socket>((res, rej) => {
    const s = io(base, { auth: { code, token }, transports: ['websocket'], reconnection: false });
    s.once('hello', () => res(s));
    s.once('connect_error', rej);
  });

const sessions: { ds: Socket; trainees: Socket[]; pictures: number; bytes: number; firstT: number | null; lastT: number }[] = [];
for (let i = 0; i < N; i++) {
  const c = await post<{ code: string; instructorToken: string }>('/api/sessions', { scenarioId: 'iron-bridge', enabledRoles: [...ROLES] });
  const ds = await connect(c.code, c.instructorToken);
  const entry = { ds, trainees: [] as Socket[], pictures: 0, bytes: 0, firstT: null as number | null, lastT: 0 };
  for (const r of ROLES) {
    const j = await post<{ playerToken: string }>(`/api/sessions/${c.code}/join`, { roleId: r, callsign: `LT${i}${r.replace('_', '')}`.slice(0, 16) });
    const s = await connect(c.code, j.playerToken);
    s.on('picture', (p: { tMs: number }) => {
      entry.pictures++;
      entry.bytes += JSON.stringify(p).length;
      if (r === 'CDR') {
        entry.firstT ??= p.tMs;
        entry.lastT = p.tMs;
      }
    });
    entry.trainees.push(s);
  }
  await new Promise<void>((res) => ds.emit('cmd', { type: 'START' }, () => res()));
  await new Promise<void>((res) => ds.emit('cmd', { type: 'SET_SPEED', speed: 4 }, () => res()));
  sessions.push(entry);
}
console.log(`${N} exercises × 7 sockets (${N * 7} sockets) running at ×4 for ${SECONDS}s…`);
const t0 = Date.now();
for (const s of sessions) s.pictures = s.bytes = 0;
await new Promise((r) => setTimeout(r, SECONDS * 1000));
const wall = (Date.now() - t0) / 1000;
const health = (await (await fetch(`${base}/healthz`)).json()) as Record<string, number>;
const simAdvance = sessions.map((s) => (s.lastT - (s.firstT ?? 0)) / 1000);
const expected = SECONDS * 4;
const pictures = sessions.reduce((n, s) => n + s.pictures, 0);
const bytes = sessions.reduce((n, s) => n + s.bytes, 0);
console.log(`sim seconds advanced per exercise: min ${Math.min(...simAdvance)} / max ${Math.max(...simAdvance)} (expected ≈ ${expected}) → ${Math.round((Math.min(...simAdvance) / expected) * 100)}% of real-time ×4`);
console.log(`pictures delivered: ${pictures} (${Math.round(pictures / wall)}/s), avg ${Math.round(bytes / Math.max(1, pictures) / 1024)} KB, ${Math.round(bytes / wall / 1024)} KB/s total`);
console.log(`server: rss ${health.rssMb} MB, event-loop p99 ${health.eventLoopP99Ms} ms, running ${health.running}`);
for (const s of sessions) [s.ds, ...s.trainees].forEach((x) => x.close());
process.exit(0);
