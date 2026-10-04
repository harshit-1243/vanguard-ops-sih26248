import { describe, expect, it } from 'vitest';
import { cellCentre, type IntelItem } from '@vanguard/shared';
import { corruptPayload, deliverDue, garbleText, makeConflictTwin, transmit, type DeliveryPayload } from '../src';
import { started } from './fixtures';

const msg = (text = 'alpha bravo charlie delta echo foxtrot'): Extract<DeliveryPayload, { kind: 'MESSAGE' }> => ({
  kind: 'MESSAGE',
  item: { id: 'm', kind: 'MESSAGE', fromRole: 'CDR', fromCallsign: 'K6', channel: 'CMD_NET', text, sentAtMs: 0, deliveredAtMs: 0, corrupted: false },
  intent: null,
});

const contact = (over: Partial<IntelItem> = {}): IntelItem => ({
  id: 'c1', kind: 'CONTACT', sourceLabel: 'UAV', channel: 'ISR_DATALINK', observedAtMs: 0, deliveredAtMs: 0,
  cell: 'D4', cellUncertain: false, side: 'RED', unitType: 'ARMOUR', count: 5, confidence: 'M', text: 't',
  corrupted: false, forwardedBy: null, subjectRole: null, ...over,
});

describe('degradation pipeline (PRD §7.3)', () => {
  it('queues with base latency+jitter on a clear link and delivers in order', () => {
    const d = started();
    const out = transmit(d.ctx, { channel: 'CMD_NET', from: 'CDR', fromRole: 'CDR', to: ['PL_A', 'PL_B', 'NLO' as never], playerTraffic: true, build: () => msg() });
    expect(out.map((o) => o.to)).toEqual(['PL_A', 'PL_B']); // NLO not enabled
    for (const o of out) {
      if (o.status === 'QUEUED') {
        expect(o.deliverAtMs!).toBeGreaterThanOrEqual(1000);
        expect(o.deliverAtMs!).toBeLessThanOrEqual(5000);
      }
    }
    d.run(6);
    expect(d.s.roles.PL_A!.messages.length + d.s.roles.PL_B!.messages.length).toBeGreaterThanOrEqual(1);
    expect(d.s.journal.some((j) => j.kind === 'MSG_DELIVERED')).toBe(true);
  });

  it('drops everything on a denied link and records the reason', () => {
    const d = started();
    d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J', cell: 'C6', radius: 2, bands: ['VHF'], power: 1, active: true } } });
    const out = transmit(d.ctx, { channel: 'CMD_NET', from: 'CDR', fromRole: 'CDR', to: ['PL_B'], playerTraffic: true, build: () => msg() });
    expect(out[0]).toMatchObject({ status: 'DROPPED', reason: 'LINK_DENIED' });
    expect(d.s.stats.channels.CMD_NET!.dropped).toBe(1);
    expect(d.s.stats.roles.CDR!.dropped).toBe(1);
  });

  it('degraded links add heavy delay and ~40% drops', () => {
    const d = started();
    // ALO at B5 is in the outer zone of a jammer at C6 (d ≈ 0.71).
    d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J', cell: 'C6', radius: 2, bands: ['VHF'], power: 1, active: true } } });
    let dropped = 0;
    let minDelay = Infinity;
    for (let i = 0; i < 400; i++) {
      const [o] = transmit(d.ctx, { channel: 'CMD_NET', from: 'PL_A', fromRole: 'PL_A', to: ['ALO'], playerTraffic: false, build: () => msg() });
      if (o!.status === 'DROPPED') dropped++;
      else minDelay = Math.min(minDelay, o!.deliverAtMs! - d.s.tMs);
    }
    expect(dropped / 400).toBeGreaterThan(0.33);
    expect(dropped / 400).toBeLessThan(0.53);
    expect(minDelay).toBeGreaterThanOrEqual(34_000); // 3 - 2 + 30 + 6
  });

  it('MISSING drops silently; RUNNER is slow but unjammable', () => {
    const d = started();
    d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'X', inject: { type: 'MISSING', channels: ['HF_NET'], roles: [], durationS: 60, params: {} } } });
    expect(transmit(d.ctx, { channel: 'HF_NET', from: 'CDR', fromRole: 'CDR', to: ['PL_A'], playerTraffic: true, build: () => msg() })[0]).toMatchObject({ reason: 'MISSING' });
    d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J', cell: 'C6', radius: 4, bands: ['VHF', 'HF', 'UHF', 'L', 'SHF'], power: 1.5, active: true } } });
    const [r] = transmit(d.ctx, { channel: 'RUNNER', from: 'CDR', fromRole: 'CDR', to: ['PL_B'], playerTraffic: true, build: () => msg() });
    expect(r!.status).toBe('QUEUED');
    // 120 + 45 × 1.41 ± 10
    expect(r!.deliverAtMs! - d.s.tMs).toBeGreaterThan(170_000);
  });

  it('corrupts contacts partially and garbles text', () => {
    const d = started();
    const modes = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const p: DeliveryPayload = { kind: 'INTEL', item: contact() };
      corruptPayload(d.ctx, p);
      const it = (p as { item: IntelItem }).item;
      expect(it.corrupted).toBe(true);
      expect(it.confidence).toBe('L');
      modes.add(it.count === null ? 'count' : it.unitType === 'UNKNOWN' ? 'type' : it.cellUncertain ? 'cell' : 'none');
    }
    expect([...modes].sort()).toEqual(['cell', 'count', 'type']);
    const m = msg('one two three four five six seven eight nine ten');
    corruptPayload(d.ctx, m);
    expect((m as { item: { text: string } }).item.text).toContain('~~~');
    const info: DeliveryPayload = { kind: 'INTEL', item: contact({ kind: 'INFO', text: 'a b c d e f g h' }) };
    corruptPayload(d.ctx, info);
    expect(garbleText(d.ctx, 'x')).toMatch(/^(x|~~~)$/);
  });

  it('builds contradictory twins', () => {
    const d = started();
    const kinds = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const tw = makeConflictTwin(d.ctx, contact());
      expect(tw.sourceLabel).toBe('UNCONFIRMED');
      expect(tw.id).not.toBe('c1');
      if (tw.count !== 5) kinds.add('count');
      if (tw.unitType !== 'ARMOUR') kinds.add('type');
      if (tw.cell !== 'D4') kinds.add('cell');
    }
    expect([...kinds].sort()).toEqual(['cell', 'count', 'type']);
  });

  it('CONFLICT inject spawns a twin for each contact', () => {
    const d = started();
    d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'X', inject: { type: 'CONFLICT', channels: ['ISR_DATALINK'], roles: ['CDR'], durationS: 60, params: {} } } });
    transmit(d.ctx, {
      channel: 'ISR_DATALINK', from: 'uav-1', fromRole: null, fromPos: cellCentre('E3'), to: ['CDR', 'ALO'], playerTraffic: false,
      build: () => ({ kind: 'INTEL', item: contact({ id: `x${Math.random()}` }) }),
    });
    const toCdr = d.s.pending.filter((p) => p.to === 'CDR');
    const toAlo = d.s.pending.filter((p) => p.to === 'ALO');
    expect(toCdr.length).toBeGreaterThanOrEqual(toAlo.length);
    expect(d.s.pending.some((p) => p.from === 'UNCONFIRMED' && p.to === 'CDR') || toCdr.length === 0).toBe(true);
  });

  it('delivers due items and updates intent only for newer versions', () => {
    const d = started();
    d.s.pending.push({
      id: 'q', seq: 1, deliverAtMs: 0, to: 'PL_A', from: 'CDR', channel: 'CMD_NET', sentAtMs: 0, playerTraffic: true,
      payload: { ...msg(), intent: { version: 5, text: 'new intent text here' } },
    });
    d.s.pending.push({
      id: 'q2', seq: 2, deliverAtMs: 0, to: 'PL_A', from: 'CDR', channel: 'CMD_NET', sentAtMs: 0, playerTraffic: false,
      payload: { ...msg(), intent: { version: 2, text: 'older' } },
    });
    deliverDue(d.ctx);
    expect(d.s.roles.PL_A!.intent.version).toBe(5);
    expect(d.s.pending).toHaveLength(0);
  });
});
