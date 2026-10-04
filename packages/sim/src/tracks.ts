import { COLS, ROWS, dist, vecToCell, type Cell, type RoleId, type Vec } from '@vanguard/shared';
import type { Ctx, Keyframe, RoleState, UnitState } from './state';

/** Truth position of a unit at time t (piecewise-linear between keyframes). */
export function posAt(track: readonly Keyframe[], tMs: number): Vec {
  const first = track[0]!;
  if (tMs <= first.tMs || track.length === 1) return { x: first.x, y: first.y };
  for (let i = 1; i < track.length; i++) {
    const b = track[i]!;
    if (tMs <= b.tMs) {
      const a = track[i - 1]!;
      const span = b.tMs - a.tMs;
      const f = span <= 0 ? 1 : (tMs - a.tMs) / span;
      return { x: round3(a.x + (b.x - a.x) * f), y: round3(a.y + (b.y - a.y) * f) };
    }
  }
  const last = track[track.length - 1]!;
  return { x: last.x, y: last.y };
}

/** Rounding keeps positions stable under float noise and makes hashes portable. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function unitPos(u: UnitState, tMs: number): Vec {
  return posAt(u.track, tMs);
}

export function unitCell(u: UnitState, tMs: number): Cell {
  return vecToCell(unitPos(u, tMs));
}

export function isMoving(u: UnitState, tMs: number): boolean {
  return u.track[u.track.length - 1]!.tMs > tMs;
}

export function clampToGrid(v: Vec): Vec {
  return {
    x: Math.min(COLS - 0.5, Math.max(0.5, v.x)),
    y: Math.min(ROWS - 0.5, Math.max(0.5, v.y)),
  };
}

/** Order a unit to move to `target` (truth coordinates) from now. Returns arrival time. */
export function moveUnit(u: UnitState, target: Vec, tMs: number): number {
  const here = posAt(u.track, tMs);
  const d = dist(here, target);
  const durMs = u.speed > 0 ? Math.round(((d / u.speed) * 60_000) / 1000) * 1000 : 0;
  u.track = [
    ...u.track.filter((k) => k.tMs < tMs),
    { tMs, x: here.x, y: here.y },
    { tMs: tMs + Math.max(1000, durMs), x: round3(target.x), y: round3(target.y) },
  ];
  return tMs + Math.max(1000, durMs);
}

export function stopUnit(u: UnitState, tMs: number): void {
  const here = posAt(u.track, tMs);
  u.track = [...u.track.filter((k) => k.tMs < tMs), { tMs, x: here.x, y: here.y }];
}

/** Current GPS drift vector applied to a role's perceived own position (ramps in over 60 s). */
export function gpsDrift(r: RoleState, tMs: number): Vec {
  const g = r.gps;
  if (!g || tMs < g.startMs || tMs >= g.endMs) return { x: 0, y: 0 };
  const f = Math.min(1, (tMs - g.startMs) / 60_000);
  return { x: round3(g.dx * f), y: round3(g.dy * f) };
}

export function roleUnit(ctx: Ctx, role: RoleId): UnitState {
  const r = ctx.s.roles[role]!;
  return ctx.s.units.find((u) => u.id === r.unitId)!;
}

/** Where the role *believes* its unit is (truth + GPS drift), clamped to the grid. */
export function perceivedOwnPos(ctx: Ctx, role: RoleId): Vec {
  const u = roleUnit(ctx, role);
  const p = unitPos(u, ctx.s.tMs);
  const d = gpsDrift(ctx.s.roles[role]!, ctx.s.tMs);
  return clampToGrid({ x: round3(p.x + d.x), y: round3(p.y + d.y) });
}
