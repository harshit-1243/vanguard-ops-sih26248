import { describe, expect, it } from 'vitest';
import type { DecisionRecord } from '@vanguard/shared';
import {
  brier,
  buildAar,
  buildReplay,
  commsEdges,
  latencyMetrics,
  outcome,
  overconfidence,
  rationaleFeedback,
  roleMetrics,
  selfAwareness,
  sustainImprove,
  teamMetrics,
  timeline,
  verificationFor,
} from '../src';
import { Driver, FIXTURE } from './fixtures';

const dec = (o: Partial<DecisionRecord> & { outcome?: number }): DecisionRecord =>
  ({
    id: 'D', role: 'PL_A', callsign: 'K1', tMs: 0, action: 'ADVANCE', targetCell: 'D4', channel: null, confidence: 80,
    rationale: 'x', basedOn: [], intentSelf: 'YES', cutOff: false,
    knowable: { ownCell: 'C3', activeChannel: 'CMD_NET', cutOff: false, intentVersion: 1, intentText: '', intel: [], openConflicts: [], outages: [], friendlies: [] },
    truth: { ownCell: 'C3', ownStrength: 100, targetCell: 'D4', hostilesInTarget: [], hostilesAdjacent: [], friendliesInTarget: [], rho: 0, airOnStation: false, features: [] },
    adjudication: { soundness: 'SOUND', rule: 'R1', reason: 'ok', outcome: o.outcome ?? 1 },
    intentScore: 1, effects: [], ...o,
  }) as DecisionRecord;

/** A played exercise with every metric exercised. */
function played(): Driver {
  const d = new Driver(FIXTURE, 21).joinAll().start();
  d.run(70);
  const cdr = d.s.roles.CDR!;
  const conflict = cdr.intel.find((i) => i.kind === 'NEGATIVE')!;
  d.emit('CDR', { type: 'CONFLICT_FLAGGED', payload: { itemIds: [conflict.id] } });
  d.emit('CDR', { type: 'DECISION_MADE', payload: { action: 'REQUEST_RECON', targetCell: 'D2', confidence: 70, rationale: 'UAV and UGS disagree on D2', basedOn: [conflict.id], intentSelf: 'YES' } });
  d.emit('PL_A', { type: 'MESSAGE_SENT', payload: { channel: 'CMD_NET', to: ['CDR'], text: 'KESTREL 1 moving' } });
  d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J', cell: 'C6', radius: 2, bands: ['VHF', 'HF'], power: 1, active: true } } });
  d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'X', inject: { type: 'DELAY', channels: ['SATCOM'], roles: [], durationS: 60, params: { delayS: 30 } } } });
  d.run(30);
  d.emit('PL_B', { type: 'DECISION_MADE', payload: { action: 'ADVANCE', targetCell: 'D5', confidence: 90, rationale: 'Cut off: closing on the bridge per intent', basedOn: [], intentSelf: 'YES' } });
  d.emit('PL_B', { type: 'PACE_SWITCHED', payload: { channel: 'HF_NET' } });
  d.emit('PL_A', { type: 'DECISION_MADE', payload: { action: 'WITHDRAW', targetCell: 'A1', confidence: 95, rationale: 'Pulling back to regroup now', basedOn: [], intentSelf: 'YES' } });
  d.run(30);
  d.emit('DS', { type: 'PROBE_STARTED', payload: { probeId: 'P1' } });
  for (const r of ['CDR', 'PL_A', 'PL_B'] as const) {
    const qs = d.s.probes[0]!.questions[r]!;
    d.emit(r, { type: 'PROBE_ANSWERED', payload: { probeId: 'P1', answers: Object.fromEntries(qs.map((q, i) => [q.id, r === 'CDR' || i === 0 ? q.truth : 'UNKNOWN'])) } });
  }
  d.emit('DS', { type: 'PROBE_ENDED', payload: { probeId: 'P1' } });
  d.run(120);
  d.emit('DS', { type: 'EXERCISE_ENDED', payload: {} });
  return d;
}

describe('metric formulas (PRD §9)', () => {
  it('Brier, overconfidence and self-awareness', () => {
    const ds = [dec({ confidence: 100, outcome: 1 }), dec({ confidence: 0, outcome: 0, adjudication: { soundness: 'UNSOUND', rule: 'R1', reason: '', outcome: 0 } })];
    expect(brier(ds)).toBe(0);
    expect(brier([dec({ confidence: 80, adjudication: { soundness: 'RISKY', rule: 'R1', reason: '', outcome: 0.5 } })])).toBe(0.09);
    expect(brier([])).toBeNull();
    expect(overconfidence([dec({ confidence: 90, adjudication: { soundness: 'UNSOUND', rule: 'R', reason: '', outcome: 0 } })])).toBe(0.9);
    expect(overconfidence([])).toBeNull();
    expect(selfAwareness([dec({ intentSelf: 'YES', intentScore: 1 }), dec({ intentSelf: 'NO', intentScore: 1 }), dec({ intentSelf: 'UNSURE' })])).toBe(0.5);
    expect(selfAwareness([dec({ intentSelf: 'UNSURE' })])).toBeNull();
  });

  it('verification and latency on a played exercise', () => {
    const d = played();
    const cdrDecision = d.s.decisions.find((x) => x.role === 'CDR')!;
    expect(verificationFor(d.ctx, cdrDecision)).toEqual({ contested: true, verified: true });
    const lat = latencyMetrics(d.ctx, 'PL_B');
    expect(lat.triggers).toBeGreaterThan(0);
    expect(lat.meanS).not.toBeNull();
    const m = roleMetrics(d.ctx, 'PL_B');
    expect(m.intent.cutOffN).toBe(1);
    expect(m.intent.cutOff).toBe(1);
    expect(m.cutOffTotalS).toBeGreaterThan(0);
    expect(m.paceResponseS).not.toBeNull();
    expect(roleMetrics(d.ctx, 'CDR').sa.mean).toBe(1);
    expect(roleMetrics(d.ctx, 'PL_A').comms.sent).toBeGreaterThan(0);
  });

  it('team metrics, edges, timeline, outcome, sustain/improve', () => {
    const d = played();
    const roles = d.s.enabledRoles.map((r) => roleMetrics(d.ctx, r));
    const team = teamMetrics(d.ctx, roles);
    expect(team.decisions).toBe(3);
    expect(team.divergenceMean).not.toBeNull();
    expect(commsEdges(d.ctx).some((e) => e.from === 'PL_A' && e.to === 'CDR')).toBe(true);
    const tl = timeline(d.ctx);
    expect(new Set(tl.map((e) => e.kind))).toEqual(expect.objectContaining({}));
    expect(tl.some((e) => e.kind === 'CUTOFF' && e.lane === 'PL_B')).toBe(true);
    expect(tl.some((e) => e.kind === 'DECISION' && e.soundness)).toBe(true);
    expect(tl.some((e) => e.kind === 'INJECT' && e.endMs !== null)).toBe(true);
    const out = outcome(d.ctx);
    expect(out.objectives).toHaveLength(1);
    expect(out.summary).toMatch(/objectives held/);
    const si = sustainImprove(roles, team);
    expect(si.sustain.length + si.improve.length).toBeGreaterThan(0);
    expect(si.sustain.some((s) => /cut off/.test(s))).toBe(true);
  });

  it('sustain/improve covers every rule branch', () => {
    const base = roleMetrics(played().ctx, 'PL_A');
    const mk = (o: Partial<typeof base>) => ({ ...base, ...o, joined: true, decisions: 3 });
    const team = { decisions: 0, brier: null, overconfidence: null, verificationRate: null, intentCutOff: null, saMean: null, divergenceMean: 0.6, deliveryRatio: 0.9, soundCounts: { SOUND: 0, RISKY: 0, UNSOUND: 0 } };
    const res = sustainImprove(
      [
        mk({ verification: { contested: 4, verified: 0, rate: 0, flags: 0, verifications: 0 }, calibration: { n: 3, brier: 0.4, meanConfidence: 0.9, meanOutcome: 0.3, overconfidence: 0.6 }, intent: { overall: 0, cutOffN: 2, cutOff: 0, selfAwareness: 0 }, sa: { perProbe: [], mean: 0.2 }, latency: { ...base.latency, noResponse: 3 } }),
        mk({ verification: { contested: 2, verified: 2, rate: 1, flags: 2, verifications: 0 }, calibration: { n: 3, brier: 0.05, meanConfidence: 0.8, meanOutcome: 0.8, overconfidence: 0 }, intent: { overall: 1, cutOffN: 0, cutOff: null, selfAwareness: 1 }, sa: { perProbe: [], mean: 0.9 }, paceResponseS: 20 }),
        mk({ calibration: { n: 3, brier: 0.3, meanConfidence: 0.5, meanOutcome: 0.5, overconfidence: 0 }, decisions: 0, intent: { overall: null, cutOffN: 0, cutOff: null, selfAwareness: null }, cutOffTotalS: 300 }),
      ],
      team,
    );
    expect(res.sustain).toHaveLength(3);
    expect(res.improve).toHaveLength(3);
  });
});

describe('AAR builder', () => {
  it('builds a four-question report with hindsight-safe decision records', () => {
    const d = played();
    const aar = buildAar(d.ctx, 'ABC234');
    expect(aar.meta.scenarioTitle).toBe('Test Valley');
    expect(aar.disclaimer).toMatch(/synthetic/);
    expect(aar.q1.msel.length).toBe(5);
    expect(aar.q3.decisions[0]!.knowable).toBeDefined();
    expect(aar.q3.decisions[0]!.truth).toBeDefined();
    expect(aar.q4.narrative.source).toBe('template');
    expect(aar.q4.narrative.text).toMatch(/1\. What was supposed to happen\?/);
    expect(Object.keys(aar.q4.rationaleFeedback)).toHaveLength(3);
    expect(aar.exec.sustain.length).toBeLessThanOrEqual(3);
  });

  it('rationale feedback reflects age, conflicts, cut-off and calibration', () => {
    const k = dec({}).knowable;
    const fb = rationaleFeedback(dec({
      basedOn: ['I1'],
      cutOff: true,
      intentScore: 0,
      confidence: 95,
      adjudication: { soundness: 'UNSOUND', rule: 'R1', reason: 'superior hostile', outcome: 0 },
      knowable: { ...k, cutOff: true, intel: [{ id: 'I1', ageMs: 600_000 } as never], openConflicts: [{ id: 'c', itemIds: ['a', 'b'], cell: 'D4', reason: 'Contact vs no-contact at D4', flagged: false }] },
    }));
    expect(fb.text).toMatch(/10m old/);
    expect(fb.text).toMatch(/conflicting/);
    expect(fb.text).toMatch(/against the stated intent/);
    expect(fb.text).toMatch(/well above/);
    expect(rationaleFeedback(dec({ confidence: 10 })).text).toMatch(/under-confident/);
    expect(rationaleFeedback(dec({ knowable: { ...k, cutOff: true }, intentScore: 0.5 })).text).toMatch(/partly/);
    expect(rationaleFeedback(dec({ knowable: { ...k, cutOff: true }, intentScore: 1 })).text).toMatch(/good mission command/);
  });

  it('replay frames rebuild truth and role views from the log', () => {
    const d = played();
    const truth = buildReplay(FIXTURE, d.log, 'truth', 10);
    expect(truth.frames[0]!.tMs).toBe(0);
    expect(truth.endMs).toBe(d.s.tMs);
    expect(truth.frames.at(-1)!.tMs).toBe(d.s.tMs);
    expect(truth.frames.some((f) => f.units.some((u) => u.decoy))).toBe(true);
    expect(truth.frames.some((f) => f.cutOff.includes('PL_B'))).toBe(true);
    expect(truth.frames.some((f) => f.note)).toBe(true);
    const role = buildReplay(FIXTURE, d.log, 'CDR', 30);
    expect(role.frames.every((f) => f.units.every((u) => u.decoy === undefined))).toBe(true);
    expect(role.frames.at(-1)!.units.some((u) => u.side === 'RED')).toBe(true);
    const ew = buildReplay(FIXTURE, d.log, 'EW', 60);
    expect(ew.frames.some((f) => f.jammers.length > 0)).toBe(true);
  });
});
