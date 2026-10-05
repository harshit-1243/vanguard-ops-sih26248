import { cellCentre, dist, neighbours, vecToCell, type Cell, type Vec } from '@vanguard/shared';
import { journal, type Ctx, type UnitState } from './state';
import { clampToGrid, isMoving, moveUnit, unitPos } from './tracks';

/**
 * Adaptive OPFOR (PRD §8.1) — deterministic, explainable rules, evaluated every 30 s per unit.
 * Only units with a non-scripted behaviour react, and only when the session's OPFOR setting is
 * `adaptive`. Everything is a pure function of state, so replays stay identical.
 */
export const REACT_INTERVAL_MS = 30_000;
export const SPOT_MEMORY_MS = 60_000;
export const SCOOT_COOLDOWN_MS = 180_000;
const THREAT_RADIUS = 1.5;

const blues = (ctx: Ctx) => ctx.s.units.filter((u) => u.side === 'BLUE' && u.status === 'ACTIVE');

function nearestBlue(ctx: Ctx, p: Vec): { u: UnitState; d: number; pos: Vec } | null {
  let best: { u: UnitState; d: number; pos: Vec } | null = null;
  for (const b of blues(ctx)) {
    const bp = unitPos(b, ctx.s.tMs);
    const d = dist(p, bp);
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && b.id < best.u.id)) best = { u: b, d, pos: bp };
  }
  return best;
}

function blueStrengthNear(ctx: Ctx, p: Vec, r: number): number {
  return blues(ctx)
    .filter((b) => dist(unitPos(b, ctx.s.tMs), p) <= r)
    .reduce((n, b) => n + b.strength, 0);
}

/** Neighbour cell that maximises distance from `threat` (ties → cell id order). */
function awayFrom(here: Vec, threat: Vec): Vec {
  const cells = [vecToCell(here), ...neighbours(vecToCell(here))].sort();
  let best = cells[0]!;
  let bestD = -1;
  for (const c of cells) {
    const d = dist(cellCentre(c), threat);
    if (d > bestD + 1e-9) {
      best = c;
      bestD = d;
    }
  }
  return cellCentre(best);
}

function go(ctx: Ctx, u: UnitState, target: Vec, text: string): number {
  const arrive = moveUnit(u, clampToGrid(target), ctx.s.tMs);
  u.lastMovedMs = ctx.s.tMs;
  journal(ctx.s, 'OPFOR', text, null, u.id);
  return arrive;
}

/** Record that a hostile unit was observed by BLUE (drives shoot-and-scoot). */
export function markSpotted(ctx: Ctx, unitIds: readonly string[]): void {
  for (const id of unitIds) {
    const u = ctx.s.units.find((x) => x.id === id);
    if (u && u.side === 'RED') u.lastSpottedMs = ctx.s.tMs;
  }
}

/** Counter-attack resolution when a reserve arrives on a BLUE-held cell (same ratio table as §8). */
export function resolveAssault(ctx: Ctx, u: UnitState, cell: Cell): void {
  const s = ctx.s;
  const defenders = blues(ctx).filter((b) => vecToCell(unitPos(b, s.tMs)) === cell);
  if (defenders.length === 0) {
    journal(s, 'OPFOR', `${u.callsign} occupies ${cell} unopposed`, null, u.id);
    return;
  }
  const def = defenders.reduce((n, b) => n + b.strength, 0);
  const ratio = Math.round((u.strength / Math.max(def, 1)) * 100) / 100;
  const hit = (mult: number) => {
    for (const b of defenders) {
      b.strength = Math.round(b.strength * mult * 100) / 100;
      if (b.strength < b.maxStrength * 0.15) b.status = 'DESTROYED';
    }
  };
  if (ratio >= 1.5) {
    hit(0.6);
    u.strength = Math.round(u.strength * 0.85 * 100) / 100;
    journal(s, 'OPFOR', `${u.callsign} counter-attack at ${cell} succeeds (ratio ${ratio}): defenders −40%`, null, u.id);
  } else if (ratio >= 0.75) {
    hit(0.8);
    u.strength = Math.round(u.strength * 0.7 * 100) / 100;
    journal(s, 'OPFOR', `${u.callsign} counter-attack at ${cell} contested (ratio ${ratio}): defenders −20%, attacker −30%`, null, u.id);
  } else {
    hit(0.95);
    u.strength = Math.round(u.strength * 0.5 * 100) / 100;
    if (u.strength < 30) u.status = 'DESTROYED';
    journal(s, 'OPFOR', `${u.callsign} counter-attack at ${cell} repulsed (ratio ${ratio}): attacker −50%`, null, u.id);
  }
}

export function reactOpfor(ctx: Ctx): void {
  const s = ctx.s;
  const t = s.tMs;
  // Resolve arriving counter-attacks first (scripted or adaptive).
  for (const u of s.units) {
    if (u.assault && t >= u.assault.atMs) {
      const a = u.assault;
      u.assault = null;
      if (u.status === 'ACTIVE') resolveAssault(ctx, u, a.cell);
    }
  }
  if (ctx.settings.opfor !== 'adaptive') return;
  for (const u of s.units) {
    if (u.side !== 'RED' || u.status !== 'ACTIVE' || u.decoy || u.behaviour === 'scripted') continue;
    if (t < u.nextReactMs) continue;
    u.nextReactMs = t + REACT_INTERVAL_MS;
    const here = unitPos(u, t);
    const nb = nearestBlue(ctx, here);
    if (!nb) continue;
    switch (u.behaviour) {
      case 'reserve': {
        if (u.committed) break;
        const threatened = [...ctx.sc.intent.objectiveCells]
          .sort()
          .find((c) => blues(ctx).some((b) => dist(unitPos(b, t), cellCentre(c)) <= THREAT_RADIUS));
        if (!threatened) break;
        u.committed = true;
        const arrive = go(ctx, u, cellCentre(threatened), `${u.callsign} commits to counter-attack towards ${threatened}`);
        u.assault = { atMs: arrive, cell: threatened };
        break;
      }
      case 'defend': {
        if (nb.d > 1.01 || isMoving(u, t)) break;
        const blueStr = blueStrengthNear(ctx, here, 1.01);
        if (blueStr >= 1.5 * u.strength) go(ctx, u, awayFrom(here, nb.pos), `${u.callsign} falls back from superior BLUE force`);
        break;
      }
      case 'shoot-and-scoot': {
        const spotted = u.lastSpottedMs >= 0 && t - u.lastSpottedMs <= SPOT_MEMORY_MS && u.lastSpottedMs > u.lastMovedMs;
        if (!spotted || t - u.lastMovedMs < SCOOT_COOLDOWN_MS) break;
        go(ctx, u, awayFrom(here, nb.pos), `${u.callsign} relocates after being spotted`);
        break;
      }
      case 'probe': {
        if (isMoving(u, t)) break;
        if (nb.d > 1.6) {
          const f = (nb.d - 1.2) / nb.d;
          go(ctx, u, { x: here.x + (nb.pos.x - here.x) * f, y: here.y + (nb.pos.y - here.y) * f }, `${u.callsign} probes towards ${nb.u.callsign}`);
        } else if (nb.d < 0.8) {
          go(ctx, u, awayFrom(here, nb.pos), `${u.callsign} breaks contact`);
        }
        break;
      }
    }
  }
}
