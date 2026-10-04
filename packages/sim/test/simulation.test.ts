import { describe, expect, it } from 'vitest';
import { cellCentre, type DecisionPayload, type SimEvent } from '@vanguard/shared';
import { roleUnit, SimRejection, unitPos } from '../src';
import { Driver, FIXTURE, started } from './fixtures';

const decision = (o: Partial<DecisionPayload>): DecisionPayload => ({
  action: 'HOLD', confidence: 70, rationale: 'Holding until picture clarifies', basedOn: [], intentSelf: 'YES', ...o,
});

describe('lifecycle & guards', () => {
  it('runs lobby → running → paused → running → ended', () => {
    const d = new Driver();
    expect(() => d.emit('DS', { type: 'EXERCISE_PAUSED', payload: {} })).toThrow(SimRejection);
    d.joinAll().start();
    expect(() => d.emit('DS', { type: 'EXERCISE_STARTED', payload: {} })).toThrow(/already/);
    d.emit('DS', { type: 'SPEED_SET', payload: { speed: 4 } });
    expect(d.s.speed).toBe(4);
    d.emit('DS', { type: 'EXERCISE_PAUSED', payload: {} });
    expect(() => d.sim.step()).toThrow(/PAUSED/);
    expect(() => d.emit('DS', { type: 'EXERCISE_PAUSED', payload: {} })).toThrow(/Not running/);
    d.emit('DS', { type: 'EXERCISE_RESUMED', payload: {} });
    expect(() => d.emit('DS', { type: 'EXERCISE_RESUMED', payload: {} })).toThrow(/Not paused/);
    d.run(3);
    d.emit('DS', { type: 'EXERCISE_ENDED', payload: {} });
    expect(d.s.phase).toBe('ENDED');
    expect(() => d.emit('DS', { type: 'EXERCISE_PAUSED', payload: {} })).toThrow(/ended/);
  });

  it('rejects stale seq / wrong time / unknown actors', () => {
    const d = started();
    const e = { type: 'EXERCISE_PAUSED', payload: {}, seq: 1, tSimMs: 0, actor: 'DS' } as SimEvent;
    expect(() => d.sim.apply(e)).toThrow(/already applied/);
    expect(() => d.sim.apply({ ...e, seq: 999, tSimMs: 5000 })).toThrow(/time/);
    expect(() => d.emit('DS', { type: 'PACE_SWITCHED', payload: { channel: 'HF_NET' } })).toThrow(/role actor/);
    expect(() => d.emit('NLO', { type: 'PACE_SWITCHED', payload: { channel: 'HF_NET' } })).toThrow(/not enabled/);
  });

  it('joins and leaves roles', () => {
    const d = new Driver();
    d.emit('SYSTEM', { type: 'ROLE_JOINED', payload: { roleId: 'PL_A', callsign: 'VIPER' } });
    expect(() => d.emit('SYSTEM', { type: 'ROLE_JOINED', payload: { roleId: 'PL_A', callsign: 'X' } })).toThrow(/taken/);
    expect(() => d.emit('SYSTEM', { type: 'ROLE_JOINED', payload: { roleId: 'NLO', callsign: 'X' } })).toThrow(/not enabled/);
    d.emit('SYSTEM', { type: 'ROLE_LEFT', payload: { roleId: 'PL_A' } });
    expect(d.s.roles.PL_A!.joined).toBe(false);
  });

  it('DS can set intent which reaches every role instantly', () => {
    const d = new Driver();
    d.emit('DS', { type: 'INTENT_SET', payload: { text: 'New HHQ intent for everyone.' } });
    expect(d.s.roles.PL_B!.intent).toMatchObject({ version: 2, byCallsign: 'HHQ' });
  });
});

describe('MSEL, injects, jammers, cyber', () => {
  it('auto-fires MSEL items at their time and supports skip / edit / fire-now', () => {
    const d = started();
    expect(() => new Driver().emit('DS', { type: 'MSEL_FIRED', payload: { mselId: 'M1' } })).toThrow(/Start/);
    d.emit('DS', { type: 'MSEL_SKIPPED', payload: { mselId: 'M3' } });
    d.emit('DS', { type: 'MSEL_EDITED', payload: { mselId: 'M4', atS: 30 } });
    d.emit('DS', { type: 'MSEL_FIRED', payload: { mselId: 'M5' } });
    expect(() => d.emit('DS', { type: 'MSEL_FIRED', payload: { mselId: 'M5' } })).toThrow(/FIRED/);
    expect(() => d.emit('DS', { type: 'MSEL_SKIPPED', payload: { mselId: 'nope' } })).toThrow(/Unknown/);
    d.run(61);
    const st = Object.fromEntries(d.s.msel.map((m) => [m.id, m.status]));
    expect(st).toMatchObject({ M1: 'FIRED', M3: 'SKIPPED', M4: 'FIRED', M5: 'FIRED', M2: 'PENDING' });
    expect(d.s.injects[0]!.source).toBe('MSEL');
    d.run(400);
    expect(d.s.jammers.find((j) => j.id === 'J-M2')!.active).toBe(true);
  });

  it('places, moves, toggles and removes jammers', () => {
    const d = started();
    d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J1', cell: 'A1', radius: 1, bands: ['VHF'], power: 1, active: true } } });
    expect(() => d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J1', cell: 'A1', radius: 1, bands: ['VHF'], power: 1, active: true } } })).toThrow(/Duplicate/);
    d.emit('DS', { type: 'JAMMER_MOVED', payload: { jammerId: 'J1', cell: 'C6' } });
    expect(d.s.jammers[0]!.pos).toEqual(cellCentre('C6'));
    d.emit('DS', { type: 'JAMMER_TOGGLED', payload: { jammerId: 'J1', active: false } });
    expect(d.s.jammers[0]!.active).toBe(false);
    d.emit('DS', { type: 'JAMMER_REMOVED', payload: { jammerId: 'J1' } });
    expect(d.s.jammers).toHaveLength(0);
    expect(() => d.emit('DS', { type: 'JAMMER_TOGGLED', payload: { jammerId: 'J1', active: true } })).toThrow(/Unknown jammer/);
  });

  it('injects and cyber events expire and register latency triggers', () => {
    const d = started();
    expect(() => new Driver().emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'I', inject: { type: 'DELAY', channels: ['CMD_NET'], roles: [], durationS: 10, params: {} } } })).toThrow(/Start/);
    expect(() => new Driver().emit('DS', { type: 'CYBER_TRIGGERED', payload: { cyberId: 'C', cyber: { kind: 'C2_OUTAGE', durationS: 10 } } })).toThrow(/Start/);
    d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'I', inject: { type: 'DELAY', channels: ['CMD_NET'], roles: [], durationS: 10, params: {} } } });
    d.emit('DS', { type: 'CYBER_TRIGGERED', payload: { cyberId: 'G', cyber: { kind: 'GPS_SPOOF', role: 'PL_A', durationS: 20 } } });
    expect(d.s.triggers.filter((t) => t.label === 'Inject DELAY').map((t) => t.role).sort()).toEqual(['ALO', 'CDR', 'EW', 'PL_A', 'PL_B']);
    expect(d.s.roles.PL_A!.gps).not.toBeNull();
    d.run(21);
    expect(d.s.injects[0]!.expired).toBe(true);
    expect(d.s.roles.PL_A!.gps).toBeNull();
    expect(d.s.journal.some((j) => j.kind === 'CYBER_END')).toBe(true);
  });

  it('CONFLICT inject with target cell sends an immediate contradictory pair', () => {
    const d = started();
    d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'C', inject: { type: 'CONFLICT', channels: ['CMD_NET'], roles: ['PL_A'], durationS: 60, params: { targetCell: 'D5' } } } });
    d.run(8);
    const items = d.s.roles.PL_A!.intel.filter((i) => i.cell === 'D5');
    expect(items.map((i) => i.kind).sort()).toEqual(['CONTACT', 'NEGATIVE']);
  });

  it('SPOOF inject injects false contacts every 30 s', () => {
    const d = started();
    d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'S', inject: { type: 'SPOOF', channels: ['CMD_NET'], roles: ['PL_B'], durationS: 70, params: { targetCell: 'D6' } } } });
    d.run(75);
    const spoofs = d.s.roles.PL_B!.intel.filter((i) => i.cell === 'D6' && i.kind === 'CONTACT');
    expect(spoofs.length).toBeGreaterThanOrEqual(2);
    expect(spoofs.every((i) => d.s.reportMeta[i.id]!.spoofed)).toBe(true);
  });

  it('bridge is destroyed at its time unless BLUE holds it', () => {
    const d = started();
    d.run(1200);
    expect(d.s.features[0]!.intact).toBe(false);
    const d2 = started();
    roleUnit(d2.ctx, 'PL_B').track = [{ tMs: 0, ...cellCentre('E4') }];
    d2.run(1200);
    expect(d2.s.features[0]!.intact).toBe(true);
  });
});

describe('trainee actions', () => {
  it('messages travel through degradation and show up for recipients', () => {
    const d = started();
    expect(() => d.emit('PL_A', { type: 'MESSAGE_SENT', payload: { channel: 'PL_NET_B', to: ['CDR'], text: 'x' } })).toThrow(/not on/);
    expect(() => d.emit('PL_A', { type: 'MESSAGE_SENT', payload: { channel: 'CMD_NET', to: ['PL_A'], text: 'x' } })).toThrow(/recipients/);
    d.emit('PL_A', { type: 'MESSAGE_SENT', payload: { channel: 'CMD_NET', to: ['CDR', 'PL_B'], text: 'Contact front, wait out' } });
    expect(d.s.roles.PL_A!.sent).toHaveLength(1);
    d.run(6);
    const got = ['CDR', 'PL_B'].filter((r) => d.s.roles[r as 'CDR']!.messages.some((m) => m.text.includes('wait') || m.corrupted));
    expect(got.length).toBeGreaterThanOrEqual(1);
  });

  it('forwards intel, flags conflicts and requests verification', () => {
    const d = started();
    d.run(60);
    const it0 = d.s.roles.CDR!.intel.find((i) => i.kind === 'CONTACT')!;
    d.emit('CDR', { type: 'INTEL_FORWARDED', payload: { itemId: it0.id, channel: 'CMD_NET', to: ['PL_A'] } });
    expect(() => d.emit('CDR', { type: 'INTEL_FORWARDED', payload: { itemId: 'nope', channel: 'CMD_NET', to: ['PL_A'] } })).toThrow(/Unknown/);
    expect(() => d.emit('CDR', { type: 'INTEL_FORWARDED', payload: { itemId: it0.id, channel: 'ISR_DATALINK', to: ['PL_A'] } })).toThrow(/not on/);
    expect(() => d.emit('CDR', { type: 'INTEL_FORWARDED', payload: { itemId: it0.id, channel: 'CMD_NET', to: ['CDR'] } })).toThrow(/recipients/);
    d.run(6);
    expect(d.s.roles.PL_A!.intel.some((i) => i.forwardedBy === 'KESTREL 6')).toBe(true);
    expect(d.s.stats.roles.CDR!.forwarded).toBe(1);
    d.emit('CDR', { type: 'CONFLICT_FLAGGED', payload: { itemIds: [it0.id] } });
    expect(() => d.emit('CDR', { type: 'CONFLICT_FLAGGED', payload: { itemIds: ['zz'] } })).toThrow();
    d.emit('CDR', { type: 'VERIFICATION_REQUESTED', payload: { itemId: it0.id } });
    expect(() => d.emit('CDR', { type: 'VERIFICATION_REQUESTED', payload: { itemId: 'zz' } })).toThrow();
    d.run(70);
    expect(d.s.roles.CDR!.intel.some((i) => i.kind === 'RECON' && i.sourceLabel === 'VERIFICATION PATROL')).toBe(true);
  });

  it('PACE switch is logged; invalid channel rejected', () => {
    const d = started();
    d.emit('PL_B', { type: 'PACE_SWITCHED', payload: { channel: 'HF_NET' } });
    d.emit('PL_B', { type: 'PACE_SWITCHED', payload: { channel: 'HF_NET' } }); // no-op
    expect(d.s.roles.PL_B!.paceSwitches).toHaveLength(1);
    expect(() => d.emit('PL_B', { type: 'PACE_SWITCHED', payload: { channel: 'SATCOM' } })).toThrow(/not on/);
  });

  it('CDR intent refinement propagates through degradation; cut-off roles keep the old version', () => {
    const d = started();
    expect(() => d.emit('PL_A', { type: 'INTENT_UPDATED', payload: { text: 'I am not the commander here' } })).toThrow(/Only the CDR/);
    d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J', cell: 'C6', radius: 2, bands: ['VHF', 'HF'], power: 1, active: true } } });
    d.run(2);
    expect(d.s.roles.PL_B!.cutOff).toBe(true);
    // CDR is in the jammer's outer zone: move intent traffic to SATCOM (SHF, unjammed).
    d.emit('CDR', { type: 'PACE_SWITCHED', payload: { channel: 'SATCOM' } });
    d.emit('CDR', { type: 'INTENT_UPDATED', payload: { text: 'Bypass the bridge, seize the ford at H4.' } });
    expect(d.s.roles.CDR!.intent.version).toBe(2);
    d.run(30);
    expect(d.s.roles.PL_B!.intent.version).toBe(1);
    expect(d.s.roles.ALO!.intent.version).toBe(2);
  });

  it('EW frequency hop with cooldown', () => {
    const d = started();
    expect(() => d.emit('PL_A', { type: 'FREQ_HOP', payload: { channel: 'CMD_NET' } })).toThrow(/Only the EW/);
    expect(() => d.emit('EW', { type: 'FREQ_HOP', payload: { channel: 'RUNNER' } })).toThrow(/Runner/);
    d.emit('EW', { type: 'FREQ_HOP', payload: { channel: 'CMD_NET' } });
    d.run(61);
    expect(() => d.emit('EW', { type: 'FREQ_HOP', payload: { channel: 'CMD_NET' } })).toThrow(/cooldown/);
    d.run(120);
    d.emit('EW', { type: 'FREQ_HOP', payload: { channel: 'CMD_NET' } });
  });

  it('journals cut-off start and end', () => {
    const d = started();
    d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J', cell: 'C6', radius: 2, bands: ['VHF', 'HF'], power: 1, active: true } } });
    d.run(1);
    d.emit('DS', { type: 'JAMMER_TOGGLED', payload: { jammerId: 'J', active: false } });
    d.run(1);
    const kinds = d.s.journal.map((j) => j.kind);
    expect(kinds).toContain('CUTOFF_START');
    expect(kinds).toContain('CUTOFF_END');
    expect(kinds).toContain('LINK_CHANGE');
    expect(d.s.roles.PL_B!.cutOffSpans[0]!.endMs).toBe(2000);
  });
});

describe('decisions', () => {
  it('records knowable + truth snapshots, adjudicates and moves the unit', () => {
    const d = started();
    d.run(60);
    const intelIds = d.s.roles.PL_A!.intel.map((i) => i.id);
    d.emit('PL_A', { type: 'DECISION_MADE', payload: decision({ action: 'ADVANCE', targetCell: 'D3', basedOn: [...intelIds.slice(0, 1), 'bogus'] }) });
    const rec = d.s.decisions[0]!;
    expect(rec.adjudication.soundness).toBeDefined();
    expect(rec.basedOn).not.toContain('bogus');
    expect(rec.knowable.ownCell).toBe('C3');
    expect(rec.truth.ownCell).toBe('C3');
    expect(rec.intentScore).toBe(1);
    d.run(130);
    expect(unitPos(roleUnit(d.ctx, 'PL_A'), d.s.tMs)).toEqual(cellCentre('D3'));
    expect(rec.effects.some((e) => /occupied|cleared|engaged|repulsed/.test(e))).toBe(true);
  });

  it('rejects decisions from unjoined roles and while not live', () => {
    const d = new Driver();
    d.emit('SYSTEM', { type: 'ROLE_JOINED', payload: { roleId: 'CDR', callsign: 'A' } });
    expect(() => d.emit('CDR', { type: 'DECISION_MADE', payload: decision({}) })).toThrow(/Not allowed/);
    d.start();
    expect(() => d.emit('PL_A', { type: 'DECISION_MADE', payload: decision({}) })).toThrow(/Join/);
    expect(() => d.emit('CDR', { type: 'DECISION_MADE', payload: decision({ action: 'SWITCH_CHANNEL', channel: 'PL_NET_A' }) })).not.toThrow();
    expect(() => d.emit('CDR', { type: 'DECISION_MADE', payload: decision({ action: 'SWITCH_CHANNEL', channel: 'ISR_DATALINK' }) })).toThrow(/not on/);
  });

  it('GPS spoof makes a movement order land in the wrong place', () => {
    const d = started();
    d.emit('DS', { type: 'CYBER_TRIGGERED', payload: { cyberId: 'G', cyber: { kind: 'GPS_SPOOF', role: 'PL_A', durationS: 900, driftCells: 2 } } });
    d.run(61);
    d.emit('PL_A', { type: 'DECISION_MADE', payload: decision({ action: 'REPOSITION', targetCell: 'D4' }) });
    expect(d.s.decisions[0]!.effects[0]).toMatch(/GPS error/);
  });

  it('HOLD, WITHDRAW, recon (patrol + UAV/radar retask), air, relay, switch', () => {
    const d = new Driver(FIXTURE, 7, ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW', 'NLO']).joinAll().start();
    d.emit('PL_A', { type: 'DECISION_MADE', payload: decision({ action: 'WITHDRAW', targetCell: 'A1' }) });
    expect(roleUnit(d.ctx, 'PL_A').engage).toBeNull();
    d.emit('PL_A', { type: 'DECISION_MADE', payload: decision({ action: 'HOLD' }) });
    d.emit('PL_B', { type: 'DECISION_MADE', payload: decision({ action: 'REQUEST_RECON', targetCell: 'D2' }) });
    expect(d.s.scheduled).toHaveLength(1);
    d.emit('ALO', { type: 'DECISION_MADE', payload: decision({ action: 'REQUEST_RECON', targetCell: 'G6' }) });
    expect(d.s.sensors.find((x) => x.id === 'uav-1')!.pos).toEqual(cellCentre('G6'));
    d.emit('NLO', { type: 'DECISION_MADE', payload: decision({ action: 'REQUEST_RECON', targetCell: 'B7' }) });
    expect(d.s.sensors.find((x) => x.id === 'radar-1')!.taskedBy).toBe('NLO');
    d.emit('PL_B', { type: 'DECISION_MADE', payload: decision({ action: 'CALL_AIR', targetCell: 'F4' }) });
    expect(d.s.decisions.at(-1)!.effects).toContain('No air cover — no strike');
    d.emit('ALO', { type: 'DECISION_MADE', payload: decision({ action: 'CALL_AIR', targetCell: 'F4' }) });
    expect(d.s.air.onStationAtMs).toBe(300_000);
    d.emit('EW', { type: 'DECISION_MADE', payload: decision({ action: 'RELAY', targetCell: 'D5' }) });
    expect(d.s.relays[0]!.activeFromMs).toBe(60_000);
    d.emit('EW', { type: 'DECISION_MADE', payload: decision({ action: 'RELAY', targetCell: 'D6' }) });
    expect(d.s.relays).toHaveLength(1);
    d.emit('PL_A', { type: 'DECISION_MADE', payload: decision({ action: 'RELAY', targetCell: 'C3' }) });
    expect(d.s.roles.PL_A!.actingRelay).toBe(true);
    d.emit('PL_B', { type: 'DECISION_MADE', payload: decision({ action: 'SWITCH_CHANNEL', channel: 'HF_NET' }) });
    expect(d.s.roles.PL_B!.activeChannel).toBe('HF_NET');
    d.run(400);
    expect(d.s.journal.some((j) => j.kind === 'STRIKE')).toBe(true);
    expect(d.s.roles.PL_B!.intel.some((i) => i.kind === 'RECON')).toBe(true);
    // Once air is on station, other roles can call it too.
    d.emit('PL_B', { type: 'DECISION_MADE', payload: decision({ action: 'CALL_AIR', targetCell: 'G6' }) });
    expect(d.s.decisions.at(-1)!.effects[0]).toMatch(/Strike/);
  });

  it('destroyed units do not move', () => {
    const d = started();
    roleUnit(d.ctx, 'PL_A').status = 'DESTROYED';
    d.emit('PL_A', { type: 'DECISION_MADE', payload: decision({ action: 'ADVANCE', targetCell: 'D3' }) });
    expect(d.s.decisions[0]!.effects[0]).toMatch(/not combat-effective/);
  });
});

describe('SAGAT probes', () => {
  it('freezes, collects answers, scores and restores phase', () => {
    const d = started();
    d.run(30);
    d.emit('DS', { type: 'PROBE_STARTED', payload: { probeId: 'P1' } });
    expect(d.s.phase).toBe('PROBE');
    expect(() => d.emit('DS', { type: 'PROBE_STARTED', payload: { probeId: 'P2' } })).toThrow();
    expect(() => d.emit('PL_A', { type: 'MESSAGE_SENT', payload: { channel: 'CMD_NET', to: ['CDR'], text: 'hi' } })).toThrow(/PROBE/);
    const qs = d.s.probes[0]!.questions.PL_A!;
    expect(qs.map((q) => q.kind)).toEqual(['HOSTILE_COUNT', 'FRIENDLY_LOCATION', 'FEATURE_STATUS', 'LINK_STATUS']);
    const truth = Object.fromEntries(qs.map((q) => [q.id, q.truth]));
    d.emit('PL_A', { type: 'PROBE_ANSWERED', payload: { probeId: 'P1', answers: truth } });
    expect(() => d.emit('PL_A', { type: 'PROBE_ANSWERED', payload: { probeId: 'P1', answers: truth } })).toThrow(/Already/);
    d.emit('PL_B', { type: 'PROBE_ANSWERED', payload: { probeId: 'P1', answers: {} } });
    expect(Object.values(d.s.probes[0]!.scores.PL_A!)).toEqual([1, 1, 1, 1]);
    expect(Object.values(d.s.probes[0]!.scores.PL_B!)).toEqual([0, 0, 0, 0]);
    d.emit('DS', { type: 'PROBE_ENDED', payload: { probeId: 'P1' } });
    expect(d.s.phase).toBe('RUNNING');
    expect(() => d.emit('DS', { type: 'PROBE_ENDED', payload: { probeId: 'P1' } })).toThrow(/No open/);
    expect(() => d.emit('PL_A', { type: 'PROBE_ANSWERED', payload: { probeId: 'P1', answers: {} } })).toThrow(/No open/);
    expect(() => new Driver().emit('DS', { type: 'PROBE_STARTED', payload: { probeId: 'P9' } })).toThrow(/live/);
  });

  it('ending the exercise closes open probes and cut-off spans', () => {
    const d = started();
    d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J', cell: 'C6', radius: 2, bands: ['VHF', 'HF'], power: 1, active: true } } });
    d.run(1);
    d.emit('DS', { type: 'PROBE_STARTED', payload: { probeId: 'P1' } });
    d.emit('DS', { type: 'EXERCISE_ENDED', payload: {} });
    expect(d.s.probes[0]!.endedAtMs).toBe(1000);
    expect(d.s.roles.PL_B!.cutOffSpans[0]!.endMs).toBe(1000);
  });
});
