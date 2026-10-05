import { describe, expect, it } from 'vitest';
import { cellCentre, vecToCell, type SessionSettings } from '@vanguard/shared';
import {
  EW_MULT,
  Simulation,
  jamLeg,
  markSpotted,
  reactOpfor,
  replay,
  resolveAssault,
  resolveChannels,
  roleUnit,
  unitPos,
} from '../src';
import { Driver, FIXTURE } from './fixtures';

function driver(settings?: Partial<SessionSettings>, behaviours: Record<string, string> = {}) {
  const d = new Driver(FIXTURE, 7, ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW']);
  if (settings) {
    // rebuild the sim with settings (Driver uses defaults)
    const full = { ewIntensity: 'normal', sensorReliability: 'normal', commsQuality: 'normal', opfor: 'adaptive', disabledMsel: [], ...settings } as SessionSettings;
    const sim = new Simulation(FIXTURE, 7, ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW'], full);
    Object.assign(d, { sim });
    (d.log as unknown[]).length = 0;
    d.seq = 0;
    d.emit('SYSTEM', { type: 'SESSION_CREATED', payload: { scenarioId: FIXTURE.id, seed: 7, enabledRoles: ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW'], settings: full } });
  }
  for (const [id, b] of Object.entries(behaviours)) d.s.units.find((u) => u.id === id)!.behaviour = b as never;
  d.joinAll().start();
  return d;
}

const place = (d: Driver, unitId: string, cell: string) => {
  d.s.units.find((u) => u.id === unitId)!.track = [{ tMs: 0, ...cellCentre(cell) }];
};
const unitCellOf = (d: Driver, id: string) => vecToCell(unitPos(d.s.units.find((u) => u.id === id)!, d.s.tMs));
const opforLog = (d: Driver) => d.s.journal.filter((j) => j.kind === 'OPFOR').map((j) => j.text);

describe('adaptive OPFOR (deterministic rules)', () => {
  it('reserve counter-attacks an objective BLUE threatens, and the assault is resolved on arrival', () => {
    const d = driver(undefined, { 'r-armour': 'reserve' });
    place(d, 'b-pla', 'D4'); // 1 cell from objective E4
    d.run(31);
    const armour = d.s.units.find((u) => u.id === 'r-armour')!;
    expect(armour.committed).toBe(true);
    expect(opforLog(d).some((t) => /counter-attack towards E4/.test(t))).toBe(true);
    d.run(120);
    expect(unitCellOf(d, 'r-armour')).toBe('E4');
    expect(opforLog(d).some((t) => /occupies E4|counter-attack at E4/.test(t))).toBe(true);
    const before = opforLog(d).length;
    d.run(60);
    expect(opforLog(d).length).toBe(before); // commits only once
  });

  it('does nothing when the session OPFOR is scripted, or for scripted units', () => {
    const d = driver({ opfor: 'scripted' }, { 'r-armour': 'reserve' });
    place(d, 'b-pla', 'D4');
    d.run(61);
    expect(opforLog(d)).toHaveLength(0);
    const d2 = driver();
    place(d2, 'b-pla', 'D4');
    d2.run(61);
    expect(opforLog(d2)).toHaveLength(0);
  });

  it('defenders fall back from a superior BLUE force', () => {
    const d = driver(undefined, { 'r-inf': 'defend' });
    place(d, 'b-plb', 'G5'); // adjacent to G6, strength 100 ≥ 1.5 × 60
    d.run(31);
    expect(opforLog(d).some((t) => /falls back/.test(t))).toBe(true);
    d.run(120);
    expect(unitCellOf(d, 'r-inf')).not.toBe('G6');
  });

  it('shoot-and-scoot relocates after being spotted, once per sighting and cooldown', () => {
    const d = driver(undefined, { 'r-inf': 'shoot-and-scoot' });
    d.run(29);
    markSpotted(d.ctx, ['r-inf']);
    d.run(2);
    expect(opforLog(d).filter((t) => /relocates/.test(t))).toHaveLength(1);
    d.run(60);
    expect(opforLog(d).filter((t) => /relocates/.test(t))).toHaveLength(1); // not re-spotted
    markSpotted(d.ctx, ['r-inf']);
    d.run(31);
    expect(opforLog(d).filter((t) => /relocates/.test(t))).toHaveLength(1); // cooldown
  });

  it('probes towards the nearest BLUE unit and breaks contact when too close', () => {
    const d = driver(undefined, { 'r-inf': 'probe' });
    d.run(31);
    expect(opforLog(d).some((t) => /probes towards/.test(t))).toBe(true);
    const d2 = driver(undefined, { 'r-inf': 'probe' });
    place(d2, 'r-inf', 'C6'); // on top of PL_B
    d2.run(31);
    expect(opforLog(d2).some((t) => /breaks contact/.test(t))).toBe(true);
  });

  it('marks units spotted when BLUE receives reports or own observation', () => {
    const d = driver();
    d.run(60);
    expect(d.s.units.find((u) => u.id === 'r-decoy')!.lastSpottedMs).toBeGreaterThan(0);
    reactOpfor(d.ctx); // safe to call outside step
  });

  it('assault outcomes follow the ratio table', () => {
    const d = driver();
    const armour = d.s.units.find((u) => u.id === 'r-armour')!;
    const pla = roleUnit(d.ctx, 'PL_A');
    resolveAssault(d.ctx, armour, 'H8');
    expect(opforLog(d).at(-1)).toMatch(/unopposed/);
    resolveAssault(d.ctx, armour, 'C3'); // 150 vs 100 → 1.5
    expect(opforLog(d).at(-1)).toMatch(/succeeds/);
    expect(pla.strength).toBe(60);
    armour.strength = 60;
    resolveAssault(d.ctx, armour, 'C3'); // 60 vs 60 → 1
    expect(opforLog(d).at(-1)).toMatch(/contested/);
    armour.strength = 20;
    resolveAssault(d.ctx, armour, 'C3');
    expect(opforLog(d).at(-1)).toMatch(/repulsed/);
    expect(armour.status).toBe('DESTROYED');
  });
});

describe('session settings (scenario variables)', () => {
  it('scale comms, sensors and EW', () => {
    const good = resolveChannels(FIXTURE, { ewIntensity: 'normal', sensorReliability: 'high', commsQuality: 'good', opfor: 'adaptive', disabledMsel: [] });
    const poor = resolveChannels(FIXTURE, { ewIntensity: 'normal', sensorReliability: 'low', commsQuality: 'poor', opfor: 'adaptive', disabledMsel: [] });
    expect(good.CMD_NET.baseLatencyS).toBeCloseTo(2.1);
    expect(poor.CMD_NET.baseLatencyS).toBeCloseTo(4.5);
    expect(good.ISR_DATALINK.baseDrop).toBeCloseTo(0.015);
    expect(poor.ISR_DATALINK.baseDrop).toBeCloseTo(0.13);
    expect(poor.RUNNER.baseLatencyS).toBe(120);
    const hi = driver({ ewIntensity: 'high' });
    hi.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J', cell: 'C6', radius: 2, bands: ['VHF'], power: 1, active: true } } });
    const J = cellCentre('C6');
    // 2.3 cells away: outside normal radius (2) but inside high (2.6)
    expect(jamLeg(hi.ctx, hi.ctx.ch.CMD_NET, { x: J.x + 2.3, y: J.y }, { x: 9, y: 9 }).level).toBe(1);
    expect(EW_MULT.low).toBe(0.75);
  });

  it('disabled MSEL items start skipped; settings survive replay', () => {
    const d = driver({ disabledMsel: ['M2', 'M3'], opfor: 'scripted' });
    expect(d.s.msel.filter((m) => m.status === 'SKIPPED').map((m) => m.id)).toEqual(['M2', 'M3']);
    d.run(600);
    expect(d.s.jammers).toHaveLength(0);
    d.emit('SYSTEM', { type: 'CLOCK_CHECKPOINT', payload: {} });
    expect(replay(FIXTURE, d.log).hash()).toBe(d.sim.hash());
  });
});
