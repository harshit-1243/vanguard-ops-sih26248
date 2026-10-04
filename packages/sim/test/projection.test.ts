import { describe, expect, it } from 'vitest';
import type { PerceivedPicture, RoleId } from '@vanguard/shared';
import { knowableSnapshot, mselViews, project, projectTruth, truthLinks, truthSnapshot } from '../src';
import { Driver, FIXTURE, started } from './fixtures';

/** Keys that exist only in ground truth and must never appear in a trainee payload. */
export const FORBIDDEN_KEYS = [
  'decoy', 'strength', 'track', 'waypoints', 'msel', 'truth', 'spoofed', 'jammers', 'rng',
  'reportMeta', 'adjudication', 'truthUnitIds', 'decoyOnly', 'dfOffset', 'engage', 'knowable', 'causes',
];

export function collectKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => collectKeys(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      collectKeys(x, out);
    }
  }
  return out;
}

function busyExercise(): Driver {
  const d = new Driver(FIXTURE, 11, ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW', 'NLO']).joinAll().start();
  d.run(60);
  d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J-SECRET', cell: 'C6', radius: 2, bands: ['VHF', 'HF'], power: 1, active: true } } });
  d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'INJ-SECRET', inject: { type: 'SPOOF', channels: ['CMD_NET'], roles: [], durationS: 120, params: {} } } });
  d.emit('DS', { type: 'CYBER_TRIGGERED', payload: { cyberId: 'CY-SECRET', cyber: { kind: 'DATALINK_COMPROMISE', durationS: 90 } } });
  d.emit('DS', { type: 'CYBER_TRIGGERED', payload: { cyberId: 'CY-GPS', cyber: { kind: 'GPS_SPOOF', role: 'PL_A', durationS: 200 } } });
  d.emit('PL_A', { type: 'DECISION_MADE', payload: { action: 'ADVANCE', targetCell: 'D2', confidence: 80, rationale: 'UAV shows armour, attacking now', basedOn: [], intentSelf: 'YES' } });
  d.run(120);
  d.emit('DS', { type: 'PROBE_STARTED', payload: { probeId: 'P1' } });
  return d;
}

describe('per-role projection — ground-truth isolation (PRD §13)', () => {
  it('trainee pictures contain no truth-only keys or hidden identifiers', () => {
    const d = busyExercise();
    const redIds = d.s.units.filter((u) => u.side === 'RED').flatMap((u) => [u.id, u.callsign]);
    const pendingMselTitles = d.s.msel.filter((m) => m.status === 'PENDING').map((m) => m.title).filter((t) => t.length >= 8);
    for (const role of d.s.enabledRoles) {
      const pic = project(d.ctx, role, 'ABC234');
      const keys = collectKeys(pic);
      for (const k of FORBIDDEN_KEYS) expect(keys.has(k), `${role} leaked key ${k}`).toBe(false);
      const json = JSON.stringify(pic);
      for (const id of [...redIds, 'J-SECRET', 'INJ-SECRET', 'CY-SECRET', ...pendingMselTitles]) {
        expect(json.includes(id), `${role} leaked "${id}"`).toBe(false);
      }
      // probe questions are present but truth answers are not
      expect(pic.probe!.questions.length).toBe(4);
    }
  });

  it('roles see different pictures', () => {
    const d = busyExercise();
    const pics = Object.fromEntries(d.s.enabledRoles.map((r) => [r, project(d.ctx, r, 'X')])) as Record<RoleId, PerceivedPicture>;
    expect(pics.CDR.intel.map((i) => i.id)).not.toEqual(pics.PL_B.intel.map((i) => i.id));
    expect(pics.EW.spectrum).not.toBeNull();
    expect(pics.EW.spectrum![0]!.label).toBe('EMITTER-1');
    expect(pics.CDR.spectrum).toBeNull();
    expect(pics.ALO.air!.isrTasking[0]!.label).toBe('UAV HERON-X');
    expect(pics.NLO.air!.requested).toBe(false);
    expect(pics.PL_A.air).toBeNull();
    expect(pics.PL_B.cutOff).toBe(true);
    expect(pics.PL_B.channels.find((c) => c.channel === 'CMD_NET')!.hint).toBe('JAMMING');
    expect(pics.CDR.channels.some((c) => c.channel === 'ISR_DATALINK' && !c.messaging)).toBe(true);
    expect(pics.CDR.netMembers.PL_NET_A).toEqual(['PL_A', 'EW']);
    // GPS spoofed own position differs from truth
    const truth = projectTruth(d.ctx, 'X');
    const pla = truth.roles.find((r) => r.role === 'PL_A')!;
    expect(pics.PL_A.ownUnit.cell).toBe(pla.perceivedCell);
  });

  it('builds friendlies from POSREPs and contacts with conflict marks', () => {
    const d = started();
    d.run(120);
    const pic = project(d.ctx, 'CDR', 'X');
    expect(pic.friendlies.map((f) => f.role)).toContain('PL_A');
    expect(pic.contacts.some((c) => c.inConflict)).toBe(true);
    expect(pic.roster).toHaveLength(5);
  });

  it('decision snapshots freeze knowable vs truth', () => {
    const d = busyExercise();
    const k = knowableSnapshot(d.ctx, 'PL_B', []);
    expect(k.cutOff).toBe(true);
    expect(k.outages.length).toBeGreaterThan(0);
    const t = truthSnapshot(d.ctx, 'PL_A', 'F4');
    expect(t.hostilesInTarget.length + t.hostilesAdjacent.length).toBeGreaterThan(0);
    expect(t.rho).not.toBeNull();
  });

  it('truth view exposes everything for DS', () => {
    const d = busyExercise();
    const t = projectTruth(d.ctx, 'X', new Set(['CDR']));
    expect(t.units.some((u) => u.decoy)).toBe(true);
    expect(t.jammers[0]!.id).toBe('J-SECRET');
    // SPOOF and DATALINK_COMPROMISE have expired by now; only the GPS spoof is still active.
    expect(t.effects.map((e) => e.type)).toEqual(['GPS_SPOOF']);
    expect(t.roles.find((r) => r.role === 'CDR')!.connected).toBe(true);
    expect(t.links.some((l) => l.level === 'DENIED')).toBe(true);
    expect(t.comms.find((c) => c.channel === 'CMD_NET')!.deniedLinks).toBeGreaterThan(0);
    expect(t.probes).toHaveLength(1);
    expect(truthLinks(d.ctx).length).toBeGreaterThan(0);
    expect(mselViews(d.ctx).map((m) => m.summary)).toEqual([
      'DELAY on SATCOM for 120s',
      'Jammer J-M2 at C6 r=2 [VHF,HF]',
      'C2_OUTAGE for 60s',
      'Jammer J-M2 OFF',
      'Report via HF_NET → CDR',
    ]);
  });
});
