import {
  LINK_LEVELS,
  cellCentre,
  dist,
  terrainAt,
  vecToCell,
  type ChannelDef,
  type ChannelId,
  type LinkHint,
  type LinkLevel,
  type LinkLevelName,
  type RoleId,
  type Vec,
} from '@vanguard/shared';
import type { ActiveInject, Ctx } from './state';
import { unitPos } from './tracks';

export interface LegResult {
  level: LinkLevel;
  jamming: boolean;
  power: number;
  causes: string[];
}

export interface LinkResult extends LegResult {
  viaRelay: boolean;
  /** Traffic silently discarded (MISSING inject) while the link still looks CLEAR. */
  silentDrop: boolean;
  extraDelayS: number;
}

export const levelName = (l: LinkLevel): LinkLevelName => LINK_LEVELS[l];
const maxL = (a: LinkLevel, b: LinkLevel): LinkLevel => (a > b ? a : b);

export function hopActive(ctx: Ctx, channel: ChannelId): boolean {
  const h = ctx.s.freqHops[channel];
  return !!h && ctx.s.tMs < h.untilMs;
}

/** Jamming effect on a leg a–b for a channel (PRD §7.4). */
export function jamLeg(ctx: Ctx, ch: ChannelDef, a: Vec, b: Vec): LegResult {
  let level: LinkLevel = 0;
  let power = 0;
  const causes: string[] = [];
  if (ch.band === 'NONE') return { level, jamming: false, power, causes };
  for (const j of ctx.s.jammers) {
    if (!j.active || !j.bands.includes(ch.band as never)) continue;
    const R = j.radius * j.power;
    const d = Math.min(dist(a, j.pos), dist(b, j.pos)) / R;
    const l: LinkLevel = d <= 0.5 ? 2 : d <= 1 ? 1 : 0;
    if (l > 0) {
      causes.push(`JAM ${j.id} ${l === 2 ? 'inner' : 'outer'}`);
      power = Math.max(power, j.power);
      level = maxL(level, l);
    }
  }
  if (level > 0 && hopActive(ctx, ch.id)) {
    level = (level - 1) as LinkLevel;
    causes.push('FREQ HOP');
  }
  return { level, jamming: level > 0 || causes.length > 0, power, causes };
}

/** True if the straight segment a–b crosses a ridge cell other than the endpoints' own cells. */
export function losBlocked(ctx: Ctx, a: Vec, b: Vec): boolean {
  const ca = vecToCell(a);
  const cb = vecToCell(b);
  const d = dist(a, b);
  const steps = Math.max(1, Math.ceil(d / 0.1));
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    if (p.x < 0 || p.y < 0 || p.x >= 8 || p.y >= 8) continue;
    const c = vecToCell(p);
    if (c !== ca && c !== cb && terrainAt(ctx.sc.terrain, c) === '^') return true;
  }
  return false;
}

export function legState(ctx: Ctx, ch: ChannelDef, a: Vec, b: Vec): LegResult {
  const jam = jamLeg(ctx, ch, a, b);
  if (ch.losSensitive && losBlocked(ctx, a, b)) {
    return { ...jam, level: 2, causes: [...jam.causes, 'LOS ridge'] };
  }
  return jam;
}

/** Active relay positions (EW rebro nodes + units acting as relay). */
export function relayPositions(ctx: Ctx): Vec[] {
  const out: Vec[] = [];
  for (const r of ctx.s.relays) if (ctx.s.tMs >= r.activeFromMs) out.push(r.pos);
  for (const role of ctx.s.enabledRoles) {
    const rs = ctx.s.roles[role]!;
    if (!rs.actingRelay) continue;
    const u = ctx.s.units.find((x) => x.id === rs.unitId);
    if (u && u.status === 'ACTIVE') out.push(unitPos(u, ctx.s.tMs));
  }
  return out;
}

export function c2OutageActive(ctx: Ctx): boolean {
  return ctx.s.cyber.some(
    (c) => c.spec.kind === 'C2_OUTAGE' && !c.expired && ctx.s.tMs >= c.startMs && ctx.s.tMs < c.endMs,
  );
}

/** Physical link state (geometry + EW + cyber), ignoring manual injects. */
export function physicalLink(ctx: Ctx, channel: ChannelId, a: Vec, b: Vec): LinkResult {
  const ch = ctx.ch[channel];
  const base: LinkResult = {
    level: 0,
    jamming: false,
    power: 0,
    causes: [],
    viaRelay: false,
    silentDrop: false,
    extraDelayS: 0,
  };
  if (channel === 'RUNNER') return base;
  if (ch.digital && c2OutageActive(ctx)) {
    return { ...base, level: 2, causes: ['C2_OUTAGE'] };
  }
  const direct = legState(ctx, ch, a, b);
  let best: LinkResult = { ...base, ...direct };
  if (direct.level > 0 && ch.losSensitive) {
    for (const r of relayPositions(ctx)) {
      const l1 = legState(ctx, ch, a, r);
      const l2 = legState(ctx, ch, r, b);
      const lvl = maxL(l1.level, l2.level);
      if (lvl < best.level) {
        best = {
          ...base,
          level: lvl,
          jamming: l1.jamming || l2.jamming,
          power: Math.max(l1.power, l2.power),
          causes: [...l1.causes, ...l2.causes, 'via relay'],
          viaRelay: true,
        };
      }
    }
  }
  return best;
}

export function injectApplies(inj: ActiveInject, channel: ChannelId, roles: (RoleId | null)[], tMs: number): boolean {
  if (inj.expired || tMs < inj.startMs || tMs >= inj.endMs) return false;
  if (!inj.spec.channels.includes(channel)) return false;
  if (inj.spec.roles.length === 0) return true;
  return roles.some((r) => r !== null && inj.spec.roles.includes(r));
}

/** INTERMITTENT: on for the first half of each period, off for the second. */
export function intermittentOff(inj: ActiveInject, tMs: number): boolean {
  const period = (inj.spec.params.periodS ?? 20) * 1000;
  const phase = (tMs - inj.startMs) % period;
  return phase >= period / 2;
}

/** Link state including manual injects (PRD §7.3 step 1). */
export function effectiveLink(
  ctx: Ctx,
  channel: ChannelId,
  from: { role: RoleId | null; pos: Vec },
  to: { role: RoleId | null; pos: Vec },
): LinkResult {
  const res = physicalLink(ctx, channel, from.pos, to.pos);
  const out: LinkResult = { ...res, causes: [...res.causes] };
  for (const inj of ctx.s.injects) {
    if (!injectApplies(inj, channel, [from.role, to.role], ctx.s.tMs)) continue;
    switch (inj.spec.type) {
      case 'DROPOUT':
        out.level = 2;
        out.causes.push(`DROPOUT ${inj.id}`);
        break;
      case 'INTERMITTENT':
        if (intermittentOff(inj, ctx.s.tMs)) {
          out.level = 2;
          out.causes.push(`INTERMITTENT ${inj.id}`);
        }
        break;
      case 'MISSING':
        out.silentDrop = true;
        out.causes.push(`MISSING ${inj.id}`);
        break;
      case 'DELAY':
        out.extraDelayS += inj.spec.params.delayS ?? 60;
        out.causes.push(`DELAY ${inj.id}`);
        break;
      default:
        break;
    }
  }
  return out;
}

export function hintFor(l: LinkResult): LinkHint {
  if (l.level === 0) return 'OK';
  return l.jamming ? 'JAMMING' : 'NO_SIGNAL';
}

/** Position of a comms node: role (its unit), HHQ / scenario node, or sensor. */
export function nodePos(ctx: Ctx, node: string): Vec | null {
  const role = ctx.s.roles[node as RoleId];
  if (role) {
    const u = ctx.s.units.find((x) => x.id === role.unitId);
    return u ? unitPos(u, ctx.s.tMs) : null;
  }
  const n = ctx.sc.nodes.find((x) => x.id === node);
  if (n) return n.pos ?? cellCentre(n.cell!);
  const sensor = ctx.s.sensors.find((x) => x.id === node);
  if (sensor) return sensor.pos;
  if (node === 'HHQ') return { x: -2, y: 4 };
  return null;
}

/** Role-to-role (or role-to-HHQ) link on a channel. */
export function roleLink(ctx: Ctx, channel: ChannelId, a: RoleId, b: RoleId | 'HHQ'): LinkResult {
  const pa = nodePos(ctx, a)!;
  const pb = nodePos(ctx, b) ?? { x: -2, y: 4 };
  return effectiveLink(
    ctx,
    channel,
    { role: a, pos: pa },
    { role: b === 'HHQ' ? null : b, pos: pb },
  );
}

/** Channels (non-runner, messaging) both nodes are members of. */
export function sharedChannels(ctx: Ctx, a: string, b: string): ChannelId[] {
  return (Object.keys(ctx.ch) as ChannelId[]).filter((c) => {
    const ch = ctx.ch[c];
    return c !== 'RUNNER' && ch.messaging && ch.members.includes(a) && ch.members.includes(b);
  });
}

/** PRD §7.2: cut off ⇔ every shared non-runner messaging channel to the superior is DENIED. */
export function isCutOff(ctx: Ctx, role: RoleId): boolean {
  const sup = ctx.roleSpec[role]!.superior;
  if (sup !== 'HHQ' && !ctx.s.enabledRoles.includes(sup)) return false;
  const chans = sharedChannels(ctx, role, sup);
  if (chans.length === 0) return false;
  return chans.every((c) => roleLink(ctx, c, role, sup).level === 2);
}

/** Link status of a role on a channel as the role would perceive it (to superior, else best peer). */
export function roleChannelStatus(ctx: Ctx, role: RoleId, channel: ChannelId): {
  level: LinkLevel;
  hint: LinkHint;
  peers: { peer: RoleId | 'HHQ'; level: LinkLevel; hint: LinkHint }[];
} {
  const ch = ctx.ch[channel];
  const sup = ctx.roleSpec[role]!.superior;
  const peers: { peer: RoleId | 'HHQ'; level: LinkLevel; hint: LinkHint }[] = [];
  for (const m of ch.members) {
    if (m === role) continue;
    if (m !== 'HHQ' && !ctx.s.enabledRoles.includes(m as RoleId)) continue;
    if (m !== 'HHQ' && !ctx.s.roles[m as RoleId]) continue;
    const l = roleLink(ctx, channel, role, m as RoleId | 'HHQ');
    peers.push({ peer: m as RoleId | 'HHQ', level: l.level, hint: hintFor(l) });
  }
  if (channel === 'RUNNER') return { level: 0, hint: 'OK', peers };
  const supPeer = peers.find((p) => p.peer === sup);
  if (supPeer) return { level: supPeer.level, hint: supPeer.hint, peers };
  if (peers.length === 0) return { level: 0, hint: 'OK', peers };
  const best = peers.reduce((a, b) => (b.level < a.level ? b : a));
  return { level: best.level, hint: best.hint, peers };
}
