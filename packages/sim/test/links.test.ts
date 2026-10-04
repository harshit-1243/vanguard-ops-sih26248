import { describe, expect, it } from 'vitest';
import { cellCentre } from '@vanguard/shared';
import {
  effectiveLink,
  hintFor,
  intermittentOff,
  isCutOff,
  jamLeg,
  legState,
  losBlocked,
  nodePos,
  physicalLink,
  roleChannelStatus,
  roleLink,
  sharedChannels,
} from '../src';
import { started } from './fixtures';

const jam = (cell: string, radius = 2, bands: ('VHF' | 'HF' | 'L' | 'SHF' | 'UHF')[] = ['VHF', 'HF'], power = 1) => ({
  type: 'JAMMER_PLACED' as const,
  payload: { jammer: { id: `J-${cell}`, cell, radius, bands, power, active: true } },
});

describe('EW jammer model (PRD §7.4)', () => {
  it('inner 50% denies, outer 50% degrades, beyond radius clear', () => {
    const d = started();
    d.emit('DS', jam('C6'));
    const ch = d.ctx.ch.CMD_NET;
    const J = cellCentre('C6');
    expect(jamLeg(d.ctx, ch, J, { x: 9, y: 9 }).level).toBe(2);
    expect(jamLeg(d.ctx, ch, { x: J.x + 1.5, y: J.y }, { x: 9, y: 9 }).level).toBe(1);
    expect(jamLeg(d.ctx, ch, { x: J.x + 2.5, y: J.y }, { x: 9, y: 9 }).level).toBe(0);
  });

  it('only affects matching bands and scales with power', () => {
    const d = started();
    d.emit('DS', jam('C6', 2, ['L']));
    const J = cellCentre('C6');
    expect(jamLeg(d.ctx, d.ctx.ch.CMD_NET, J, J).level).toBe(0);
    expect(jamLeg(d.ctx, d.ctx.ch.ISR_DATALINK, J, J).level).toBe(2);
    expect(jamLeg(d.ctx, d.ctx.ch.RUNNER, J, J).level).toBe(0);
    const d2 = started();
    d2.emit('DS', jam('C6', 2, ['VHF'], 0.5)); // effective radius 1
    expect(jamLeg(d2.ctx, d2.ctx.ch.CMD_NET, { x: J.x + 1.2, y: J.y }, { x: 9, y: 9 }).level).toBe(0);
  });

  it('frequency hop reduces effect one level', () => {
    const d = started();
    d.emit('DS', jam('C6'));
    expect(roleLink(d.ctx, 'CMD_NET', 'PL_B', 'CDR').level).toBe(2);
    d.emit('EW', { type: 'FREQ_HOP', payload: { channel: 'CMD_NET' } });
    const l = roleLink(d.ctx, 'CMD_NET', 'PL_B', 'CDR');
    expect(l.level).toBe(1);
    expect(l.causes).toContain('FREQ HOP');
  });

  it('marks jamming hint vs no-signal', () => {
    const d = started();
    d.emit('DS', jam('C6'));
    expect(hintFor(roleLink(d.ctx, 'CMD_NET', 'PL_B', 'CDR'))).toBe('JAMMING');
    expect(hintFor(roleLink(d.ctx, 'CMD_NET', 'PL_A', 'ALO'))).not.toBe('NO_SIGNAL');
  });
});

describe('terrain LOS and relays (PRD §7.5)', () => {
  it('ridge cells block LOS-sensitive legs but not HF', () => {
    const d = started();
    const a = cellCentre('D2');
    const b = cellCentre('F2');
    expect(losBlocked(d.ctx, a, b)).toBe(true);
    expect(losBlocked(d.ctx, cellCentre('E2'), b)).toBe(false); // endpoint's own cell excluded
    expect(legState(d.ctx, d.ctx.ch.CMD_NET, a, b).level).toBe(2);
    expect(legState(d.ctx, d.ctx.ch.HF_NET, a, b).level).toBe(0);
  });

  it('a relay restores a blocked VHF path', () => {
    const d = started();
    const a = cellCentre('D2');
    const b = cellCentre('F2');
    expect(physicalLink(d.ctx, 'CMD_NET', a, b).level).toBe(2);
    d.s.relays.push({ id: 'R', label: 'R', pos: cellCentre('E1'), activeFromMs: 0 });
    const l = physicalLink(d.ctx, 'CMD_NET', a, b);
    expect(l.level).toBe(0);
    expect(l.viaRelay).toBe(true);
    d.s.relays[0]!.activeFromMs = 10_000_000;
    expect(physicalLink(d.ctx, 'CMD_NET', a, b).level).toBe(2);
  });
});

describe('cyber + manual injects on links', () => {
  it('C2 outage denies digital channels only', () => {
    const d = started();
    d.emit('DS', { type: 'CYBER_TRIGGERED', payload: { cyberId: 'C1', cyber: { kind: 'C2_OUTAGE', durationS: 60 } } });
    expect(roleLink(d.ctx, 'SATCOM', 'CDR', 'HHQ').level).toBe(2);
    expect(roleLink(d.ctx, 'HF_NET', 'CDR', 'HHQ').level).toBe(0);
    expect(roleLink(d.ctx, 'RUNNER', 'CDR', 'HHQ').level).toBe(0);
    d.run(61);
    expect(roleLink(d.ctx, 'SATCOM', 'CDR', 'HHQ').level).toBe(0);
  });

  it('dropout / intermittent / missing / delay with role scoping', () => {
    const d = started();
    d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'X1', inject: { type: 'DROPOUT', channels: ['CMD_NET'], roles: ['PL_A'], durationS: 30, params: {} } } });
    expect(roleLink(d.ctx, 'CMD_NET', 'PL_A', 'CDR').level).toBe(2);
    expect(roleLink(d.ctx, 'CMD_NET', 'PL_B', 'CDR').level).toBe(0);
    d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'X2', inject: { type: 'MISSING', channels: ['PL_NET_B'], roles: [], durationS: 30, params: {} } } });
    const miss = roleLink(d.ctx, 'PL_NET_B', 'PL_B', 'CDR');
    expect(miss.level).toBe(0);
    expect(miss.silentDrop).toBe(true);
    d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'X3', inject: { type: 'DELAY', channels: ['SATCOM'], roles: [], durationS: 30, params: { delayS: 45 } } } });
    expect(roleLink(d.ctx, 'SATCOM', 'CDR', 'HHQ').extraDelayS).toBe(45);
    d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'X4', inject: { type: 'INTERMITTENT', channels: ['HF_NET'], roles: [], durationS: 60, params: { periodS: 20 } } } });
    const inj = d.s.injects.find((i) => i.id === 'X4')!;
    expect(intermittentOff(inj, inj.startMs + 5_000)).toBe(false);
    expect(intermittentOff(inj, inj.startMs + 15_000)).toBe(true);
    d.run(12);
    expect(roleLink(d.ctx, 'HF_NET', 'CDR', 'HHQ').level).toBe(2);
    d.run(30);
    expect(roleLink(d.ctx, 'CMD_NET', 'PL_A', 'CDR').level).toBe(0);
  });

  it('effectiveLink without roles uses positions only', () => {
    const d = started();
    const l = effectiveLink(d.ctx, 'CMD_NET', { role: null, pos: cellCentre('A1') }, { role: null, pos: cellCentre('A2') });
    expect(l.level).toBe(0);
  });
});

describe('cut-off and channel status', () => {
  it('PL_B is cut off only when VHF and HF are both denied', () => {
    const d = started();
    d.emit('DS', jam('C6', 2, ['VHF']));
    expect(isCutOff(d.ctx, 'PL_B')).toBe(false); // HF still up
    d.emit('DS', jam('C7', 2, ['HF']));
    expect(isCutOff(d.ctx, 'PL_B')).toBe(true);
    expect(sharedChannels(d.ctx, 'PL_B', 'CDR')).toEqual(['CMD_NET', 'PL_NET_B', 'HF_NET']);
  });

  it('reports superior link and peers', () => {
    const d = started();
    d.emit('DS', jam('C6'));
    const st = roleChannelStatus(d.ctx, 'PL_B', 'CMD_NET');
    expect(st.level).toBe(2);
    expect(st.peers.find((p) => p.peer === 'CDR')!.level).toBe(2);
    const cdr = roleChannelStatus(d.ctx, 'CDR', 'PL_NET_A'); // superior HHQ not on net → best peer
    expect(cdr.peers.map((p) => p.peer)).toEqual(['PL_A', 'EW']);
    expect(roleChannelStatus(d.ctx, 'PL_A', 'RUNNER').level).toBe(0);
  });

  it('resolves node positions', () => {
    const d = started();
    expect(nodePos(d.ctx, 'CDR')).toEqual(cellCentre('B5'));
    expect(nodePos(d.ctx, 'HHQ')).toEqual({ x: -2, y: 4 });
    expect(nodePos(d.ctx, 'uav-1')).toEqual(cellCentre('E3'));
    expect(nodePos(d.ctx, 'nowhere')).toBeNull();
  });
});
