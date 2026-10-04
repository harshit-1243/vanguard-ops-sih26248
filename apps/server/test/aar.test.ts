import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// pdf-parse's index runs a self-test on import; the lib entry is the actual parser.
// @ts-expect-error — no types for the deep import
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import type { AarReport, ReplayResponse } from '@vanguard/shared';
import { CSV_COLUMNS, decisionsCsv } from '../src/aar';
import { seedDemo } from '../src/demo';
import { pdfText } from '../src/pdf';
import { createSession, join, startServer, type TestServer } from './helpers';

let srv: TestServer;
let demo: Awaited<ReturnType<typeof seedDemo>>;

beforeAll(async () => {
  srv = await startServer();
  demo = await seedDemo(srv.manager);
});
afterAll(async () => {
  await srv.close();
});

async function raw(path: string, token?: string) {
  return srv.app.inject({ method: 'GET', url: path, headers: token ? { authorization: `Bearer ${token}` } : {} });
}

describe('AAR endpoints (US-AAR-1..9)', () => {
  it('returns the four-question AAR to the DS', async () => {
    const r = await srv.api<AarReport>('GET', `/api/sessions/${demo.code}/aar`, undefined, demo.instructorToken);
    expect(r.status).toBe(200);
    const aar = r.body;
    expect(aar.meta.scenarioTitle).toBe('Iron Bridge');
    expect(aar.q1.msel.length).toBeGreaterThanOrEqual(12);
    expect(aar.q2.timeline.length).toBeGreaterThan(10);
    expect(aar.q3.decisions.length).toBeGreaterThanOrEqual(10);
    expect(aar.q3.decisions.every((d) => d.knowable && d.truth && d.adjudication)).toBe(true);
    expect(aar.q3.roleMetrics).toHaveLength(5);
    expect(aar.q3.probes).toHaveLength(2);
    expect(aar.exec.sustain.length + aar.exec.improve.length).toBeGreaterThan(0);
    expect(aar.disclaimer).toMatch(/synthetic/);
  });

  it('enforces access: trainees only after END, strangers never', async () => {
    const { code, instructorToken } = await createSession(srv);
    const j = await join(srv, code, 'PL_A');
    expect((await raw(`/api/sessions/${code}/aar`)).statusCode).toBe(401);
    expect((await raw(`/api/sessions/${code}/aar`, j.playerToken)).statusCode).toBe(403);
    expect((await raw(`/api/sessions/${code}/aar`, instructorToken)).statusCode).toBe(200);
    srv.manager.get(code)!.dsCommand({ type: 'START' });
    srv.manager.get(code)!.dsCommand({ type: 'END' });
    expect((await raw(`/api/sessions/${code}/aar`, j.playerToken)).statusCode).toBe(200);
    // ?token= works for browser downloads
    expect((await raw(`/api/sessions/${code}/decisions.csv?token=${j.playerToken}`)).statusCode).toBe(200);
  });

  it('generates a real PDF containing hindsight-safe decision cards', async () => {
    const r = await raw(`/api/sessions/${demo.code}/aar.pdf`, demo.instructorToken);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(String(r.headers['content-disposition'])).toMatch(/vanguard-aar-iron-bridge-.*\.pdf/);
    const buf = r.rawPayload;
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const parsed = await pdfParse(buf);
    expect(parsed.numpages).toBeGreaterThanOrEqual(4);
    const text: string = parsed.text;
    for (const s of ['Executive summary', 'What was supposed to happen', 'What actually happened', 'decision cards', 'AT DECISION TIME (KNOWABLE)', 'GROUND TRUTH (REVEALED)', 'Decision D1', 'Training simulation', 'Swimlane timeline', 'Comms network']) {
      expect(text, `PDF missing "${s}"`).toContain(s);
    }
  });

  it('exports CSV (one row per decision) and the full JSON event log', async () => {
    const csv = await raw(`/api/sessions/${demo.code}/decisions.csv`, demo.instructorToken);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const lines = csv.body.trim().split(/\r\n/);
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    const s = srv.manager.get(demo.code)!;
    expect(lines).toHaveLength(s.sim.state.decisions.length + 1);
    const json = await srv.api<{ inputEvents: unknown[]; journal: unknown[]; stateHash: string }>('GET', `/api/sessions/${demo.code}/events.json`, undefined, demo.instructorToken);
    expect(json.body.inputEvents.length).toBe(s.events.length);
    expect(json.body.journal.length).toBeGreaterThan(0);
    expect(json.body.stateHash).toBe(s.sim.hash());
  });

  it('CSV escapes quotes, commas and newlines', () => {
    const d = srv.manager.get(demo.code)!.sim.state.decisions[0]!;
    const out = decisionsCsv([{ ...d, rationale: 'He said "go", then\nstopped' }]);
    expect(out).toContain('"He said ""go"", then\nstopped"');
  });

  it('replay rebuilds truth and role views from the log', async () => {
    const t = await srv.api<ReplayResponse>('GET', `/api/sessions/${demo.code}/replay?view=truth&stepS=30`, undefined, demo.instructorToken);
    expect(t.status).toBe(200);
    expect(t.body.frames.length).toBeGreaterThan(30);
    expect(t.body.frames.some((f) => f.units.some((u) => u.decoy))).toBe(true);
    const role = await srv.api<ReplayResponse>('GET', `/api/sessions/${demo.code}/replay?view=PL_B&stepS=60`, undefined, demo.instructorToken);
    expect(role.body.view).toBe('PL_B');
    expect(JSON.stringify(role.body)).not.toContain('DECOY PARK');
    expect((await srv.api('GET', `/api/sessions/${demo.code}/replay?view=NLO`, undefined, demo.instructorToken)).status).toBe(400);
    expect((await srv.api('GET', `/api/sessions/${demo.code}/replay?view=XX`, undefined, demo.instructorToken)).status).toBe(400);
  });

  it('pdfText maps non-WinAnsi symbols', () => {
    expect(pdfText('ρ ≥ 1.5 → ✓ ✕ × ± ≤ ← 中')).toBe('rho >= 1.5 -> OK X x +/- <= <- ?');
  });
});
