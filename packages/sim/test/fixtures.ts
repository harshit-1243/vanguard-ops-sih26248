import {
  ScenarioSchema,
  type ScenarioInput,
  type RoleId,
  type Scenario,
  type SimEvent,
  type InputEventBody,
  type Actor,
} from '@vanguard/shared';
import { Simulation } from '../src';

/**
 * "Test Valley" — compact fixture with known geometry:
 *   ridge at E2 and E6, river row 4 with bridge at E4, sea at A8/B8.
 *   CDR B5 · PL_A C3 · PL_B C6 · ALO B5 · EW B6 · NLO A7 (optional)
 *   RED armour F4 → E5 by T+600 · decoys D2 · infantry G6 · ship B8
 */
export const FIXTURE_INPUT: ScenarioInput = {
  id: 'test-valley',
  title: 'Test Valley',
  theatre: 'Test',
  summary: 'Fixture scenario for unit tests.',
  durationMin: 30,
  defaultSeed: 7,
  brief: { situation: 's', mission: 'm', execution: 'e' },
  terrain: ['........', '....^...', '........', '~~~~=~~~', '........', '....^...', '........', 'WW......'],
  features: [
    { id: 'bridge', kind: 'BRIDGE', label: 'Test Bridge', cell: 'E4', destroyAtS: 1200, unlessBlueIn: ['E4', 'E5'] },
  ],
  intent: {
    text: 'Seize the bridge at E4 intact; avoid H1.',
    objectiveCells: ['E4'],
    forbiddenCells: ['H1'],
    priority: 'SEIZE',
    deadlineS: 1200,
  },
  objectives: [{ id: 'o1', text: 'Seize bridge', cell: 'E4' }],
  roles: [
    { id: 'CDR', title: 'Sub-unit Commander', callsign: 'KESTREL 6', superior: 'HHQ', unitId: 'b-hq', pace: ['CMD_NET', 'SATCOM', 'HF_NET', 'RUNNER'] },
    { id: 'PL_A', title: 'Platoon Cdr A', callsign: 'KESTREL 1', superior: 'CDR', unitId: 'b-pla', pace: ['CMD_NET', 'PL_NET_A', 'HF_NET', 'RUNNER'] },
    { id: 'PL_B', title: 'Platoon Cdr B', callsign: 'KESTREL 2', superior: 'CDR', unitId: 'b-plb', pace: ['CMD_NET', 'PL_NET_B', 'HF_NET', 'RUNNER'] },
    { id: 'ALO', title: 'Air Liaison', callsign: 'HAWK 1', superior: 'CDR', unitId: 'b-tacp', pace: ['CMD_NET', 'SATCOM', 'HF_NET', 'RUNNER'] },
    { id: 'EW', title: 'EW Officer', callsign: 'SPECTRE', superior: 'CDR', unitId: 'b-ew', pace: ['CMD_NET', 'PL_NET_B', 'HF_NET', 'RUNNER'] },
    { id: 'NLO', title: 'Naval Liaison', callsign: 'TRIDENT', superior: 'CDR', unitId: 'b-nlo', pace: ['SATCOM', 'CMD_NET', 'HF_NET', 'RUNNER'], optional: true },
  ],
  nodes: [{ id: 'HHQ', label: 'Higher HQ', pos: { x: -2, y: 4 } }],
  units: [
    { id: 'b-hq', side: 'BLUE', callsign: 'KESTREL 6', type: 'HQ', count: 3, strength: 60, ownerRole: 'CDR', waypoints: [{ atS: 0, cell: 'B5' }] },
    { id: 'b-pla', side: 'BLUE', callsign: 'KESTREL 1', type: 'INFANTRY', count: 3, strength: 100, ownerRole: 'PL_A', waypoints: [{ atS: 0, cell: 'C3' }] },
    { id: 'b-plb', side: 'BLUE', callsign: 'KESTREL 2', type: 'MECH', count: 4, strength: 100, ownerRole: 'PL_B', waypoints: [{ atS: 0, cell: 'C6' }] },
    { id: 'b-tacp', side: 'BLUE', callsign: 'HAWK 1', type: 'TACP', count: 1, strength: 20, ownerRole: 'ALO', waypoints: [{ atS: 0, cell: 'B5' }] },
    { id: 'b-ew', side: 'BLUE', callsign: 'SPECTRE', type: 'EW_DET', count: 1, strength: 20, ownerRole: 'EW', waypoints: [{ atS: 0, cell: 'B6' }] },
    { id: 'b-nlo', side: 'BLUE', callsign: 'TRIDENT', type: 'HQ', count: 1, strength: 10, ownerRole: 'NLO', waypoints: [{ atS: 0, cell: 'A7' }] },
    { id: 'r-armour', side: 'RED', callsign: 'HOSTILE ARMOUR', type: 'ARMOUR', count: 6, strength: 150, waypoints: [{ atS: 0, cell: 'F4' }, { atS: 600, cell: 'E5' }] },
    { id: 'r-decoy', side: 'RED', callsign: 'DECOY GP', type: 'ARMOUR', count: 4, strength: 0, decoy: true, waypoints: [{ atS: 0, cell: 'D2' }] },
    { id: 'r-inf', side: 'RED', callsign: 'HOSTILE INF', type: 'INFANTRY', count: 3, strength: 60, waypoints: [{ atS: 0, cell: 'G6' }] },
    { id: 'r-ship', side: 'RED', callsign: 'PATROL CRAFT', type: 'SHIP', count: 2, strength: 50, waypoints: [{ atS: 0, cell: 'B8' }] },
  ],
  sensors: [
    { id: 'uav-1', kind: 'UAV', label: 'UAV HERON-X', channel: 'ISR_DATALINK', cell: 'E3', rangeCells: 2.5, intervalS: 30, deliverTo: ['ALO', 'CDR'], ownerRole: 'ALO' },
    { id: 'gs-1', kind: 'GROUND_SENSOR', label: 'UGS LINE-D', channel: 'GROUND_SENSOR', cell: 'D2', rangeCells: 0.6, intervalS: 60, deliverTo: ['CDR', 'PL_A'], discriminatesDecoys: true, reportsNegatives: true },
    { id: 'radar-1', kind: 'COASTAL_RADAR', label: 'COASTAL RADAR', channel: 'SATCOM', cell: 'A7', rangeCells: 3, intervalS: 60, deliverTo: ['NLO', 'CDR'], detects: ['SHIP'], ownerRole: 'NLO' },
  ],
  air: { availableFromS: 300, responseS: 60, sorties: 2 },
  scriptedReports: [
    { atS: 120, from: 'HHQ', fromLabel: 'HHQ INT', channel: 'SATCOM', to: ['CDR'], kind: 'INFO', text: 'HHQ assesses hostile armour moving towards the bridge.' },
  ],
  msel: [
    { id: 'M1', atS: 60, title: 'SATCOM delay', action: { kind: 'INJECT', inject: { type: 'DELAY', channels: ['SATCOM'], durationS: 120, params: { delayS: 90 } } } },
    { id: 'M2', atS: 400, title: 'Hostile jammer', action: { kind: 'JAMMER', jammer: { id: 'J-M2', cell: 'C6', radius: 2, bands: ['VHF', 'HF'], power: 1 } } },
    { id: 'M3', atS: 500, title: 'C2 outage', action: { kind: 'CYBER', cyber: { kind: 'C2_OUTAGE', durationS: 60 } } },
    { id: 'M4', atS: 700, title: 'Jammer off', action: { kind: 'JAMMER_TOGGLE', jammerId: 'J-M2', active: false } },
    { id: 'M5', atS: 800, title: 'Report', action: { kind: 'REPORT', report: { from: 'HHQ', fromLabel: 'HHQ', channel: 'HF_NET', to: ['CDR'], kind: 'INFO', text: 'Convoy sighted.' } } },
  ],
  probeBank: [
    { kind: 'HOSTILE_COUNT', cell: 'D2' },
    { kind: 'FRIENDLY_LOCATION', role: 'PL_B' },
    { kind: 'FEATURE_STATUS', featureId: 'bridge' },
    { kind: 'DECOY_ASSESS', cell: 'D2' },
    { kind: 'HOSTILE_LOCATION', unitId: 'r-armour', label: 'hostile armour group' },
  ],
};

export const FIXTURE: Scenario = ScenarioSchema.parse(FIXTURE_INPUT);

/** Helper that drives a Simulation like the server does (seq + tSimMs bookkeeping). */
export class Driver {
  seq = 0;
  readonly log: SimEvent[] = [];
  readonly sim: Simulation;

  constructor(
    readonly scenario: Scenario = FIXTURE,
    readonly seed = 7,
    readonly enabled: RoleId[] = ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW'],
  ) {
    this.sim = new Simulation(scenario, seed, enabled);
    this.emit('SYSTEM', { type: 'SESSION_CREATED', payload: { scenarioId: scenario.id, seed, enabledRoles: enabled } });
  }

  emit(actor: Actor, body: InputEventBody): SimEvent {
    const e = { ...body, seq: this.seq + 1, tSimMs: this.sim.state.tMs, actor } as SimEvent;
    this.sim.apply(e);
    this.seq += 1;
    this.log.push(e);
    return e;
  }

  joinAll(): this {
    for (const r of this.enabled) this.emit('SYSTEM', { type: 'ROLE_JOINED', payload: { roleId: r, callsign: `P-${r}` } });
    return this;
  }

  start(): this {
    this.emit('DS', { type: 'EXERCISE_STARTED', payload: {} });
    return this;
  }

  run(seconds: number): this {
    for (let i = 0; i < seconds; i++) this.sim.step();
    return this;
  }

  get s() {
    return this.sim.state;
  }
  get ctx() {
    return this.sim.ctx;
  }
}

export function started(enabled?: RoleId[], seed = 7): Driver {
  return new Driver(FIXTURE, seed, enabled).joinAll().start();
}
