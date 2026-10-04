import { describe, expect, it } from 'vitest';
import { cellCentre } from '@vanguard/shared';
import { conflictReason, detectConflicts, observe, reconReport, routeChannel, sensorSweep } from '../src';
import { started } from './fixtures';
import type { IntelItem } from '@vanguard/shared';

const item = (o: Partial<IntelItem>): IntelItem => ({
  id: 'i', kind: 'CONTACT', sourceLabel: 'A', channel: 'CMD_NET', observedAtMs: 0, deliveredAtMs: 0, cell: 'D4',
  cellUncertain: false, side: 'RED', unitType: 'ARMOUR', count: 4, confidence: 'M', text: '', corrupted: false,
  forwardedBy: null, subjectRole: null, ...o,
});

describe('sensors & observation (PRD §7.7)', () => {
  it('UAV reports decoys as armour; discriminating sensor does not', () => {
    const d = started();
    const uav = observe(d.ctx, cellCentre('E3'), 2.5, 0, { discriminates: false });
    expect(uav.find((o) => o.cell === 'D2')).toMatchObject({ unitType: 'ARMOUR', count: 4, decoyOnly: true });
    const gs = observe(d.ctx, cellCentre('D2'), 0.6, 0, { discriminates: true });
    expect(gs).toHaveLength(0);
    const close = observe(d.ctx, cellCentre('D2'), 1, 0, { discriminates: false, closeDecoyRange: 0.6 });
    expect(close[0]!.unitType).toBe('DECOY');
    const radar = observe(d.ctx, cellCentre('A7'), 3, 0, { discriminates: false, detects: ['SHIP'] });
    expect(radar.map((o) => o.unitType)).toEqual(['SHIP']);
  });

  it('UAV contact vs ground-sensor NEGATIVE produces a natural conflict for CDR', () => {
    const d = started();
    d.run(90);
    const cdr = d.s.roles.CDR!.intel;
    expect(cdr.some((i) => i.kind === 'CONTACT' && i.cell === 'D2' && i.sourceLabel === 'UAV HERON-X')).toBe(true);
    expect(cdr.some((i) => i.kind === 'NEGATIVE' && i.cell === 'D2')).toBe(true);
    const conflicts = detectConflicts(cdr, new Set());
    expect(conflicts.some((c) => c.cell === 'D2' && /no-contact/.test(c.reason))).toBe(true);
    // truth meta stored server-side only
    const uavItem = cdr.find((i) => i.kind === 'CONTACT' && i.cell === 'D2')!;
    expect(d.s.reportMeta[uavItem.id]!.decoyOnly).toBe(true);
  });

  it('reports on change and refreshes every 5th sweep', () => {
    const d = started();
    const before = d.s.stats.channels.ISR_DATALINK?.sent ?? 0;
    sensorSweep(d.ctx, 'uav-1');
    const first = d.s.stats.channels.ISR_DATALINK!.sent;
    expect(first).toBeGreaterThan(before);
    sensorSweep(d.ctx, 'uav-1');
    expect(d.s.stats.channels.ISR_DATALINK!.sent).toBe(first); // no change → no report
  });

  it('own observation identifies close decoys and features', () => {
    const d = started();
    const u = d.s.units.find((x) => x.id === 'b-pla')!;
    u.track = [{ tMs: 0, ...cellCentre('D2') }];
    d.run(15);
    const obs = d.s.roles.PL_A!.intel.filter((i) => i.channel === 'OWN');
    expect(obs.some((i) => i.unitType === 'DECOY' && /DECOYS/.test(i.text))).toBe(true);
    // bridge destroyed later is observed by a nearby unit
    const b = d.s.units.find((x) => x.id === 'b-plb')!;
    b.track = [{ tMs: 0, ...cellCentre('D4') }];
    d.s.features[0]!.intact = false;
    d.run(31);
    expect(d.s.roles.PL_B!.intel.some((i) => i.kind === 'INFO' && /DESTROYED/.test(i.text))).toBe(true);
  });

  it('POSREPs carry the perceived (spoofed) position to the superior', () => {
    const d = started();
    d.emit('DS', { type: 'CYBER_TRIGGERED', payload: { cyberId: 'G', cyber: { kind: 'GPS_SPOOF', durationS: 300, role: 'PL_A', driftCells: 2 } } });
    d.run(150);
    const posreps = d.s.roles.CDR!.intel.filter((i) => i.kind === 'POSREP' && i.subjectRole === 'PL_A');
    expect(posreps.length).toBeGreaterThan(0);
    expect(posreps.at(-1)!.cell).not.toBe('C3');
  });

  it('STALE inject back-dates content; DATALINK_COMPROMISE spoofs ISR', () => {
    const d = started();
    d.run(200); // armour has moved
    d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'S', inject: { type: 'STALE', channels: ['ISR_DATALINK'], roles: ['CDR'], durationS: 300, params: { staleS: 180 } } } });
    d.s.sensors.find((x) => x.id === 'uav-1')!.lastSig = {};
    sensorSweep(d.ctx, 'uav-1');
    d.run(10);
    const stale = d.s.roles.CDR!.intel.filter((i) => i.channel === 'ISR_DATALINK' && i.observedAtMs === 200_000 - 180_000);
    expect(stale.length).toBeGreaterThan(0);
    d.emit('DS', { type: 'CYBER_TRIGGERED', payload: { cyberId: 'D', cyber: { kind: 'DATALINK_COMPROMISE', durationS: 120 } } });
    d.run(40);
    expect(Object.values(d.s.reportMeta).some((m) => m.spoofed)).toBe(true);
  });

  it('recon reports are truthful about decoys', () => {
    const d = started();
    reconReport(d.ctx, 'PL_A', 'D2', 'RECON PATROL');
    d.run(10);
    const r = d.s.roles.PL_A!.intel.find((i) => i.kind === 'RECON');
    expect(r?.text).toMatch(/no hostile vehicles\. 4x DECOYS/);
    expect(routeChannel(d.ctx, 'PL_A', 'CDR', 'SATCOM')).toBe('CMD_NET');
    expect(routeChannel(d.ctx, 'PL_A', 'CDR', 'PL_NET_A')).toBe('PL_NET_A');
  });

  it('scripted reports fire at their time', () => {
    const d = started();
    d.run(150);
    expect(d.s.journal.some((j) => j.kind === 'REPORT' && /Scripted/.test(j.text))).toBe(true);
  });
});

describe('conflict detection', () => {
  it('applies the PRD rules', () => {
    expect(conflictReason(item({ sourceLabel: 'A' }), item({ sourceLabel: 'A', kind: 'NEGATIVE' }))).toBeNull();
    expect(conflictReason(item({}), item({ sourceLabel: 'B', kind: 'NEGATIVE', count: 0 }))).toMatch(/no-contact/);
    expect(conflictReason(item({ kind: 'NEGATIVE', count: 0 }), item({ sourceLabel: 'B' }))).toMatch(/no-contact/);
    expect(conflictReason(item({}), item({ sourceLabel: 'B', unitType: 'INFANTRY' }))).toMatch(/Type/);
    expect(conflictReason(item({}), item({ sourceLabel: 'B', count: 9 }))).toMatch(/Strength/);
    expect(conflictReason(item({}), item({ sourceLabel: 'B', count: 5 }))).toBeNull();
    expect(conflictReason(item({}), item({ sourceLabel: 'B', cell: 'D5' }))).toMatch(/Same group/);
    expect(conflictReason(item({}), item({ sourceLabel: 'B', cell: 'H8' }))).toBeNull();
    expect(conflictReason(item({}), item({ sourceLabel: 'B', observedAtMs: 700_000, kind: 'NEGATIVE' }))).toBeNull();
    expect(conflictReason(item({ cell: null }), item({ sourceLabel: 'B' }))).toBeNull();
    const list = [item({ id: 'a' }), item({ id: 'b', sourceLabel: 'B', kind: 'NEGATIVE', count: 0 })];
    const c = detectConflicts(list, new Set(['b']));
    expect(c[0]).toMatchObject({ id: 'a~b', flagged: true });
  });
});
