import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalyticsResponse, Scenario, ScenarioListItem, ScenarioValidation } from '@vanguard/shared';
import { seedDemo } from '../src/demo';
import { designWarnings, dryRunScenario } from '../src/editor';
import { MemoryEventStore } from '../src/store/memory';
import { startServer, type TestServer } from './helpers';

const clone = <T,>(x: T): T => structuredClone(x);

describe('scenario editor API (open mode, no ADMIN_KEY)', () => {
  let srv: TestServer;
  const store = new MemoryEventStore();
  let base: Scenario;
  beforeAll(async () => {
    srv = await startServer({ store });
    const r = await srv.api<{ scenario: Scenario; custom: boolean }>('GET', '/api/admin/scenarios/iron-bridge');
    expect(r.status).toBe(200);
    expect(r.body.custom).toBe(false);
    base = r.body.scenario;
  });
  afterAll(async () => {
    await srv.close();
  });

  it('reports open mode', async () => {
    expect((await srv.api('GET', '/api/admin/status')).body).toEqual({ required: false });
  });

  it('validates: schema errors block, the dry run proves a valid scenario runs end to end', async () => {
    const bad = await srv.api<ScenarioValidation>('POST', '/api/admin/scenarios/validate', { scenario: { ...base, roles: [] } });
    expect(bad.body.ok).toBe(false);
    expect(bad.body.issues.some((i) => i.path === 'roles')).toBe(true);
    expect(bad.body.dryRun).toBeNull();

    const good = await srv.api<ScenarioValidation>('POST', '/api/admin/scenarios/validate', { scenario: { ...base, id: 'my-bridge' } });
    expect(good.body.ok).toBe(true);
    expect(good.body.issues).toEqual([]);
    expect(good.body.dryRun).toMatchObject({ simS: base.durationMin * 60, error: null });
    expect(good.body.dryRun!.mselFired).toBeGreaterThan(0);
  });

  it('saves a duplicate, lists it, runs an exercise on it, then deletes it without touching the exercise', async () => {
    const sc = { ...clone(base), id: 'my-bridge', title: 'My Bridge' };
    expect((await srv.api('PUT', '/api/admin/scenarios/my-bridge', { scenario: sc })).status).toBe(200);
    const list = await srv.api<ScenarioListItem[]>('GET', '/api/scenarios');
    expect(list.body.find((s) => s.id === 'my-bridge')).toMatchObject({ custom: true, title: 'My Bridge' });
    expect(list.body.find((s) => s.id === 'iron-bridge')).toMatchObject({ custom: false });

    const created = await srv.api<{ code: string }>('POST', '/api/sessions', { scenarioId: 'my-bridge', course: 'DSSC-81 Syndicate 4' });
    expect(created.status).toBe(201);
    expect((await store.findSessionByCode(created.body.code))!.course).toBe('DSSC-81 Syndicate 4');

    // edit + re-save
    expect((await srv.api('PUT', '/api/admin/scenarios/my-bridge', { scenario: { ...sc, title: 'My Bridge v2' } })).status).toBe(200);
    expect((await srv.api<ScenarioListItem[]>('GET', '/api/scenarios')).body.find((s) => s.id === 'my-bridge')!.title).toBe('My Bridge v2');

    expect((await srv.api('DELETE', '/api/admin/scenarios/my-bridge')).status).toBe(200);
    expect((await srv.api<ScenarioListItem[]>('GET', '/api/scenarios')).body.some((s) => s.id === 'my-bridge')).toBe(false);
    // the exercise snapshotted its scenario
    expect((await srv.api('GET', `/api/sessions/${created.body.code}/lobby`)).status).toBe(200);
  });

  it('rejects built-in overwrites, id mismatches, invalid scenarios and unknown deletes', async () => {
    expect((await srv.api('PUT', '/api/admin/scenarios/iron-bridge', { scenario: base })).status).toBe(409);
    expect((await srv.api('PUT', '/api/admin/scenarios/other-id', { scenario: { ...base, id: 'x-id' } })).status).toBe(400);
    const invalid = await srv.api<{ validation: ScenarioValidation }>('PUT', '/api/admin/scenarios/broken', { scenario: { ...base, id: 'broken', terrain: ['bad'] } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.validation.issues.length).toBeGreaterThan(0);
    expect((await srv.api('DELETE', '/api/admin/scenarios/iron-bridge')).status).toBe(409);
    expect((await srv.api('DELETE', '/api/admin/scenarios/nope')).status).toBe(404);
  });

  it('custom scenarios survive a restart (persisted in the store)', async () => {
    expect((await srv.api('PUT', '/api/admin/scenarios/kept', { scenario: { ...clone(base), id: 'kept', title: 'Kept' } })).status).toBe(200);
    const again = await startServer({ store });
    try {
      expect((await again.api<ScenarioListItem[]>('GET', '/api/scenarios')).body.some((s) => s.id === 'kept' && s.custom)).toBe(true);
    } finally {
      // closing the second server closes the shared store too — reopen is a no-op for memory
      await again.close();
    }
  });
});

describe('design warnings + dry run', () => {
  let base: Scenario;
  beforeAll(async () => {
    const srv = await startServer();
    base = (await srv.api<{ scenario: Scenario }>('GET', '/api/admin/scenarios/iron-bridge')).body.scenario;
    await srv.close();
  });

  it('built-in scenarios produce no warnings', () => {
    expect(designWarnings(base)).toEqual([]);
  });

  it('flags land units at sea, late MSEL items, objectives outside the intent, out-of-order waypoints', () => {
    const sc = clone(base);
    sc.terrain = sc.terrain.map((row, i) => (i === 0 ? 'WWWWWWWW' : row));
    const blue = sc.units.find((u) => u.side === 'BLUE')!;
    blue.waypoints = [{ atS: 0, cell: 'A1' }];
    sc.msel[0]!.atS = sc.durationMin * 60 + 60;
    sc.objectives = sc.objectives.filter((o) => o.cell !== sc.intent.objectiveCells[0]);
    const red = sc.units.find((u) => u.side === 'RED' && u.waypoints.length === 1)!;
    red.waypoints = [{ atS: 0, cell: red.waypoints[0]!.cell }, { atS: 600, cell: 'C3' }, { atS: 300, cell: 'C4' }];
    const msgs = designWarnings(sc).map((w) => w.message).join('\n');
    expect(msgs).toMatch(/land unit but A1 is sea/);
    expect(msgs).toMatch(/never fires/);
    expect(msgs).toMatch(/has no matching objective/);
    expect(msgs).toMatch(/not in time order/);
  });

  it('dry run reports outcome numbers and is cheap', () => {
    const r = dryRunScenario(base);
    expect(r.error).toBeNull();
    expect(r.simS).toBe(base.durationMin * 60);
    expect(r.blueStrengthPct).toBeGreaterThan(0);
    expect(r.ms).toBeLessThan(10_000);
  });
});

describe('course-director key + cross-course analytics', () => {
  let srv: TestServer;
  const KEY = 'test-course-director-key';
  beforeAll(async () => {
    srv = await startServer({ env: { ADMIN_KEY: KEY } });
    await seedDemo(srv.manager);
    await seedDemo(srv.manager);
  });
  afterAll(async () => {
    await srv.close();
  });

  it('requires the key when ADMIN_KEY is set', async () => {
    expect((await srv.api('GET', '/api/admin/status')).body).toEqual({ required: true });
    expect((await srv.api('GET', '/api/admin/analytics')).status).toBe(401);
    expect((await srv.api('GET', '/api/admin/analytics', undefined, 'wrong-key-123')).status).toBe(401);
    expect((await srv.api('GET', '/api/admin/scenarios/iron-bridge')).status).toBe(401);
    expect((await srv.api('POST', '/api/admin/login', { key: 'nope' })).status).toBe(401);
    expect((await srv.api('POST', '/api/admin/login', { key: KEY })).status).toBe(200);
    expect((await srv.api('GET', '/api/admin/scenarios/iron-bridge', undefined, KEY)).status).toBe(200);
  });

  it('aggregates finished exercises by course, scenario, role, difficulty and officer', async () => {
    const r = await srv.api<AnalyticsResponse>('GET', '/api/admin/analytics', undefined, KEY);
    expect(r.status).toBe(200);
    const a = r.body;
    expect(a.totals.exercises).toBe(2);
    expect(a.skipped).toEqual([]);
    expect(a.options.courses).toEqual(['Demo']);
    expect(a.byCourse).toHaveLength(1);
    expect(a.byScenario[0]).toMatchObject({ key: 'iron-bridge', exercises: 2 });
    expect(a.byRole.map((g) => g.key)).toEqual(expect.arrayContaining(['CDR', 'PL_A', 'PL_B']));
    const arjun = a.participants.find((p) => p.callsign === 'ARJUN')!;
    expect(arjun).toMatchObject({ role: 'CDR', exercises: 2, course: 'Demo' });
    expect(a.totals.decisions).toBe(2 * a.exercises[0]!.decisions);
    expect(a.totals.metrics.soundRate).not.toBeNull();
    expect(a.pitfalls.length).toBeGreaterThan(0);
    expect(a.insights.length).toBeGreaterThan(0);
    // both runs of the deterministic demo produce identical metrics
    expect(a.exercises[0]!.metrics).toEqual(a.exercises[1]!.metrics);
  });

  it('filters and exports CSV', async () => {
    const none = await srv.api<AnalyticsResponse>('GET', '/api/admin/analytics?course=Nobody', undefined, KEY);
    expect(none.body.totals.exercises).toBe(0);
    expect(none.body.insights[0]).toMatch(/No finished exercises/);
    expect(none.body.options.courses).toEqual(['Demo']);
    const sc = await srv.api<AnalyticsResponse>('GET', '/api/admin/analytics?scenario=iron-bridge', undefined, KEY);
    expect(sc.body.totals.exercises).toBe(2);
    const csv = await srv.api<string>('GET', '/api/admin/analytics.csv', undefined, KEY);
    expect(csv.status).toBe(200);
    const lines = csv.body.trim().split('\r\n');
    expect(lines[0]).toMatch(/^exercise,course,scenario/);
    expect(lines.length).toBe(1 + 2 * 5); // 2 exercises × 5 joined roles
  });

  it('AI brief is null without a provider', async () => {
    expect((await srv.api('POST', '/api/admin/analytics/brief', {}, KEY)).body).toEqual({ briefing: null });
  });

  it('rate-limits repeated wrong keys', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await srv.api('GET', '/api/admin/analytics', undefined, `bad-${i}-xxxxxxxx`)).status);
    expect(codes).toContain(429);
  });
});
