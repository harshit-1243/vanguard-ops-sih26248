import type { RoleId, Scenario, SimEvent } from '@vanguard/shared';
import { Simulation } from './simulation';

export interface ReplayOptions {
  /** Keep stepping (while RUNNING) until this sim time after the last event. */
  untilMs?: number;
  /** Called after every step and after every applied event. */
  onTick?: (sim: Simulation, cause: 'step' | 'event') => void;
}

/** Seed + enabled roles from the SESSION_CREATED event (must be first). */
export function sessionParams(events: readonly SimEvent[]): { seed: number; enabledRoles: RoleId[] } {
  const first = [...events].sort((a, b) => a.seq - b.seq)[0];
  if (!first || first.type !== 'SESSION_CREATED') throw new Error('Log must start with SESSION_CREATED');
  return { seed: first.payload.seed, enabledRoles: first.payload.enabledRoles };
}

/**
 * Deterministic replay (PRD §6.2): for each event in seq order, step until the sim clock reaches
 * the event's t_sim_ms, then apply it.
 */
export function replay(scenario: Scenario, events: readonly SimEvent[], opts: ReplayOptions = {}): Simulation {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const { seed, enabledRoles } = sessionParams(ordered);
  const sim = new Simulation(scenario, seed, enabledRoles);
  for (const e of ordered) {
    while (sim.state.tMs < e.tSimMs) {
      if (sim.state.phase !== 'RUNNING') {
        throw new Error(`Replay gap: event ${e.seq} at ${e.tSimMs} but sim ${sim.state.phase} at ${sim.state.tMs}`);
      }
      sim.step();
      opts.onTick?.(sim, 'step');
    }
    sim.apply(e);
    opts.onTick?.(sim, 'event');
  }
  if (opts.untilMs !== undefined) {
    while (sim.state.phase === 'RUNNING' && sim.state.tMs < opts.untilMs) {
      sim.step();
      opts.onTick?.(sim, 'step');
    }
  }
  return sim;
}
