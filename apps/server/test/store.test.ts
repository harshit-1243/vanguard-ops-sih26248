import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { replay } from '@vanguard/sim';
import { loadConfig } from '../src/config';
import { seedDemo } from '../src/demo';
import { SessionManager } from '../src/manager';
import { ScenarioRegistry } from '../src/scenarios';
import { MemoryEventStore } from '../src/store/memory';
import { PrismaEventStore } from '../src/store/prisma';
import type { EventStore } from '../src/store/types';

const config = loadConfig({ LOG_LEVEL: 'silent' });
const scenarios = ScenarioRegistry.fromDir(config.scenariosDir);

async function exerciseRoundTrip(store: EventStore) {
  await store.init();
  const m1 = new SessionManager(store, scenarios, { tickHz: 1 });
  const { session, pin } = await m1.create('iron-bridge', 1234, ['CDR', 'PL_A', 'PL_B']);
  const j = await session.join('PL_A', 'VIPER');
  expect(j.ok).toBe(true);
  session.dsCommand({ type: 'START' });
  session.stopClock();
  session.advance(30);
  session.traineeCommand('PL_A', { type: 'SEND_MESSAGE', channel: 'CMD_NET', to: ['CDR'], text: 'persist me' });
  session.advance(20);
  session.dsCommand({ type: 'PLACE_JAMMER', jammer: { cell: 'G2', radius: 2, bands: ['VHF'], power: 1, active: true } });
  await session.flush();
  const tokenA = j.ok ? j.token : '';
  m1.list().forEach((s) => s.dispose());

  // "Restart": new manager over the same store rebuilds from the event log.
  const m2 = new SessionManager(store, scenarios, { tickHz: 1 });
  expect(await m2.rehydrateAll()).toBeGreaterThanOrEqual(1);
  const back = m2.get(session.code)!;
  expect(back.phase).toBe('PAUSED');
  expect(back.sim.state.tMs).toBe(session.sim.state.tMs);
  expect(back.sim.state.jammers).toHaveLength(1);
  expect(back.resolveToken(tokenA)).toBe('PL_A');
  expect(await back.instructorLogin(pin)).toBeTruthy();
  const events = await store.loadEvents(session.id);
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  expect(events.at(-1)!.type).toBe('EXERCISE_PAUSED');
  m2.list().forEach((s) => s.dispose());
  return session.code;
}

describe('event store round-trip + rehydrate (memory)', () => {
  it('rebuilds a session from its persisted input log', async () => {
    await exerciseRoundTrip(new MemoryEventStore());
  });
});

describe.runIf(!!process.env.TEST_DATABASE_URL)('event store round-trip (PostgreSQL via Prisma)', () => {
  it('persists and rehydrates against Postgres', async () => {
    const store = new PrismaEventStore(process.env.TEST_DATABASE_URL!);
    try {
      const code = await exerciseRoundTrip(store);
      const rec = await store.findSessionByCode(code);
      expect(rec?.scenarioId).toBe('iron-bridge');
      expect(await store.countSessions()).toBeGreaterThan(0);
      await store.deletePlayer(rec!.id, 'PL_A');
      expect((await store.loadPlayers(rec!.id)).map((p) => p.roleId)).not.toContain('PL_A');
      await store.updateSession(rec!.id, { status: 'ENDED', endedAt: new Date() });
      expect((await store.listOpenSessions()).some((s) => s.code === code)).toBe(false);
    } finally {
      await store.close();
    }
  }, 60_000);
});

describe('demo seed', () => {
  it('produces a finished, replayable Iron Bridge exercise', async () => {
    const store = new MemoryEventStore();
    const m = new SessionManager(store, scenarios, { tickHz: 1 });
    const demo = await seedDemo(m);
    const s = m.get(demo.code)!;
    expect(s.phase).toBe('ENDED');
    expect(s.sim.state.decisions.length).toBeGreaterThanOrEqual(10);
    expect(s.sim.state.probes).toHaveLength(2);
    expect(s.sim.state.decisions.some((d) => d.cutOff)).toBe(true);
    expect(new Set(s.sim.state.decisions.map((d) => d.adjudication.soundness)).size).toBeGreaterThanOrEqual(2);
    const events = await store.loadEvents(s.id);
    expect(replay(s.scenario, events).hash()).toBe(s.sim.hash());
    expect(demo.skipped.length).toBeLessThanOrEqual(3);
    void randomUUID;
  });
});
