import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LobbyInfo, ScenarioSummary } from '@vanguard/shared';
import { RateLimiter, hashSecret, newSessionCode, sameHash } from '../src/auth';
import { loadConfig } from '../src/config';
import { ScenarioRegistry, parseScenarioFile } from '../src/scenarios';
import { MemoryEventStore } from '../src/store/memory';
import { createSession, join, startServer, type TestServer } from './helpers';

let srv: TestServer;
beforeAll(async () => {
  srv = await startServer();
});
afterAll(async () => {
  await srv.close();
});

describe('REST session lifecycle (US-S-1..3)', () => {
  it('health check and scenario list', async () => {
    const h = await srv.api<{ ok: boolean; store: string }>('GET', '/healthz');
    expect(h.body).toMatchObject({ ok: true, store: 'memory' });
    const sc = await srv.api<ScenarioSummary[]>('GET', '/api/scenarios');
    expect(sc.body.map((s) => s.id)).toContain('iron-bridge');
    expect(sc.body.find((s) => s.id === 'iron-bridge')!.mselCount).toBeGreaterThanOrEqual(12);
  });

  it('creates an exercise with a 6-char code and 6-digit PIN', async () => {
    const r = await createSession(srv);
    expect(r.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(r.pin).toMatch(/^\d{6}$/);
    expect(r.instructorToken.length).toBeGreaterThan(30);
    const bad = await srv.api('POST', '/api/sessions', { scenarioId: 'nope' });
    expect(bad.status).toBe(404);
    const invalid = await srv.api('POST', '/api/sessions', { scenarioId: 'iron-bridge', enabledRoles: ['PL_A', 'PL_B'] });
    expect(invalid.status).toBe(400);
    const zod = await srv.api('POST', '/api/sessions', { scenarioId: 5 });
    expect(zod.status).toBe(400);
  });

  it('lobby lists enabled roles; join marks them taken; races resolve to one winner', async () => {
    const { code } = await createSession(srv, ['CDR', 'PL_A', 'PL_B', 'NLO']);
    const lobby = await srv.api<LobbyInfo>('GET', `/api/sessions/${code.toLowerCase()}/lobby`);
    expect(lobby.body.roles.map((r) => r.id)).toEqual(['CDR', 'PL_A', 'PL_B', 'NLO']);
    expect(lobby.body.phase).toBe('LOBBY');
    await join(srv, code, 'PL_A', 'viper');
    const results = await Promise.all([
      srv.api('POST', `/api/sessions/${code}/join`, { roleId: 'PL_B', callsign: 'ONE' }),
      srv.api('POST', `/api/sessions/${code}/join`, { roleId: 'PL_B', callsign: 'TWO' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const after = await srv.api<LobbyInfo>('GET', `/api/sessions/${code}/lobby`);
    expect(after.body.roles.find((r) => r.id === 'PL_A')).toMatchObject({ taken: true, takenBy: 'VIPER' });
    expect((await srv.api('POST', `/api/sessions/${code}/join`, { roleId: 'ALO', callsign: 'X1' })).status).toBe(409);
    expect((await srv.api('POST', `/api/sessions/${code}/join`, { roleId: 'CDR', callsign: '<b>' })).status).toBe(400);
    // reclaim by same callsign while not connected
    expect((await srv.api('POST', `/api/sessions/${code}/join`, { roleId: 'PL_A', callsign: 'VIPER' })).status).toBe(200);
  });

  it('unknown / malformed codes return 404', async () => {
    expect((await srv.api('GET', '/api/sessions/ZZZZZZ/lobby')).status).toBe(404);
    expect((await srv.api('GET', '/api/sessions/bad!/lobby')).status).toBe(404);
  });

  it('instructor PIN login with rate limiting', async () => {
    const { code, pin } = await createSession(srv);
    const ok = await srv.api<{ instructorToken: string }>('POST', `/api/sessions/${code}/instructor`, { pin });
    expect(ok.status).toBe(200);
    const me = await srv.api<{ actor: string }>('GET', `/api/sessions/${code}/me`, undefined, ok.body.instructorToken);
    expect(me.body.actor).toBe('DS');
    expect((await srv.api('GET', `/api/sessions/${code}/me`, undefined, 'x'.repeat(40))).status).toBe(401);
    const wrong = await srv.api('POST', `/api/sessions/${code}/instructor`, { pin: pin === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(401);
    for (let i = 0; i < 4; i++) await srv.api('POST', `/api/sessions/${code}/instructor`, { pin: '999999' });
    expect((await srv.api('POST', `/api/sessions/${code}/instructor`, { pin })).status).toBe(429);
  });

  it('serves the public briefing', async () => {
    const { code } = await createSession(srv);
    const b = await srv.api<{ title: string; terrain: string[]; intent: string }>('GET', `/api/sessions/${code}/briefing`);
    expect(b.body.title).toBe('Iron Bridge');
    expect(b.body.terrain).toHaveLength(8);
    expect(JSON.stringify(b.body)).not.toContain('DECOY');
  });
});

describe('auth helpers', () => {
  it('codes, hashes and limiter', () => {
    expect(newSessionCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(sameHash(hashSecret('a'), hashSecret('a'))).toBe(true);
    expect(sameHash(hashSecret('a'), 'ab')).toBe(false);
    let t = 0;
    const lim = new RateLimiter(2, 1000, () => t);
    expect([lim.allow('k'), lim.allow('k'), lim.allow('k')]).toEqual([true, true, false]);
    t = 1500;
    expect(lim.allow('k')).toBe(true);
  });
});

describe('scenario loading', () => {
  it('rejects invalid scenario files with path-specific errors', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vg-'));
    writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ id: 'bad', title: 'x' }));
    expect(() => parseScenarioFile(path.join(dir, 'bad.json'))).toThrow(/Invalid scenario bad\.json/);
    const empty = mkdtempSync(path.join(tmpdir(), 'vg-'));
    expect(() => ScenarioRegistry.fromDir(empty)).toThrow(/No scenarios/);
  });

  it('config resolves defaults', () => {
    const c = loadConfig({ PORT: '9999', LLM_PROVIDER: 'none' });
    expect(c.PORT).toBe(9999);
    expect(c.DATABASE_URL).toBeUndefined();
    expect(c.scenariosDir).toMatch(/scenarios$/);
  });
});

describe('memory store', () => {
  it('rejects duplicate codes and seqs', async () => {
    const st = new MemoryEventStore();
    const rec = { id: 'a', code: 'ABCDEF', scenarioId: 's', seed: 1, status: 'LOBBY' as const, pinHash: 'x', instructorTokenHashes: [], enabledRoles: [], scenario: {}, createdAt: new Date(), endedAt: null };
    await st.createSession(rec);
    await expect(st.createSession({ ...rec, id: 'b' })).rejects.toThrow(/duplicate code/);
    const ev = { id: 'e', sessionId: 'a', seq: 1, tSimMs: 0, tWall: new Date().toISOString(), actor: 'DS', type: 'EXERCISE_STARTED', payload: {} } as const;
    await st.appendEvent(ev);
    await expect(st.appendEvent(ev)).rejects.toThrow(/duplicate seq/);
    await expect(st.appendEvent({ ...ev, sessionId: 'zz' })).rejects.toThrow(/unknown session/);
    await st.upsertPlayer({ sessionId: 'a', roleId: 'CDR', callsign: 'X', tokenHash: 'h' });
    expect(await st.loadPlayers('a')).toHaveLength(1);
    await st.deletePlayer('a', 'CDR');
    expect(await st.loadPlayers('a')).toHaveLength(0);
    await st.updateSession('a', { status: 'ENDED' });
    expect(await st.listOpenSessions()).toHaveLength(0);
    expect(await st.countSessions()).toBe(1);
  });
});
