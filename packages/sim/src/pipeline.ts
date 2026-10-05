import {
  RUNNER_BASE_S,
  RUNNER_PER_CELL_S,
  dist,
  neighbours,
  reportText,
  type ChannelId,
  type IntelItem,
  type MessageItem,
  type RoleId,
  type UnitType,
  type Vec,
} from '@vanguard/shared';
import { effectiveLink, injectApplies, nodePos } from './links';
import { markSpotted } from './opfor';
import { chance, pick, randInt, uniform } from './rng';
import {
  journal,
  nextId,
  type Ctx,
  type DeliveryPayload,
  type PendingDelivery,
  type ReportMeta,
  type TrafficCounters,
} from './state';

export interface TransmitRequest {
  channel: ChannelId;
  /** Originating node id (role, sensor, HHQ, scenario node) — for stats/edges. */
  from: string;
  fromRole: RoleId | null;
  /** Origin position; defaults to the node's position. Per-recipient override for spoofing. */
  fromPos?: Vec | ((to: RoleId) => Vec);
  to: RoleId[];
  /** Build the payload for one recipient (lets STALE/displacement vary per recipient). */
  build: (to: RoleId) => DeliveryPayload | null;
  /** Player-originated traffic (messages, intent, forwards) is journaled individually. */
  playerTraffic: boolean;
  meta?: (to: RoleId, payload: DeliveryPayload) => ReportMeta | null;
}

export interface TransmitOutcome {
  to: RoleId;
  status: 'QUEUED' | 'DROPPED';
  reason: 'LINK_DENIED' | 'PROBABILISTIC' | 'MISSING' | null;
  deliverAtMs: number | null;
}

function bump(c: Partial<Record<string, TrafficCounters>>, key: string, field: keyof TrafficCounters): void {
  const cur = c[key] ?? { sent: 0, delivered: 0, dropped: 0, corrupted: 0 };
  cur[field] += 1;
  c[key] = cur;
}

function roleStats(ctx: Ctx, role: RoleId) {
  const st = ctx.s.stats.roles;
  return (st[role] ??= {
    sent: 0,
    delivered: 0,
    dropped: 0,
    corrupted: 0,
    forwarded: 0,
    received: 0,
    latencySumMs: 0,
    latencyN: 0,
  });
}

/** Run the degradation pipeline (PRD §7.3) for each recipient and queue deliveries. */
export function transmit(ctx: Ctx, req: TransmitRequest): TransmitOutcome[] {
  const s = ctx.s;
  const ch = ctx.ch[req.channel];
  const outcomes: TransmitOutcome[] = [];
  const recipients = [...new Set(req.to)].filter((r) => s.enabledRoles.includes(r)).sort();
  for (const to of recipients) {
    const toPos = nodePos(ctx, to);
    if (!toPos) continue;
    const fromPos =
      typeof req.fromPos === 'function'
        ? req.fromPos(to)
        : (req.fromPos ?? nodePos(ctx, req.from) ?? toPos);
    const edgeKey = `${req.fromRole ?? req.from}>${to}`;
    bump(s.stats.channels, req.channel, 'sent');
    if (req.playerTraffic) {
      bump(s.stats.edges, edgeKey, 'sent');
      if (req.fromRole) roleStats(ctx, req.fromRole).sent++;
    }
    const drop = (reason: TransmitOutcome['reason']) => {
      bump(s.stats.channels, req.channel, 'dropped');
      if (req.playerTraffic) {
        bump(s.stats.edges, edgeKey, 'dropped');
        if (req.fromRole) roleStats(ctx, req.fromRole).dropped++;
        journal(s, 'MSG_DROPPED', `${req.channel} → ${to} lost (${reason})`, req.fromRole, to);
      }
      outcomes.push({ to, status: 'DROPPED', reason, deliverAtMs: null });
    };

    // 1. Link state
    const link = effectiveLink(ctx, req.channel, { role: req.fromRole, pos: fromPos }, { role: to, pos: toPos });
    if (link.silentDrop) {
      drop('MISSING');
      continue;
    }
    if (link.level === 2) {
      drop('LINK_DENIED');
      continue;
    }
    const payload = req.build(to);
    if (!payload) continue;

    // 2. Latency + jitter
    const jitter = uniform(s, -ch.jitterS, ch.jitterS);
    let latencyS: number;
    if (req.channel === 'RUNNER') {
      latencyS = RUNNER_BASE_S + RUNNER_PER_CELL_S * dist(fromPos, toPos) + jitter;
    } else {
      latencyS =
        ch.baseLatencyS +
        jitter +
        (link.level === 1 ? 30 + 2 * ch.baseLatencyS : 0) +
        link.extraDelayS +
        (link.viaRelay ? 1 : 0);
    }
    latencyS = Math.max(0.5, latencyS);

    // 3. Drop
    const pDrop = Math.min(0.95, ch.baseDrop + (link.level === 1 ? 0.4 * link.power : 0));
    if (chance(s, pDrop)) {
      drop('PROBABILISTIC');
      continue;
    }

    // 4. Corruption
    const pCorrupt = ch.baseCorrupt + (link.level === 1 ? 0.25 : 0);
    if (chance(s, pCorrupt)) {
      corruptPayload(ctx, payload);
      bump(s.stats.channels, req.channel, 'corrupted');
      if (req.playerTraffic && req.fromRole) roleStats(ctx, req.fromRole).corrupted++;
    }

    const deliverAtMs = s.tMs + Math.ceil(latencyS) * 1000;
    queue(ctx, { to, from: req.fromRole ?? req.from, channel: req.channel, payload, deliverAtMs, playerTraffic: req.playerTraffic });
    const meta = req.meta?.(to, payload);
    if (meta && payload.kind === 'INTEL') s.reportMeta[payload.item.id] = meta;
    outcomes.push({ to, status: 'QUEUED', reason: null, deliverAtMs });

    // 5. Conflict generation (CONFLICT inject active for this channel/recipient)
    if (payload.kind === 'INTEL' && payload.item.kind === 'CONTACT') {
      const conflictInj = s.injects.find(
        (i) => i.spec.type === 'CONFLICT' && injectApplies(i, req.channel, [req.fromRole, to], s.tMs),
      );
      if (conflictInj && !(meta?.twin ?? false)) {
        const twin = makeConflictTwin(ctx, payload.item);
        queue(ctx, {
          to,
          from: 'UNCONFIRMED',
          channel: req.channel,
          payload: { kind: 'INTEL', item: twin },
          deliverAtMs: deliverAtMs + 2000,
          playerTraffic: false,
        });
        s.reportMeta[twin.id] = { truthUnitIds: [], spoofed: true, decoyOnly: false, twin: true, stale: false };
      }
    }
  }
  return outcomes;
}

function queue(
  ctx: Ctx,
  p: Omit<PendingDelivery, 'id' | 'seq' | 'sentAtMs'>,
): void {
  const s = ctx.s;
  const id = nextId(s, 'Q');
  s.pending.push({ ...p, id, seq: s.counters['Q']!, sentAtMs: s.tMs });
}

const GARBLE = '~~~';

/** PRD §7.3 step 4 — partial-field corruption for contacts, word garbling for text. */
export function corruptPayload(ctx: Ctx, payload: DeliveryPayload): void {
  const s = ctx.s;
  if (payload.kind === 'INTEL') {
    const it = payload.item;
    it.corrupted = true;
    it.confidence = 'L';
    if (it.kind === 'CONTACT' || it.kind === 'RECON') {
      const mode = randInt(s, 0, 2);
      if (mode === 0) it.count = null;
      else if (mode === 1) it.unitType = 'UNKNOWN';
      else it.cellUncertain = true;
      it.text = garbleReportText(it);
    } else {
      it.text = garbleText(ctx, it.text);
    }
  } else {
    payload.item.corrupted = true;
    payload.item.text = garbleText(ctx, payload.item.text);
  }
}

function garbleReportText(it: IntelItem): string {
  const base = reportText({
    kind: it.kind === 'RECON' ? 'RECON' : 'CONTACT',
    cell: it.cell ? (it.cellUncertain ? `${it.cell[0]}?` : it.cell) : null,
    unitType: it.unitType,
    count: it.count,
    observedAtMs: it.observedAtMs,
  });
  return `${base} [GARBLED]`;
}

export function garbleText(ctx: Ctx, text: string): string {
  return text
    .split(' ')
    .map((w) => (chance(ctx.s, 0.3) ? GARBLE : w))
    .join(' ');
}

const SWAP: Partial<Record<UnitType, UnitType>> = {
  ARMOUR: 'INFANTRY',
  INFANTRY: 'ARMOUR',
  MECH: 'INFANTRY',
  RECCE: 'ARMOUR',
};

/** Contradictory twin of a contact (count ±2..4, type swap, or cell shifted by one). */
export function makeConflictTwin(ctx: Ctx, orig: IntelItem): IntelItem {
  const s = ctx.s;
  const twin: IntelItem = {
    ...orig,
    id: nextId(s, 'I'),
    sourceLabel: 'UNCONFIRMED',
    confidence: 'L',
    corrupted: false,
    forwardedBy: null,
  };
  const mode = randInt(s, 0, 2);
  if (mode === 0 || !orig.cell) {
    const delta = randInt(s, 2, 4) * (chance(s, 0.5) ? 1 : -1);
    twin.count = Math.max(0, (orig.count ?? 3) + delta);
  } else if (mode === 1) {
    twin.unitType = SWAP[orig.unitType ?? 'ARMOUR'] ?? 'ARMOUR';
  } else {
    twin.cell = pick(s, neighbours(orig.cell));
  }
  twin.text = reportText({
    kind: 'CONTACT',
    cell: twin.cell,
    unitType: twin.unitType,
    count: twin.count,
    observedAtMs: twin.observedAtMs,
  });
  return twin;
}

/** Deliver all pending items due at or before now (PRD §7.3 step 6 — staleness stamped by observedAt). */
export function deliverDue(ctx: Ctx): void {
  const s = ctx.s;
  const due = s.pending
    .filter((p) => p.deliverAtMs <= s.tMs)
    .sort((a, b) => a.deliverAtMs - b.deliverAtMs || a.seq - b.seq);
  if (due.length === 0) return;
  const dueIds = new Set(due.map((d) => d.id));
  s.pending = s.pending.filter((p) => !dueIds.has(p.id));
  for (const d of due) {
    const rs = s.roles[d.to];
    if (!rs) continue;
    bump(s.stats.channels, d.channel, 'delivered');
    if (d.payload.kind === 'INTEL') {
      const item = { ...d.payload.item, deliveredAtMs: s.tMs };
      const meta = s.reportMeta[item.id];
      if (meta && !meta.spoofed) markSpotted(ctx, meta.truthUnitIds);
      rs.intel.push(item);
      if (rs.intel.length > 400) rs.intel.splice(0, rs.intel.length - 400);
    } else {
      const msg: MessageItem = { ...d.payload.item, deliveredAtMs: s.tMs };
      rs.messages.push(msg);
      if (rs.messages.length > 200) rs.messages.splice(0, rs.messages.length - 200);
      const intent = d.payload.intent;
      if (intent && intent.version > rs.intent.version) {
        rs.intent = {
          version: intent.version,
          text: intent.text,
          receivedAtMs: s.tMs,
          byCallsign: msg.fromCallsign,
        };
      }
    }
    if (d.playerTraffic) {
      bump(s.stats.edges, `${d.from}>${d.to}`, 'delivered');
      const fromRole = s.roles[d.from as RoleId] ? (d.from as RoleId) : null;
      if (fromRole) {
        const st = roleStats(ctx, fromRole);
        st.delivered++;
        st.latencySumMs += s.tMs - d.sentAtMs;
        st.latencyN++;
      }
      roleStats(ctx, d.to).received++;
      journal(s, 'MSG_DELIVERED', `${d.channel} ${d.from} → ${d.to} delivered`, d.to, d.from);
    }
  }
}

