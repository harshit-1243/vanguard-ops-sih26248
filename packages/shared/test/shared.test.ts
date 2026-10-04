import { describe, expect, it } from 'vitest';
import {
  CallsignSchema,
  CreateSessionBodySchema,
  CyberSpecSchema,
  DecisionPayloadSchema,
  DsCommandSchema,
  ScenarioSchema,
  SessionCodeSchema,
  TraineeCommandSchema,
  allCells,
  areAdjacent,
  cellCentre,
  cellIndex,
  cellSteps,
  elevationClass,
  formatAge,
  formatT,
  isCell,
  neighbours,
  reportText,
  saluteLines,
  summarizeScenario,
  terrainAt,
  vecToCell,
} from '../src';

describe('grid', () => {
  it('converts cells and vectors', () => {
    expect(isCell('D4')).toBe(true);
    expect(isCell('I1')).toBe(false);
    expect(cellIndex('D4')).toEqual({ col: 3, row: 3 });
    expect(() => cellIndex('Z9')).toThrow();
    expect(cellCentre('A1')).toEqual({ x: 0.5, y: 0.5 });
    expect(vecToCell({ x: 3.9, y: 3.1 })).toBe('D4');
    expect(vecToCell({ x: -5, y: 20 })).toBe('A8');
    expect(cellSteps('A1', 'C2')).toBe(2);
    expect(areAdjacent('D4', 'E5')).toBe(true);
    expect(neighbours('A1').sort()).toEqual(['A2', 'B1', 'B2']);
    expect(neighbours('D4')).toHaveLength(8);
    expect(allCells()).toHaveLength(64);
    expect(terrainAt(['^.......'], 'A1')).toBe('^');
    expect(terrainAt([], 'B2')).toBe('.');
    expect([elevationClass('W'), elevationClass('.'), elevationClass('H'), elevationClass('^')]).toEqual([0, 1, 2, 3]);
  });
});

describe('format', () => {
  it('formats sim time, ages and reports', () => {
    expect(formatT(0)).toBe('T+00:00');
    expect(formatT(372_000)).toBe('T+06:12');
    expect(formatT(3_725_000)).toBe('T+1:02:05');
    expect(formatAge(45_000)).toBe('45s');
    expect(formatAge(240_000)).toBe('4m');
    expect(formatAge(3_900_000)).toBe('1h05m');
    expect(reportText({ kind: 'CONTACT', cell: 'D4', unitType: 'ARMOUR', count: 6, observedAtMs: 0 })).toBe(
      'CONTACT. 6x ARMOUR at GRID D4. Time T+00:00.',
    );
    expect(reportText({ kind: 'NEGATIVE', cell: 'D4', unitType: null, count: 0, observedAtMs: 0 })).toMatch(/^NEGATIVE/);
    expect(reportText({ kind: 'RECON', cell: null, unitType: null, count: null, observedAtMs: 0 })).toMatch(
      /UNKNOWN GRID: \?x UNKNOWN/,
    );
    expect(
      reportText({ kind: 'POSREP', cell: 'A1', unitType: null, count: null, observedAtMs: 0, callsign: 'K1' }),
    ).toMatch(/K1 at GRID A1/);
    expect(reportText({ kind: 'INFO', cell: 'A1', unitType: null, count: null, observedAtMs: 0 })).toMatch(/^INFO/);
    expect(saluteLines({ kind: 'CONTACT', cell: 'D4', unitType: 'ARMOUR', count: 6, observedAtMs: 0 }).E).toBe(
      'tracked vehicles',
    );
    expect(saluteLines({ kind: 'NEGATIVE', cell: null, unitType: null, count: null, observedAtMs: 0 })).toMatchObject({
      S: 'unknown',
      A: 'no activity detected',
      U: 'unknown',
    });
  });
});

describe('schemas', () => {
  it('validates commands and bodies', () => {
    expect(CallsignSchema.parse(' viper-1 ')).toBe('VIPER-1');
    expect(() => CallsignSchema.parse('<script>')).toThrow();
    expect(SessionCodeSchema.parse('abc234')).toBe('ABC234');
    expect(() => SessionCodeSchema.parse('ABC0O1')).toThrow();
    expect(CreateSessionBodySchema.safeParse({ scenarioId: 'iron-bridge' }).success).toBe(true);
    expect(DsCommandSchema.safeParse({ type: 'SET_SPEED', speed: 3 }).success).toBe(false);
    expect(
      DsCommandSchema.safeParse({ type: 'PLACE_JAMMER', jammer: { cell: 'D4', radius: 2, bands: ['VHF'] } }).success,
    ).toBe(true);
    expect(
      TraineeCommandSchema.safeParse({ type: 'SEND_MESSAGE', channel: 'CMD_NET', to: ['CDR'], text: 'hello' }).success,
    ).toBe(true);
    expect(CyberSpecSchema.safeParse({ kind: 'GPS_SPOOF', durationS: 60 }).success).toBe(false);
  });

  it('requires rationale of at least 15 chars and targets/channels per action', () => {
    const base = { action: 'ADVANCE', confidence: 50, rationale: 'short', intentSelf: 'YES' } as const;
    const long = 'long enough rationale text';
    expect(DecisionPayloadSchema.safeParse(base).success).toBe(false);
    expect(DecisionPayloadSchema.safeParse({ ...base, rationale: long }).success).toBe(false);
    expect(DecisionPayloadSchema.safeParse({ ...base, rationale: long, targetCell: 'D4' }).success).toBe(true);
    expect(DecisionPayloadSchema.safeParse({ ...base, action: 'SWITCH_CHANNEL', rationale: long }).success).toBe(false);
    expect(DecisionPayloadSchema.safeParse({ ...base, action: 'HOLD', rationale: long }).success).toBe(true);
  });

  it('rejects malformed scenarios with path-specific errors', () => {
    expect(ScenarioSchema.safeParse({ id: 'X Y' }).success).toBe(false);
    const pace = (b: string) => ['CMD_NET', b, 'HF_NET', 'RUNNER'];
    const wp = [{ atS: 0, cell: 'A1' }];
    const bad = {
      id: 'mini',
      title: 'Mini',
      theatre: 't',
      summary: 's',
      durationMin: 10,
      defaultSeed: 1,
      brief: { situation: 's', mission: 'm', execution: 'e' },
      terrain: Array(8).fill('........'),
      intent: { text: 'Hold the line here.', objectiveCells: ['D4'], priority: 'DEFEND', deadlineS: 600 },
      objectives: [{ id: 'o', text: 'o', cell: 'D4' }],
      roles: [
        { id: 'PL_A', title: 'A', callsign: 'A', superior: 'EW', unitId: 'nope', pace: pace('PL_NET_A') },
        { id: 'PL_B', title: 'B', callsign: 'B', superior: 'HHQ', unitId: 'b', pace: pace('PL_NET_B') },
      ],
      units: [
        { id: 'b', side: 'BLUE', callsign: 'B', type: 'MECH', count: 1, strength: 1, waypoints: wp },
        { id: 'b', side: 'RED', callsign: 'R', type: 'MECH', count: 1, strength: 1, waypoints: wp },
      ],
      air: { availableFromS: 0 },
      scriptedReports: [
        { atS: 1, from: 'ghost', fromLabel: 'g', channel: 'SATCOM', to: ['PL_B'], kind: 'INFO', text: 'x' },
      ],
      msel: [
        { id: 'M1', atS: 1, title: 't', action: { kind: 'JAMMER_TOGGLE', jammerId: 'j', active: true } },
        { id: 'M1', atS: 2, title: 't', action: { kind: 'JAMMER_TOGGLE', jammerId: 'j', active: false } },
      ],
      probeBank: [
        { kind: 'FEATURE_STATUS', featureId: 'nope' },
        { kind: 'HOSTILE_LOCATION', unitId: 'nope', label: 'x' },
        { kind: 'FRIENDLY_LOCATION', role: 'EW' },
      ],
    };
    const res = ScenarioSchema.safeParse(bad);
    expect(res.success).toBe(false);
    const msgs = res.error!.issues.map((i) => i.message);
    for (const m of [
      'duplicate unit id',
      'CDR role is required',
      'unknown BLUE unit',
      'unknown role',
      'unknown node',
      'duplicate MSEL id',
      'unknown feature',
      'unknown unit',
    ]) {
      expect(msgs).toContain(m);
    }
  });

  it('summarizes scenarios', () => {
    const s = summarizeScenario({
      id: 'x',
      title: 'X',
      theatre: 't',
      summary: 's',
      durationMin: 1,
      defaultSeed: 1,
      msel: [{}],
      roles: [{ id: 'CDR', title: 'C', callsign: 'K', optional: false, description: '' }],
    } as never);
    expect(s).toMatchObject({ id: 'x', mselCount: 1, roles: [{ id: 'CDR' }] });
  });
});
