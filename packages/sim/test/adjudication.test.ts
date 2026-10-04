import { describe, expect, it } from 'vitest';
import { cellCentre, type DecisionPayload } from '@vanguard/shared';
import {
  adjudicate,
  commsDeficit,
  hostileStrength,
  intentScore,
  resolveEngagement,
  resolveStrike,
  rho,
  roleUnit,
} from '../src';
import { started } from './fixtures';

const dec = (o: Partial<DecisionPayload>): DecisionPayload => ({
  action: 'HOLD', confidence: 50, rationale: 'because of the reasons given', basedOn: [], intentSelf: 'YES', ...o,
});

describe('adjudication table (PRD §8)', () => {
  it('computes H(S) and ρ excluding decoys', () => {
    const d = started();
    expect(hostileStrength(d.ctx, 'D2')).toBe(0); // decoys only
    expect(hostileStrength(d.ctx, 'F4')).toBe(150);
    expect(hostileStrength(d.ctx, 'F5')).toBe(75 + 30); // half of armour (F4) + half of infantry (G6)
    expect(rho(d.ctx, 'F4', roleUnit(d.ctx, 'PL_A'))).toBe(1.5);
  });

  it('R1/R2 ADVANCE/REPOSITION by ρ', () => {
    const d = started();
    expect(adjudicate(d.ctx, 'PL_A', dec({ action: 'ADVANCE', targetCell: 'D2' })).soundness).toBe('SOUND');
    expect(adjudicate(d.ctx, 'PL_A', dec({ action: 'ADVANCE', targetCell: 'F4' })).soundness).toBe('UNSOUND');
    expect(adjudicate(d.ctx, 'PL_B', dec({ action: 'REPOSITION', targetCell: 'E5' })).soundness).toBe('RISKY');
  });

  it('R3 HOLD: missed opportunity vs threat', () => {
    const d = started();
    // Objective E4: armour at F4 adjacent (75) / 100 → 0.75 → not weak → SOUND
    expect(adjudicate(d.ctx, 'PL_A', dec({ action: 'HOLD' })).soundness).toBe('SOUND');
    d.s.units.find((u) => u.id === 'r-armour')!.status = 'DESTROYED';
    expect(adjudicate(d.ctx, 'PL_A', dec({ action: 'HOLD' })).reason).toMatch(/Missed opportunity/);
    const hq = roleUnit(d.ctx, 'CDR');
    hq.track = [{ tMs: 0, ...cellCentre('G6') }];
    hq.strength = 30;
    expect(adjudicate(d.ctx, 'CDR', dec({ action: 'HOLD' })).reason).toMatch(/superior threat/);
  });

  it('R4 WITHDRAW', () => {
    const d = started();
    expect(adjudicate(d.ctx, 'PL_A', dec({ action: 'WITHDRAW', targetCell: 'A1' })).soundness).toBe('RISKY');
    roleUnit(d.ctx, 'PL_A').track = [{ tMs: 0, ...cellCentre('F4') }];
    expect(adjudicate(d.ctx, 'PL_A', dec({ action: 'WITHDRAW', targetCell: 'A1' })).soundness).toBe('SOUND');
  });

  it('R5 CALL_AIR', () => {
    const d = started();
    expect(adjudicate(d.ctx, 'PL_A', dec({ action: 'CALL_AIR', targetCell: 'F4' })).reason).toMatch(/No air cover/);
    expect(adjudicate(d.ctx, 'ALO', dec({ action: 'CALL_AIR', targetCell: 'F4' })).soundness).toBe('SOUND');
    expect(adjudicate(d.ctx, 'ALO', dec({ action: 'CALL_AIR', targetCell: 'D2' })).reason).toMatch(/decoys/);
    expect(adjudicate(d.ctx, 'ALO', dec({ action: 'CALL_AIR', targetCell: 'A1' })).reason).toMatch(/No hostiles/);
    expect(adjudicate(d.ctx, 'ALO', dec({ action: 'CALL_AIR', targetCell: 'C3' })).soundness).toBe('UNSOUND');
  });

  it('R6 recon, R7 relay, R8 switch channel', () => {
    const d = started();
    expect(adjudicate(d.ctx, 'PL_A', dec({ action: 'REQUEST_RECON', targetCell: 'D2' })).soundness).toBe('SOUND');
    expect(adjudicate(d.ctx, 'EW', dec({ action: 'RELAY', targetCell: 'A1' }), () => ({ before: 3, after: 1 })).soundness).toBe('SOUND');
    expect(adjudicate(d.ctx, 'EW', dec({ action: 'RELAY', targetCell: 'A1' })).soundness).toBe('RISKY');
    expect(adjudicate(d.ctx, 'PL_B', dec({ action: 'SWITCH_CHANNEL', channel: 'HF_NET' })).soundness).toBe('SOUND');
    d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J', cell: 'C6', radius: 2, bands: ['VHF'], power: 1, active: true } } });
    expect(adjudicate(d.ctx, 'PL_B', dec({ action: 'SWITCH_CHANNEL', channel: 'HF_NET' })).reason).toMatch(/denied/);
    expect(adjudicate(d.ctx, 'PL_B', dec({ action: 'SWITCH_CHANNEL', channel: 'PL_NET_B' })).soundness).toBe('UNSOUND');
    d.s.roles.PL_B!.activeChannel = 'HF_NET';
    expect(adjudicate(d.ctx, 'PL_B', dec({ action: 'SWITCH_CHANNEL', channel: 'CMD_NET' })).soundness).toBe('UNSOUND');
    d.emit('DS', { type: 'JAMMER_REMOVED', payload: { jammerId: 'J' } });
    d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J2', cell: 'A6', radius: 3, bands: ['VHF'], power: 1, active: true } } });
    // CMD_NET PL_B–CDR degraded (outer zone), HF clear → switching to CMD_NET is worse
    expect(adjudicate(d.ctx, 'PL_B', dec({ action: 'SWITCH_CHANNEL', channel: 'CMD_NET' })).soundness).not.toBe('SOUND');
    expect(commsDeficit(d.ctx)).toBeGreaterThanOrEqual(0);
  });
});

describe('intent adherence (PRD §9.4)', () => {
  it('scores actions against intent', () => {
    const d = started();
    expect(intentScore(d.ctx, 'PL_A', dec({ action: 'ADVANCE', targetCell: 'D3' }))).toBe(1);
    expect(intentScore(d.ctx, 'PL_A', dec({ action: 'ADVANCE', targetCell: 'A1' }))).toBe(0);
    expect(intentScore(d.ctx, 'PL_A', dec({ action: 'REPOSITION', targetCell: 'C3' }))).toBe(0.5);
    expect(intentScore(d.ctx, 'PL_A', dec({ action: 'ADVANCE', targetCell: 'H1' }))).toBe(0);
    expect(intentScore(d.ctx, 'PL_A', dec({ action: 'HOLD' }))).toBe(0.5);
    expect(intentScore(d.ctx, 'PL_A', dec({ action: 'WITHDRAW', targetCell: 'A1' }))).toBe(0);
    expect(intentScore(d.ctx, 'PL_A', dec({ action: 'REQUEST_RECON', targetCell: 'E5' }))).toBe(1);
    expect(intentScore(d.ctx, 'PL_A', dec({ action: 'CALL_AIR', targetCell: 'A8' }))).toBe(0.5);
    expect(intentScore(d.ctx, 'PL_A', dec({ action: 'RELAY', targetCell: 'A8' }))).toBe(1);
    const defend = { ...d.ctx, sc: { ...d.ctx.sc, intent: { ...d.ctx.sc.intent, priority: 'DEFEND' as const } } };
    expect(intentScore(defend, 'PL_A', dec({ action: 'HOLD' }))).toBe(1);
    const preserve = { ...d.ctx, sc: { ...d.ctx.sc, intent: { ...d.ctx.sc.intent, priority: 'PRESERVE' as const } } };
    expect(intentScore(preserve, 'PL_A', dec({ action: 'WITHDRAW', targetCell: 'A1' }))).toBe(1);
  });
});

describe('engagements and strikes', () => {
  it('superior hostile repulses the unit', () => {
    const d = started();
    const u = roleUnit(d.ctx, 'PL_A');
    u.track = [{ tMs: 0, ...cellCentre('D4') }, { tMs: 1000, ...cellCentre('F4') }];
    d.run(2);
    const t = resolveEngagement(d.ctx, u, 'F4');
    expect(t).toMatch(/repulsed/);
    expect(u.strength).toBe(60);
  });

  it('balanced and favourable engagements', () => {
    const d = started();
    const plb = roleUnit(d.ctx, 'PL_B');
    plb.strength = 100;
    expect(resolveEngagement(d.ctx, plb, 'E5')).toMatch(/engaged/);
    const d2 = started();
    const pla = roleUnit(d2.ctx, 'PL_A');
    expect(resolveEngagement(d2.ctx, pla, 'D2')).toMatch(/unopposed\. 1 decoy group/);
    const d3 = started();
    const p3 = roleUnit(d3.ctx, 'PL_B');
    p3.strength = 300;
    expect(resolveEngagement(d3.ctx, p3, 'G6')).toMatch(/cleared/);
    expect(d3.s.units.find((x) => x.id === 'r-inf')!.strength).toBe(30);
  });

  it('strikes hit real hostiles, destroy decoys, cause fratricide', () => {
    const d = started();
    expect(resolveStrike(d.ctx, 'F4', 'ALO')).toMatch(/1 hostile group/);
    expect(d.s.units.find((x) => x.id === 'r-armour')!.strength).toBe(60);
    expect(resolveStrike(d.ctx, 'C3', 'ALO')).toMatch(/FRATRICIDE/);
    expect(resolveStrike(d.ctx, 'D2', 'ALO')).toMatch(/aborted/);
  });
});
