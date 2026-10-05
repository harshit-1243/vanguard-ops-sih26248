import {
  COLS,
  ROWS,
  ScenarioSchema,
  allCells,
  terrainAt,
  type Scenario,
  type ScenarioIssue,
  type ScenarioValidation,
  type SimEvent,
} from '@vanguard/shared';
import { replay } from '@vanguard/sim';

/** Upper bound for the dry run so a validation request stays cheap. */
const DRY_RUN_MAX_S = 3 * 3600;

/**
 * Scenario editor validation: Zod schema (blocking), design warnings (non-blocking) and a headless
 * dry run of the whole exercise (all roles, adaptive OPFOR, every MSEL item) to prove it runs.
 */
export function validateScenario(raw: unknown): ScenarioValidation & { scenario: Scenario | null } {
  const res = ScenarioSchema.safeParse(raw);
  if (!res.success) {
    return {
      ok: false,
      scenario: null,
      issues: res.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
      warnings: [],
      dryRun: null,
    };
  }
  const sc = res.data;
  const warnings = designWarnings(sc);
  const dryRun = dryRunScenario(sc);
  const issues: ScenarioIssue[] = dryRun.error ? [{ path: '(simulation)', message: `Dry run failed: ${dryRun.error}` }] : [];
  return { ok: issues.length === 0, scenario: sc, issues, warnings, dryRun };
}

export function designWarnings(sc: Scenario): ScenarioIssue[] {
  const w: ScenarioIssue[] = [];
  const add = (path: string, message: string) => w.push({ path, message });
  const endS = sc.durationMin * 60;
  const roleIds = new Set(sc.roles.map((r) => r.id));

  if (!sc.units.some((u) => u.side === 'RED' && !u.decoy && u.strength > 0)) add('units', 'No real (non-decoy) enemy units — nothing to fight.');
  sc.units.forEach((u, i) => {
    const sorted = u.waypoints.every((p, k) => k === 0 || p.atS >= u.waypoints[k - 1]!.atS);
    if (!sorted) add(`units.${i}.waypoints`, `${u.callsign}: waypoints are not in time order.`);
    if (u.waypoints[0]!.atS !== 0) add(`units.${i}.waypoints.0`, `${u.callsign}: first waypoint should be at 0 s (start position).`);
    for (const [k, p] of u.waypoints.entries()) {
      const t = terrainAt(sc.terrain, p.cell);
      if (u.type === 'SHIP' && t !== 'W') add(`units.${i}.waypoints.${k}`, `${u.callsign} is a ship but ${p.cell} is not sea.`);
      if (u.type !== 'SHIP' && u.type !== 'AIR' && u.type !== 'UAV' && t === 'W') add(`units.${i}.waypoints.${k}`, `${u.callsign} is a land unit but ${p.cell} is sea.`);
      if (p.atS > endS) add(`units.${i}.waypoints.${k}`, `${u.callsign}: waypoint at ${p.atS}s is after the exercise ends (${endS}s).`);
    }
    if (u.ownerRole && !roleIds.has(u.ownerRole)) add(`units.${i}.ownerRole`, `${u.callsign}: owner role ${u.ownerRole} is not in the scenario.`);
    if (u.side === 'BLUE' && u.behaviour !== 'scripted') add(`units.${i}.behaviour`, `${u.callsign}: behaviours only apply to enemy (RED) units.`);
  });
  sc.intent.objectiveCells.forEach((c, i) => {
    if (!sc.objectives.some((o) => o.cell === c)) add(`intent.objectiveCells.${i}`, `Intent objective ${c} has no matching objective (it will not be shown or scored).`);
  });
  if (sc.intent.deadlineS > endS) add('intent.deadlineS', `Intent deadline (${sc.intent.deadlineS}s) is after the exercise ends (${endS}s).`);
  if (sc.air.availableFromS > endS) add('air.availableFromS', 'Air support only becomes available after the exercise ends.');
  sc.msel.forEach((m, i) => {
    if (m.atS > endS) add(`msel.${i}.atS`, `MSEL ${m.id} at ${m.atS}s never fires (exercise ends at ${endS}s).`);
    if (m.action.kind === 'INJECT') {
      for (const r of m.action.inject.roles) if (!roleIds.has(r)) add(`msel.${i}`, `MSEL ${m.id} targets role ${r}, which is not in the scenario.`);
    }
    if (m.action.kind === 'CYBER' && m.action.cyber.role && !roleIds.has(m.action.cyber.role)) add(`msel.${i}`, `MSEL ${m.id} targets role ${m.action.cyber.role}, which is not in the scenario.`);
  });
  sc.sensors.forEach((s, i) => {
    for (const r of s.deliverTo) if (!roleIds.has(r)) add(`sensors.${i}.deliverTo`, `${s.label} delivers to ${r}, which is not in the scenario.`);
  });
  sc.scriptedReports.forEach((r, i) => {
    if (r.atS > endS) add(`scriptedReports.${i}.atS`, `Scripted report at ${r.atS}s never arrives (exercise ends at ${endS}s).`);
  });
  sc.roles.forEach((r, i) => {
    if (new Set(r.pace).size < 4) add(`roles.${i}.pace`, `${r.callsign}: PACE plan repeats a channel.`);
  });
  if (sc.terrain.length !== ROWS || sc.terrain.some((row) => row.length !== COLS)) add('terrain', 'Terrain must be 8×8.');
  if (allCells().every((c) => terrainAt(sc.terrain, c) === '.')) add('terrain', 'Terrain is all open ground.');
  return w;
}

export function dryRunScenario(sc: Scenario): NonNullable<ScenarioValidation['dryRun']> {
  const started = performance.now();
  const untilMs = Math.min(sc.durationMin * 60, DRY_RUN_MAX_S) * 1000;
  const events: SimEvent[] = [
    { seq: 1, tSimMs: 0, actor: 'SYSTEM', type: 'SESSION_CREATED', payload: { scenarioId: sc.id, seed: sc.defaultSeed, enabledRoles: sc.roles.map((r) => r.id) } },
    { seq: 2, tSimMs: 0, actor: 'DS', type: 'EXERCISE_STARTED', payload: {} },
  ] as SimEvent[];
  try {
    const sim = replay(sc, events, { untilMs });
    const s = sim.state;
    const pct = (side: 'BLUE' | 'RED') => {
      const us = s.units.filter((u) => u.side === side && !u.decoy);
      const max = us.reduce((n, u) => n + u.maxStrength, 0);
      return max > 0 ? Math.round((100 * us.reduce((n, u) => n + u.strength, 0)) / max) : 0;
    };
    return {
      simS: Math.round(s.tMs / 1000),
      ms: Math.round(performance.now() - started),
      mselFired: s.msel.filter((m) => m.status === 'FIRED').length,
      opforReactions: s.journal.filter((j) => j.kind === 'OPFOR').length,
      blueStrengthPct: pct('BLUE'),
      redStrengthPct: pct('RED'),
      error: null,
    };
  } catch (err) {
    return { simS: 0, ms: Math.round(performance.now() - started), mselFired: 0, opforReactions: 0, blueStrengthPct: 0, redStrengthPct: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
