import { describe, expect, it } from 'vitest';
import { cellCentre } from '@vanguard/shared';
import {
  canonicalJson,
  chance,
  clampToGrid,
  createInitialState,
  gpsDrift,
  hashString,
  hashValue,
  isMoving,
  moveUnit,
  nextId,
  nextRandom,
  pick,
  posAt,
  randInt,
  resolveChannels,
  roleState,
  seedRng,
  SimRejection,
  stopUnit,
  uniform,
  unitCell,
} from '../src';
import { FIXTURE } from './fixtures';

describe('rng (mulberry32)', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = { rng: seedRng(1) };
    const b = { rng: seedRng(1) };
    const c = { rng: seedRng(2) };
    const sa = Array.from({ length: 5 }, () => nextRandom(a));
    const sb = Array.from({ length: 5 }, () => nextRandom(b));
    const sc = Array.from({ length: 5 }, () => nextRandom(c));
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    sa.forEach((x) => expect(x).toBeGreaterThanOrEqual(0));
    sa.forEach((x) => expect(x).toBeLessThan(1));
  });

  it('helpers respect ranges', () => {
    const r = { rng: seedRng(42) };
    for (let i = 0; i < 200; i++) {
      const u = uniform(r, -2, 2);
      expect(u).toBeGreaterThanOrEqual(-2);
      expect(u).toBeLessThan(2);
      const n = randInt(r, 1, 3);
      expect([1, 2, 3]).toContain(n);
    }
    expect(['a', 'b']).toContain(pick(r, ['a', 'b']));
    expect(() => pick(r, [])).toThrow();
    let hits = 0;
    for (let i = 0; i < 2000; i++) if (chance(r, 0.25)) hits++;
    expect(hits / 2000).toBeGreaterThan(0.2);
    expect(hits / 2000).toBeLessThan(0.3);
  });
});

describe('hash', () => {
  it('canonical JSON ignores key order and undefined', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
    expect(hashValue({ x: 1, y: 2 })).toBe(hashValue({ y: 2, x: 1 }));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('abc')).toHaveLength(14);
  });
});

describe('state', () => {
  it('creates initial state with enabled roles and defaults', () => {
    const s = createInitialState(FIXTURE, 3);
    expect(s.enabledRoles).toEqual(['ALO', 'CDR', 'EW', 'PL_A', 'PL_B']);
    expect(s.roles.NLO!.enabled).toBe(false);
    expect(s.phase).toBe('LOBBY');
    expect(s.msel.map((m) => m.id)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);
    expect(s.units.find((u) => u.id === 'r-armour')!.speed).toBe(1);
    expect(() => createInitialState(FIXTURE, 1, ['PL_A', 'PL_B'])).toThrow(/CDR/);
    expect(() => createInitialState(FIXTURE, 1, ['CDR'])).toThrow(/two roles/);
    expect(nextId(s, 'X')).toBe('X1');
    expect(nextId(s, 'X')).toBe('X2');
    expect(() => roleState(s, 'ZZ' as never)).toThrow(SimRejection);
  });

  it('applies channel overrides', () => {
    const ch = resolveChannels({ ...FIXTURE, channels: { CMD_NET: { baseLatencyS: 9 } } });
    expect(ch.CMD_NET.baseLatencyS).toBe(9);
    expect(ch.CMD_NET.members).toContain('PL_A');
  });
});

describe('tracks', () => {
  it('interpolates waypoints', () => {
    const s = createInitialState(FIXTURE, 1);
    const armour = s.units.find((u) => u.id === 'r-armour')!;
    expect(posAt(armour.track, 0)).toEqual(cellCentre('F4'));
    expect(posAt(armour.track, 300_000)).toEqual({ x: 5, y: 4 });
    expect(posAt(armour.track, 9_000_000)).toEqual(cellCentre('E5'));
    expect(unitCell(armour, 600_000)).toBe('E5');
    expect(isMoving(armour, 100)).toBe(true);
    expect(isMoving(armour, 700_000)).toBe(false);
  });

  it('moves and stops units', () => {
    const s = createInitialState(FIXTURE, 1);
    const pla = s.units.find((u) => u.id === 'b-pla')!;
    const arrive = moveUnit(pla, cellCentre('C5'), 10_000);
    expect(arrive).toBe(10_000 + 240_000); // 2 cells at 0.5 cells/min
    expect(posAt(pla.track, 130_000)).toEqual(cellCentre('C4'));
    stopUnit(pla, 130_000);
    expect(posAt(pla.track, 999_999)).toEqual(cellCentre('C4'));
  });

  it('clamps and ramps GPS drift', () => {
    expect(clampToGrid({ x: -3, y: 9 })).toEqual({ x: 0.5, y: 7.5 });
    const rs = createInitialState(FIXTURE, 1).roles.PL_A!;
    expect(gpsDrift(rs, 0)).toEqual({ x: 0, y: 0 });
    rs.gps = { dx: 2, dy: 0, startMs: 0, endMs: 120_000 };
    expect(gpsDrift(rs, 30_000)).toEqual({ x: 1, y: 0 });
    expect(gpsDrift(rs, 90_000)).toEqual({ x: 2, y: 0 });
    expect(gpsDrift(rs, 120_000)).toEqual({ x: 0, y: 0 });
  });
});
