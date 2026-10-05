import {
  cellCentre,
  cellSteps,
  dist,
  neighbours,
  vecToCell,
  type Adjudication,
  type Cell,
  type DecisionPayload,
  type RoleId,
  type Soundness,
  type TruthUnitBrief,
} from '@vanguard/shared';
import { isCutOff, roleLink } from './links';
import { journal, type Ctx, type UnitState } from './state';
import { clampToGrid, moveUnit, roleUnit, unitPos } from './tracks';

export const RHO_SOUND = 0.75;
export const RHO_UNSOUND = 1.5;
const OUTCOME: Record<Soundness, number> = { SOUND: 1, RISKY: 0.5, UNSOUND: 0 };

export function unitsInCell(ctx: Ctx, cell: Cell, side: 'RED' | 'BLUE', tMs = ctx.s.tMs): UnitState[] {
  return ctx.s.units.filter(
    (u) => u.side === side && u.status === 'ACTIVE' && vecToCell(unitPos(u, tMs)) === cell,
  );
}

export function brief(ctx: Ctx, u: UnitState): TruthUnitBrief {
  return {
    callsign: u.callsign,
    type: u.type,
    count: u.count,
    strength: Math.round(u.strength),
    decoy: u.decoy,
    cell: vecToCell(unitPos(u, ctx.s.tMs)),
  };
}

/** H(S): real hostile strength in S + 0.5 × in 8-neighbours. */
export function hostileStrength(ctx: Ctx, cell: Cell, tMs = ctx.s.tMs): number {
  const real = (c: Cell) =>
    unitsInCell(ctx, c, 'RED', tMs)
      .filter((u) => !u.decoy)
      .reduce((n, u) => n + u.strength, 0);
  return real(cell) + 0.5 * neighbours(cell).reduce((n, c) => n + real(c), 0);
}

export function rho(ctx: Ctx, cell: Cell, own: UnitState): number {
  return Math.round((hostileStrength(ctx, cell) / Math.max(own.strength, 1)) * 100) / 100;
}

function classByRho(r: number): Soundness {
  return r < RHO_SOUND ? 'SOUND' : r < RHO_UNSOUND ? 'RISKY' : 'UNSOUND';
}

export function airOnStation(ctx: Ctx): boolean {
  const a = ctx.s.air;
  return a.onStationAtMs !== null && ctx.s.tMs >= a.onStationAtMs && a.sortiesLeft > 0;
}

function adj(soundness: Soundness, rule: string, reason: string): Adjudication {
  return { soundness, rule, reason, outcome: OUTCOME[soundness] };
}

/** Count of cut-off roles + denied superior links — used to score RELAY (R7). */
export function commsDeficit(ctx: Ctx): number {
  let n = 0;
  for (const r of ctx.s.enabledRoles) {
    if (isCutOff(ctx, r)) n += 10;
    const sup = ctx.roleSpec[r]!.superior;
    if (sup !== 'HHQ' && !ctx.s.enabledRoles.includes(sup)) continue;
    const ch = ctx.s.roles[r]!.activeChannel;
    if (ctx.ch[ch].members.includes(sup)) n += roleLink(ctx, ch, r, sup).level;
  }
  return n;
}

/** PRD §8 adjudication table. `relayProbe` evaluates R7 with the relay hypothetically applied. */
export function adjudicate(
  ctx: Ctx,
  role: RoleId,
  d: DecisionPayload,
  relayProbe?: () => { before: number; after: number },
): Adjudication {
  const own = roleUnit(ctx, role);
  const ownCell = vecToCell(unitPos(own, ctx.s.tMs));
  const target = d.targetCell ?? ownCell;
  const intent = ctx.sc.intent;
  switch (d.action) {
    case 'ADVANCE':
    case 'REPOSITION': {
      const r = rho(ctx, target, own);
      const s = classByRho(r);
      const rule = d.action === 'ADVANCE' ? 'R1' : 'R2';
      return adj(s, rule, `ρ=${r} in ${target} (${s === 'SOUND' ? '<0.75' : s === 'RISKY' ? '0.75–1.5' : '≥1.5'})`);
    }
    case 'HOLD': {
      const rOwn = rho(ctx, ownCell, own);
      const obj = intent.objectiveCells[0]!;
      const rObj = rho(ctx, obj, own);
      if (rOwn >= RHO_UNSOUND) return adj('RISKY', 'R3', `Holding under superior threat (ρ=${rOwn} in ${ownCell})`);
      if (intent.priority === 'SEIZE' && rObj < RHO_SOUND && ctx.s.tMs < intent.deadlineS * 1000 && ownCell !== obj) {
        return adj('RISKY', 'R3', `Missed opportunity: objective ${obj} weakly held (ρ=${rObj}) before deadline`);
      }
      return adj('SOUND', 'R3', `Holding is consistent with the situation (ρ own=${rOwn})`);
    }
    case 'WITHDRAW': {
      const rOwn = rho(ctx, ownCell, own);
      return rOwn >= RHO_UNSOUND
        ? adj('SOUND', 'R4', `Withdrawal from superior threat (ρ=${rOwn})`)
        : adj('RISKY', 'R4', `Ceded ground without superior threat (ρ=${rOwn})`);
    }
    case 'CALL_AIR': {
      const friendlies = unitsInCell(ctx, target, 'BLUE');
      if (friendlies.length > 0) {
        return adj('UNSOUND', 'R5', `Friendly ${friendlies.map((u) => u.callsign).join(', ')} in ${target} — fratricide risk`);
      }
      // The ALO can arrange air (strike executes once on station); others need air already overhead.
      if (!airOnStation(ctx) && role !== 'ALO') {
        return adj('RISKY', 'R5', 'No air cover on station — request not actioned');
      }
      const real = unitsInCell(ctx, target, 'RED').filter((u) => !u.decoy);
      if (real.length === 0) {
        const decoys = unitsInCell(ctx, target, 'RED').filter((u) => u.decoy).length;
        return adj('RISKY', 'R5', decoys > 0 ? `Target ${target} holds only decoys — wasted sortie` : `No hostiles in ${target}`);
      }
      return adj('SOUND', 'R5', `Real hostiles in ${target}, no friendlies`);
    }
    case 'REQUEST_RECON':
      return adj('SOUND', 'R6', `Recon of ${target} reduces uncertainty`);
    case 'RELAY': {
      const p = relayProbe?.() ?? { before: 0, after: 0 };
      return p.after < p.before
        ? adj('SOUND', 'R7', `Relay improves network (deficit ${p.before} → ${p.after})`)
        : adj('RISKY', 'R7', 'Relay produces no link improvement');
    }
    case 'SWITCH_CHANNEL': {
      const sup = ctx.roleSpec[role]!.superior;
      const rs = ctx.s.roles[role]!;
      const lvl = (c: typeof rs.activeChannel) =>
        ctx.ch[c].members.includes(sup) ? roleLink(ctx, c, role, sup).level : 1;
      const cur = lvl(rs.activeChannel);
      const next = lvl(d.channel!);
      if (next === 2) return adj('UNSOUND', 'R8', `${d.channel} is denied`);
      if (cur > 0 && next < cur) return adj('SOUND', 'R8', `Moved off a ${cur === 2 ? 'denied' : 'degraded'} channel`);
      if (next <= cur) return adj('SOUND', 'R8', `${d.channel} is at least as good`);
      return adj('RISKY', 'R8', `${d.channel} is worse than ${rs.activeChannel}`);
    }
  }
}

/** PRD §9.4 intent adherence score for a decision (0 / 0.5 / 1). */
export function intentScore(ctx: Ctx, role: RoleId, d: DecisionPayload): number {
  const intent = ctx.sc.intent;
  const own = roleUnit(ctx, role);
  const ownPos = unitPos(own, ctx.s.tMs);
  if (d.targetCell && intent.forbiddenCells.includes(d.targetCell)) return 0;
  const nearestObj = (p: { x: number; y: number }) =>
    Math.min(...intent.objectiveCells.map((c) => dist(cellCentre(c), p)));
  const nearObjective = (c: Cell) => intent.objectiveCells.some((o) => cellSteps(o, c) <= 1);
  switch (d.action) {
    case 'ADVANCE':
    case 'REPOSITION': {
      const before = nearestObj(ownPos);
      const after = nearestObj(cellCentre(d.targetCell!));
      return after < before - 0.01 ? 1 : Math.abs(after - before) <= 0.01 ? 0.5 : 0;
    }
    case 'HOLD':
      return intent.priority === 'DEFEND' ? 1 : 0.5;
    case 'WITHDRAW':
      return intent.priority === 'PRESERVE' ? 1 : 0;
    case 'REQUEST_RECON':
    case 'CALL_AIR':
      return nearObjective(d.targetCell!) ? 1 : 0.5;
    case 'RELAY':
    case 'SWITCH_CHANNEL':
      return 1;
  }
}

/** Deterministic engagement on arrival (PRD §8). Returns a summary line. */
export function resolveEngagement(ctx: Ctx, u: UnitState, cell: Cell): string {
  const s = ctx.s;
  const decoys = unitsInCell(ctx, cell, 'RED').filter((x) => x.decoy);
  for (const dcy of decoys) dcy.status = 'DESTROYED';
  const decoyNote = decoys.length > 0 ? ` ${decoys.length} decoy group(s) exposed.` : '';
  const hostiles = unitsInCell(ctx, cell, 'RED').filter((x) => !x.decoy);
  const r = rho(ctx, cell, u);
  let text: string;
  if (hostiles.length === 0 && r === 0) {
    text = `${u.callsign} occupied ${cell} unopposed.${decoyNote}`;
  } else if (r >= RHO_UNSOUND) {
    u.strength = Math.round(u.strength * 0.6 * 100) / 100;
    // Repulsed: fall back one cell towards where the move started.
    const here = unitPos(u, s.tMs);
    const start = u.track.length >= 2 ? u.track[u.track.length - 2]! : u.track[0]!;
    const dx = start.x - here.x;
    const dy = start.y - here.y;
    const len = Math.hypot(dx, dy);
    const back = len > 1 ? { x: here.x + dx / len, y: here.y + dy / len } : { x: start.x, y: start.y };
    moveUnit(u, clampToGrid(back), s.tMs);
    text = `${u.callsign} repulsed at ${cell} (ρ=${r}): −40% strength, falling back.${decoyNote}`;
  } else if (r >= RHO_SOUND) {
    u.strength = Math.round(u.strength * 0.85 * 100) / 100;
    for (const h of hostiles) h.strength = Math.round(h.strength * 0.75 * 100) / 100;
    text = `${u.callsign} engaged at ${cell} (ρ=${r}): own −15%, hostile −25%.${decoyNote}`;
  } else {
    u.strength = Math.round(u.strength * 0.95 * 100) / 100;
    for (const h of hostiles) {
      h.strength = Math.round(h.strength * 0.5 * 100) / 100;
      if (h.strength < 30) h.status = 'DESTROYED';
    }
    text = `${u.callsign} cleared ${cell} (ρ=${r}): own −5%, hostile −50%.${decoyNote}`;
  }
  if (u.strength < u.maxStrength * 0.15) u.status = 'DESTROYED';
  journal(s, 'ENGAGEMENT', text, u.ownerRole, cell);
  return text;
}

/** Air strike on a cell (PRD §8 R5 effect). */
export function resolveStrike(ctx: Ctx, cell: Cell, role: RoleId): string {
  const s = ctx.s;
  if (s.air.sortiesLeft <= 0) {
    const t = `Air strike on ${cell} aborted — no sorties left`;
    journal(s, 'STRIKE', t, role, cell);
    return t;
  }
  s.air.sortiesLeft -= 1;
  const reds = unitsInCell(ctx, cell, 'RED');
  const blues = unitsInCell(ctx, cell, 'BLUE');
  let realHit = 0;
  let decoyHit = 0;
  for (const u of reds) {
    u.lastSpottedMs = s.tMs;
    if (u.decoy) {
      u.status = 'DESTROYED';
      decoyHit++;
    } else {
      u.strength = Math.round(u.strength * 0.4 * 100) / 100;
      if (u.strength < 30) u.status = 'DESTROYED';
      realHit++;
    }
  }
  for (const u of blues) {
    u.strength = Math.round(u.strength * 0.7 * 100) / 100;
    if (u.strength < u.maxStrength * 0.15) u.status = 'DESTROYED';
  }
  const text = `Air strike on ${cell}: ${realHit} hostile group(s) hit, ${decoyHit} decoy group(s) destroyed${
    blues.length > 0 ? `, FRATRICIDE on ${blues.map((b) => b.callsign).join(', ')}` : ''
  }.`;
  journal(s, 'STRIKE', text, role, cell);
  return text;
}
