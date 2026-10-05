import { io, type Socket } from 'socket.io-client';
import type { PerceivedPicture } from '@vanguard/shared';

/**
 * Live smoke test: `pnpm --filter @vanguard/server smoke https://your-app.onrender.com`
 * health → create session → 2 trainees join over real sockets → start → inject → jammer →
 * trainee sees degradation → end → AAR JSON + PDF.
 */
const base = (process.argv[2] ?? 'http://localhost:8080').replace(/\/$/, '');
const step = (msg: string) => console.log(`✓ ${msg}`);
const fail = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

async function json<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) fail(`${method} ${path} → HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

function connect(code: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(base, { auth: { code, token }, transports: ['websocket'], reconnection: false });
    s.once('hello', () => resolve(s));
    s.once('connect_error', reject);
    setTimeout(() => reject(new Error('socket timeout')), 20_000);
  });
}

const cmd = (s: Socket, c: unknown) =>
  new Promise<{ ok: boolean; error?: string }>((resolve) => s.emit('cmd', c, resolve));

const waitPicture = (s: Socket, pred: (p: PerceivedPicture) => boolean, ms = 60_000) =>
  new Promise<PerceivedPicture>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for picture')), ms);
    s.on('picture', (p: PerceivedPicture) => {
      if (pred(p)) {
        clearTimeout(t);
        resolve(p);
      }
    });
  });

process.on('unhandledRejection', (e) => fail(String(e)));

const health = await json<{ ok: boolean; store: string }>('GET', '/healthz');
if (!health.ok) fail('health not ok');
step(`health ok (store=${health.store}) at ${base}`);

const created = await json<{ code: string; instructorToken: string }>('POST', '/api/sessions', { scenarioId: 'iron-bridge' });
step(`session created ${created.code}`);

const a = await json<{ playerToken: string }>('POST', `/api/sessions/${created.code}/join`, { roleId: 'CDR', callsign: 'SMOKE A' });
const b = await json<{ playerToken: string }>('POST', `/api/sessions/${created.code}/join`, { roleId: 'PL_B', callsign: 'SMOKE B' });
const ds = await connect(created.code, created.instructorToken);
const sa = await connect(created.code, a.playerToken);
const sb = await connect(created.code, b.playerToken);
step('DS + 2 trainee sockets connected');

const running = waitPicture(sb, (p) => p.phase === 'RUNNING');
if (!(await cmd(ds, { type: 'START' })).ok) fail('start rejected');
await cmd(ds, { type: 'SET_SPEED', speed: 4 });
await running;
step('exercise running ×4; trainee receives its own picture');

const inj = await cmd(ds, { type: 'FIRE_INJECT', inject: { type: 'DELAY', channels: ['SATCOM'], roles: [], durationS: 60, params: { delayS: 30 } } });
if (!inj.ok) fail(`inject rejected: ${inj.error}`);
const cutP = waitPicture(sb, (p) => p.cutOff);
await cmd(ds, { type: 'PLACE_JAMMER', jammer: { cell: 'G2', radius: 2, bands: ['VHF', 'HF'], power: 1, active: true } });
const cut = await cutP;
step(`inject + jammer applied; PL_B cut off at ${cut.tMs / 1000}s sim`);

const msg = await cmd(sa, { type: 'SEND_MESSAGE', channel: 'CMD_NET', to: ['PL_B'], text: 'Smoke test message' });
if (!msg.ok) fail(`message rejected: ${msg.error}`);
step('trainee-to-trainee message accepted (it will be lost: PL_B is jammed)');

const ended = waitPicture(sb, (p) => p.phase === 'ENDED');
if (!(await cmd(ds, { type: 'END' })).ok) fail('end rejected');
await ended;
step('exercise ended');

const aar = await json<{ meta: { scenarioTitle: string }; q2: { timeline: unknown[] } }>('GET', `/api/sessions/${created.code}/aar`, undefined, created.instructorToken);
step(`AAR fetched: ${aar.meta.scenarioTitle}, ${aar.q2.timeline.length} timeline events`);
const pdf = await fetch(`${base}/api/sessions/${created.code}/aar.pdf?token=${created.instructorToken}`);
const head = Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString();
if (!pdf.ok || head !== '%PDF-') fail('PDF export failed');
step('PDF export ok');

for (const s of [ds, sa, sb]) s.close();
console.log('SMOKE TEST PASSED');
process.exit(0);
