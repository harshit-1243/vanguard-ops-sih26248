import { describe, expect, it } from 'vitest';
import { CYBER_KINDS, INJECT_TYPES, type RoleId, type Scenario, type SimEvent } from '@vanguard/shared';
import { Simulation, project, roleLink } from '@vanguard/sim';
import { loadConfig } from '../src/config';
import { ScenarioRegistry } from '../src/scenarios';

const reg = ScenarioRegistry.fromDir(loadConfig({ LOG_LEVEL: 'silent' }).scenariosDir);
const ids = reg.list().map((s) => s.id);

function driver(sc: Scenario, roles?: RoleId[]) {
  const sim = new Simulation(sc, sc.defaultSeed, roles);
  let seq = 0;
  const emit = (actor: SimEvent['actor'], body: object) => sim.apply({ ...body, seq: ++seq, tSimMs: sim.state.tMs, actor } as SimEvent);
  emit('SYSTEM', { type: 'SESSION_CREATED', payload: { scenarioId: sc.id, seed: sc.defaultSeed, enabledRoles: sim.state.enabledRoles } });
  for (const r of sim.state.enabledRoles) emit('SYSTEM', { type: 'ROLE_JOINED', payload: { roleId: r, callsign: `T-${r}`.replace('_', '') } });
  emit('DS', { type: 'EXERCISE_STARTED', payload: {} });
  return { sim, emit };
}

describe('shipped scenarios', () => {
  it('ships Iron Bridge and Ridge Line', () => {
    expect(ids).toEqual(expect.arrayContaining(['iron-bridge', 'ridge-line']));
  });

  for (const id of ['iron-bridge', 'ridge-line']) {
    describe(id, () => {
      const sc = reg.get(id)!;

      it('has a complete template: brief, intent, objectives, units, timeline, probes', () => {
        expect(sc.brief.situation.length).toBeGreaterThan(50);
        expect(sc.intent.text.length).toBeGreaterThan(50);
        expect(sc.objectives.length).toBeGreaterThanOrEqual(1);
        expect(sc.units.some((u) => u.side === 'RED' && u.waypoints.length > 1)).toBe(true);
        expect(sc.units.some((u) => u.decoy)).toBe(true);
        expect(sc.probeBank.length).toBeGreaterThanOrEqual(5);
        // joint: an air or naval asset is present
        expect(sc.sensors.some((x) => x.kind === 'UAV' || x.kind === 'COASTAL_RADAR')).toBe(true);
      });

      it('MSEL has ≥12 injects covering every degradation type, jammers and all cyber kinds', () => {
        expect(sc.msel.length).toBeGreaterThanOrEqual(12);
        const injectTypes = new Set(sc.msel.flatMap((m) => (m.action.kind === 'INJECT' ? [m.action.inject.type] : [])));
        for (const t of INJECT_TYPES) expect(injectTypes, `missing ${t}`).toContain(t);
        expect(sc.msel.some((m) => m.action.kind === 'JAMMER')).toBe(true);
        const cyber = new Set(sc.msel.flatMap((m) => (m.action.kind === 'CYBER' ? [m.action.cyber.kind] : [])));
        for (const k of CYBER_KINDS) expect(cyber, `missing ${k}`).toContain(k);
      });

      it('runs its full duration with decisions and probes, never leaking truth to any role', () => {
        const { sim, emit } = driver(sc, sc.roles.map((r) => r.id));
        const hidden = sc.units.filter((u) => u.side === 'RED').flatMap((u) => [u.id, u.callsign]);
        const total = sc.durationMin * 60;
        for (let t = 1; t <= total; t++) {
          sim.step();
          if (t % 300 === 0) {
            emit('PL_B', { type: 'DECISION_MADE', payload: { action: 'HOLD', confidence: 50, rationale: 'Holding to observe the approach', basedOn: [], intentSelf: 'UNSURE' } });
            emit('DS', { type: 'PROBE_STARTED', payload: { probeId: `P${t}` } });
            emit('DS', { type: 'PROBE_ENDED', payload: { probeId: `P${t}` } });
          }
          if (t % 120 === 0) {
            for (const r of sim.state.enabledRoles) {
              const json = JSON.stringify(project(sim.ctx, r, 'X'));
              for (const h of hidden) expect(json.includes(h), `${id} ${r} leaked ${h} at ${t}s`).toBe(false);
            }
          }
        }
        expect(sim.state.msel.every((m) => m.status === 'FIRED')).toBe(true);
        expect(sim.state.decisions.length).toBe(Math.floor(total / 300));
        expect(sim.state.probes.length).toBe(Math.floor(total / 300));
        expect(Object.values(sim.state.roles).some((r) => r!.cutOffSpans.length > 0)).toBe(true);
      });
    });
  }
});

describe('Ridge Line mechanics', () => {
  const sc = reg.get('ridge-line')!;

  it('the ridge masks VHF between the HQ and the forward OP; HF still works', () => {
    const { sim } = driver(sc);
    const vhf = roleLink(sim.ctx, 'CMD_NET', 'PL_A', 'CDR');
    expect(vhf.level).toBe(2);
    expect(vhf.causes).toContain('LOS ridge');
    expect(roleLink(sim.ctx, 'HF_NET', 'PL_A', 'CDR').level).toBe(0);
  });

  it('GPS spoofing walks PL A off its true position', () => {
    const { sim } = driver(sc);
    for (let t = 0; t < 240; t++) sim.step();
    const pic = project(sim.ctx, 'PL_A', 'X');
    expect(pic.ownUnit.cell).not.toBe('E2');
  });

  it('the convoy report reaches the CP about five minutes late', () => {
    const { sim } = driver(sc);
    for (let t = 0; t < 1000; t++) sim.step();
    const report = sim.state.roles.CDR!.intel.find((i) => i.unitType === 'CONVOY' && i.sourceLabel === 'HHQ INT');
    expect(report).toBeDefined();
    expect(report!.deliveredAtMs - report!.observedAtMs).toBeGreaterThanOrEqual(300_000);
  });
});
