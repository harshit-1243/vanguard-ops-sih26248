import { describe, expect, it } from 'vitest';
import { ScenarioSchema, type ScenarioInput } from '@vanguard/shared';
import { Simulation, project, projectTruth } from '@vanguard/sim';
import ironBridge from '../../../scenarios/iron-bridge.json';
import { glyph, perceivedLayers, truthLayers } from '../src/components/map/adapters';
import { cn, num, pct } from '../src/lib/utils';

function running() {
  const sc = ScenarioSchema.parse(ironBridge as ScenarioInput);
  const sim = new Simulation(sc, 1, ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW']);
  let seq = 1;
  const ev = (body: object, actor = 'SYSTEM') => sim.apply({ ...body, seq: seq++, tSimMs: sim.state.tMs, actor } as never);
  ev({ type: 'SESSION_CREATED', payload: { scenarioId: sc.id, seed: 1, enabledRoles: ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW'] } });
  ev({ type: 'EXERCISE_STARTED', payload: {} }, 'DS');
  ev({ type: 'JAMMER_PLACED', payload: { jammer: { id: 'J', cell: 'G2', radius: 2, bands: ['VHF', 'HF'], power: 1, active: true } } }, 'DS');
  for (let i = 0; i < 120; i++) sim.step();
  return sim;
}

describe('map adapters', () => {
  it('perceived layers only contain what the role knows', () => {
    const sim = running();
    const cdr = perceivedLayers(project(sim.ctx, 'CDR', 'X'));
    expect(cdr.markers.find((m) => m.own)?.label).toBe('KESTREL 6');
    expect(cdr.markers.some((m) => m.side === 'RED')).toBe(true);
    // no decoy flags or true callsigns of hostile units on trainee layers
    expect(cdr.markers.every((m) => !m.decoy)).toBe(true);
    expect(JSON.stringify(cdr)).not.toContain('DECOY PARK');
    expect(cdr.jammers).toHaveLength(0);
    const ew = perceivedLayers(project(sim.ctx, 'EW', 'X'));
    expect(ew.jammers[0]?.estimate).toBe(true);
  });

  it('truth layers expose decoys, jammers and role links', () => {
    const sim = running();
    const t = truthLayers(projectTruth(sim.ctx, 'X'));
    expect(t.markers.some((m) => m.decoy)).toBe(true);
    expect(t.jammers[0]?.radius).toBe(2);
    expect(t.links.find((l) => l.id === 'PL_B-CDR')?.level).toBe('DENIED');
    expect(t.relays[0]?.label).toBe('Rebro HILL 214');
  });

  it('utility helpers', () => {
    expect(glyph('ARMOUR')).toBe('ARM');
    expect(glyph(null)).toBe('?');
    expect(glyph('WIDGET')).toBe('WIDG');
    expect(pct(0.256)).toBe('26%');
    expect(pct(null)).toBe('—');
    expect(num(0.1234)).toBe('0.12');
    const off = (x: string) => x.length > 99 && 'b';
    expect(cn('a', off('x'), 'px-2 px-3')).toBe('a px-3');
  });
});
