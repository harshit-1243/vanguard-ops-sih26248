/**
 * GROUND-TRUTH LEAK TEST (PRD §13, DoD).
 * Subscribes as every trainee role over real sockets, plays a busy exercise (jammers, all inject
 * types, cyber, decisions, probe), records EVERY payload each trainee socket receives, and asserts
 * none contains ground-truth-only fields, hidden identifiers or un-fired injects.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PerceivedPicture, RoleId } from '@vanguard/shared';
import { connect, createSession, join, startServer, type Client, type TestServer } from './helpers';

const FORBIDDEN_KEYS = [
  'decoy', 'strength', 'track', 'waypoints', 'msel', 'truth', 'spoofed', 'jammers', 'rng',
  'reportMeta', 'adjudication', 'truthUnitIds', 'decoyOnly', 'dfOffset', 'engage', 'knowable',
  'causes', 'units', 'effects', 'scores', 'pending', 'journal',
];

function keysOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysOf(x, out);
    }
  }
  return out;
}

let srv: TestServer;
beforeAll(async () => {
  srv = await startServer({ tickHz: 50 });
});
afterAll(async () => {
  await srv.close();
});

describe('ground-truth isolation on trainee sockets', () => {
  it('no trainee payload ever contains truth-only data', async () => {
    const roles: RoleId[] = ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW', 'NLO'];
    const { code, instructorToken } = await createSession(srv, roles);
    const ds = await connect(srv, code, instructorToken);
    const trainees = new Map<RoleId, Client>();
    for (const r of roles) trainees.set(r, await connect(srv, code, (await join(srv, code, r)).playerToken));
    const session = srv.manager.get(code)!;

    await ds.cmd({ type: 'START' });
    await ds.cmd({ type: 'SET_SPEED', speed: 4 });
    const secretJammer = await ds.cmd({ type: 'PLACE_JAMMER', jammer: { cell: 'G2', radius: 2, bands: ['VHF', 'HF'], label: 'TOP SECRET JAMMER LABEL' } });
    expect(secretJammer.ok).toBe(true);
    for (const type of ['DELAY', 'DROPOUT', 'INTERMITTENT', 'CONFLICT', 'SPOOF', 'MISSING', 'STALE'] as const) {
      const r = await ds.cmd({ type: 'FIRE_INJECT', inject: { type, channels: ['CMD_NET', 'ISR_DATALINK'], roles: [], durationS: 60, params: { targetCell: 'D6' }, label: `SECRET-INJECT-${type}` } });
      expect(r.ok).toBe(true);
    }
    await ds.cmd({ type: 'TRIGGER_CYBER', cyber: { kind: 'DATALINK_COMPROMISE', durationS: 60 } });
    await ds.cmd({ type: 'TRIGGER_CYBER', cyber: { kind: 'GPS_SPOOF', role: 'PL_A', durationS: 60 } });
    await ds.cmd({ type: 'TRIGGER_CYBER', cyber: { kind: 'C2_OUTAGE', durationS: 30 } });
    // Fast-forward the sim deterministically (equivalent to many ticks) while sockets are connected.
    session.stopClock();
    session.advance(240);
    const a = trainees.get('PL_A')!;
    const pic = await a.waitFor<PerceivedPicture>('picture', (p) => p.tMs >= 240_000);
    await a.cmd({ type: 'MAKE_DECISION', decision: { action: 'ADVANCE', targetCell: 'C4', confidence: 70, rationale: 'Advancing to close on the bridge', basedOn: pic.intel.slice(-1).map((i) => i.id), intentSelf: 'YES' } });
    await ds.cmd({ type: 'START_PROBE' });
    await a.waitFor<PerceivedPicture>('picture', (p) => !!p.probe);
    await ds.cmd({ type: 'END_PROBE' });
    session.advance(600);
    await a.waitFor<PerceivedPicture>('picture', (p) => p.tMs >= 840_000);

    const sc = session.scenario;
    const hidden = [
      ...sc.units.filter((u) => u.side === 'RED').flatMap((u) => [u.id, u.callsign]),
      'TOP SECRET JAMMER LABEL',
      ...['DELAY', 'DROPOUT', 'INTERMITTENT', 'CONFLICT', 'SPOOF', 'MISSING', 'STALE'].map((t) => `SECRET-INJECT-${t}`),
      ...session.sim.state.msel.filter((m) => m.status === 'PENDING').map((m) => m.title),
      ...session.sim.state.jammers.map((j) => j.id),
    ];
    let scanned = 0;
    for (const [role, client] of trainees) {
      expect(client.received.some((r) => r.event === 'ds:state' || r.event === 'ds:viewAs'), `${role} got DS payload`).toBe(false);
      for (const { event, payload } of client.received) {
        scanned++;
        const keys = keysOf(payload);
        for (const k of FORBIDDEN_KEYS) expect(keys.has(k), `${role} ${event} leaked key "${k}"`).toBe(false);
        const json = JSON.stringify(payload);
        for (const h of hidden) expect(json.includes(h), `${role} ${event} leaked "${h}"`).toBe(false);
      }
    }
    expect(scanned).toBeGreaterThan(100);
    // Sanity: the truth exists and DS sees it.
    expect(JSON.stringify(ds.last('ds:state'))).toContain('DECOY PARK D6');
    for (const c of [ds, ...trainees.values()]) c.close();
  }, 60_000);
});
