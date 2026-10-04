import {
  cellCentre,
  cellSteps,
  dist,
  vecToCell,
  type ChannelId,
  type ChannelView,
  type ContactView,
  type FriendlyView,
  type InstructorState,
  type KnowableSnapshot,
  type MselView,
  type PerceivedPicture,
  type RoleId,
  type SpectrumDetection,
  type TruthLinkView,
  type TruthSnapshot,
} from '@vanguard/shared';
import { brief, airOnStation, rho, unitsInCell } from './adjudication';
import { detectConflicts } from './conflicts';
import { effectiveLink, hintFor, levelName, roleChannelStatus, roleLink, sharedChannels } from './links';
import { probeStatus } from './probes';
import type { Ctx, MselState } from './state';
import { isMoving, perceivedOwnPos, roleUnit, unitPos } from './tracks';

export const CONTACT_MAX_AGE_MS = 900_000;
const PACE_SLOTS = ['P', 'A', 'C', 'E'] as const;

function channelsFor(ctx: Ctx, role: RoleId): ChannelView[] {
  const s = ctx.s;
  const rs = s.roles[role]!;
  const pace = ctx.roleSpec[role]!.pace;
  const messaging = (Object.keys(ctx.ch) as ChannelId[]).filter(
    (c) => ctx.ch[c].messaging && ctx.ch[c].members.includes(role),
  );
  const feeds = [...new Set(ctx.sc.sensors.filter((x) => x.deliverTo.includes(role)).map((x) => x.channel))].filter(
    (c) => !ctx.ch[c].messaging,
  );
  const ordered = [...pace, ...messaging.filter((c) => !pace.includes(c)), ...feeds.filter((c) => !pace.includes(c))];
  const views: ChannelView[] = [];
  for (const c of [...new Set(ordered)]) {
    const ch = ctx.ch[c];
    const hop = s.freqHops[c];
    const slotIdx = pace.indexOf(c);
    if (ch.messaging) {
      const st = roleChannelStatus(ctx, role, c);
      views.push({
        channel: c,
        label: ch.label,
        paceSlot: slotIdx >= 0 ? PACE_SLOTS[slotIdx]! : null,
        level: levelName(st.level),
        hint: st.hint,
        peers: st.peers.map((p) => ({
          peer: p.peer,
          peerLabel: p.peer === 'HHQ' ? 'Higher HQ' : ctx.roleSpec[p.peer]!.callsign,
          level: levelName(p.level),
          hint: p.hint,
        })),
        isActive: rs.activeChannel === c,
        messaging: true,
        hopActiveUntilMs: hop && hop.untilMs > s.tMs ? hop.untilMs : null,
        hopCooldownUntilMs: hop && hop.cooldownUntilMs > s.tMs ? hop.cooldownUntilMs : null,
      });
    } else {
      // Feed channel: status of the best sensor feed reaching this role.
      const rolePos = unitPos(roleUnit(ctx, role), s.tMs);
      let best = 2 as 0 | 1 | 2;
      let hint = 'NO_SIGNAL' as ChannelView['hint'];
      for (const sensor of ctx.sc.sensors.filter((x) => x.channel === c && x.deliverTo.includes(role))) {
        const st = s.sensors.find((x) => x.id === sensor.id)!;
        const l = effectiveLink(ctx, c, { role: null, pos: st.pos }, { role, pos: rolePos });
        const lvl = l.silentDrop ? 0 : l.level;
        if (lvl <= best) {
          best = lvl;
          hint = l.silentDrop ? 'OK' : hintFor(l);
        }
      }
      views.push({
        channel: c,
        label: ch.label,
        paceSlot: null,
        level: levelName(best),
        hint,
        peers: [],
        isActive: false,
        messaging: false,
        hopActiveUntilMs: hop && hop.untilMs > s.tMs ? hop.untilMs : null,
        hopCooldownUntilMs: hop && hop.cooldownUntilMs > s.tMs ? hop.cooldownUntilMs : null,
      });
    }
  }
  return views;
}

function contactsFrom(ctx: Ctx, role: RoleId, conflictIds: Set<string>): ContactView[] {
  const s = ctx.s;
  const rs = s.roles[role]!;
  const latest = new Map<string, ContactView>();
  for (const i of rs.intel) {
    if (!i.cell || (i.kind !== 'CONTACT' && i.kind !== 'NEGATIVE' && i.kind !== 'RECON')) continue;
    if (s.tMs - i.observedAtMs > CONTACT_MAX_AGE_MS) continue;
    const key = `${i.sourceLabel}|${i.cell}|${i.kind}`;
    latest.set(key, {
      itemId: i.id,
      kind: i.kind,
      cell: i.cell,
      cellUncertain: i.cellUncertain,
      unitType: i.unitType,
      count: i.count,
      observedAtMs: i.observedAtMs,
      confidence: i.confidence,
      sourceLabel: i.sourceLabel + (i.forwardedBy ? ` via ${i.forwardedBy}` : ''),
      inConflict: conflictIds.has(i.id),
    });
  }
  return [...latest.values()].sort((a, b) => a.observedAtMs - b.observedAtMs).slice(-40);
}

function friendliesFrom(ctx: Ctx, role: RoleId): FriendlyView[] {
  const latest = new Map<RoleId, FriendlyView>();
  for (const i of ctx.s.roles[role]!.intel) {
    if (i.kind !== 'POSREP' || !i.subjectRole || i.subjectRole === role) continue;
    const prev = latest.get(i.subjectRole);
    if (prev && prev.observedAtMs > i.observedAtMs) continue;
    latest.set(i.subjectRole, {
      role: i.subjectRole,
      callsign: ctx.roleSpec[i.subjectRole]!.callsign,
      cell: i.cellUncertain ? null : i.cell,
      pos: i.cell && !i.cellUncertain ? cellCentre(i.cell) : null,
      observedAtMs: i.observedAtMs,
      sourceLabel: i.sourceLabel + (i.forwardedBy ? ` via ${i.forwardedBy}` : ''),
    });
  }
  return [...latest.values()].sort((a, b) => (a.role < b.role ? -1 : 1));
}

function spectrumFor(ctx: Ctx, role: RoleId): SpectrumDetection[] | null {
  if (role !== 'EW') return null;
  const s = ctx.s;
  const here = unitPos(roleUnit(ctx, role), s.tMs);
  const out: SpectrumDetection[] = [];
  s.jammers.forEach((j, idx) => {
    if (!j.active) return;
    const d = dist(here, j.pos);
    if (d > 4) return;
    out.push({
      label: `EMITTER-${idx + 1}`,
      bands: [...j.bands],
      approxCell: vecToCell({ x: j.pos.x + j.dfOffset.dx, y: j.pos.y + j.dfOffset.dy }),
      signal: d < 1.5 ? 'HIGH' : d < 3 ? 'MED' : 'LOW',
    });
  });
  return out;
}

/** Per-role perceived picture (PRD §6.1). The ONLY function that builds trainee payloads. */
export function project(ctx: Ctx, role: RoleId, sessionCode: string): PerceivedPicture {
  const s = ctx.s;
  const rs = s.roles[role]!;
  const spec = ctx.roleSpec[role]!;
  const u = roleUnit(ctx, role);
  const flagged = new Set(rs.flags.flatMap((f) => f.itemIds));
  const conflicts = detectConflicts(rs.intel, flagged);
  const conflictIds = new Set(conflicts.flatMap((c) => c.itemIds));
  const ownPos = perceivedOwnPos(ctx, role);
  const channels = channelsFor(ctx, role);
  const netMembers: PerceivedPicture['netMembers'] = {};
  for (const c of channels) {
    if (!c.messaging) continue;
    netMembers[c.channel] = ctx.ch[c.channel].members.filter(
      (m) => m !== role && s.enabledRoles.includes(m as RoleId),
    ) as RoleId[];
  }
  const ownSensors = ctx.sc.sensors.filter((x) => x.ownerRole === role);
  const probe = s.probes.find((p) => p.endedAtMs === null && p.questions[role]);
  const sup = spec.superior;
  return {
    kind: 'perceived',
    sessionCode,
    scenarioTitle: ctx.sc.title,
    role,
    roleTitle: spec.title,
    callsign: spec.callsign,
    phase: s.phase,
    tMs: s.tMs,
    speed: s.speed,
    terrain: [...ctx.sc.terrain],
    features: ctx.sc.features.map((f) => ({ id: f.id, label: f.label, kind: f.kind, cell: f.cell })),
    objectives: ctx.sc.objectives.map((o) => ({ ...o })),
    superior: { id: sup, label: sup === 'HHQ' ? 'Higher HQ' : ctx.roleSpec[sup]!.callsign },
    ownUnit: {
      callsign: spec.callsign,
      type: u.type,
      pos: ownPos,
      cell: vecToCell(ownPos),
      strengthPct: Math.round((u.strength / u.maxStrength) * 100),
      status: u.status,
      moving: isMoving(u, s.tMs),
      destination: isMoving(u, s.tMs) ? u.orderedCell : null,
      actingRelay: rs.actingRelay,
    },
    friendlies: friendliesFrom(ctx, role),
    contacts: contactsFrom(ctx, role, conflictIds),
    conflicts,
    intel: rs.intel.slice(-120).map((i) => ({ ...i })),
    messages: rs.messages.slice(-80).map((m) => ({ ...m })),
    sent: rs.sent.slice(-40).map((m) => ({ ...m, to: [...m.to] })),
    channels,
    activeChannel: rs.activeChannel,
    netMembers,
    cutOff: rs.cutOff,
    cutOffSinceMs: rs.cutOffSinceMs,
    intent: { ...rs.intent },
    flaggedItemIds: [...flagged].sort(),
    verificationItemIds: rs.verifications.map((v) => v.itemId),
    decisions: s.decisions
      .filter((d) => d.role === role)
      .map((d) => ({
        id: d.id,
        tMs: d.tMs,
        action: d.action,
        targetCell: d.targetCell,
        channel: d.channel,
        confidence: d.confidence,
        rationale: d.rationale,
        intentSelf: d.intentSelf,
        cutOff: d.cutOff,
      })),
    probe: probe
      ? {
          id: probe.id,
          startedAtMs: probe.startedAtMs,
          submitted: !!probe.answers[role],
          questions: probe.questions[role]!.map((q) => ({
            id: q.id,
            kind: q.kind,
            text: q.text,
            input: q.input,
            options: [...q.options],
          })),
        }
      : null,
    spectrum: spectrumFor(ctx, role),
    air:
      role === 'ALO' || ownSensors.length > 0
        ? {
            requested: role === 'ALO' ? s.air.onStationAtMs !== null : false,
            onStationAtMs: role === 'ALO' ? s.air.onStationAtMs : null,
            sortiesLeft: role === 'ALO' ? s.air.sortiesLeft : 0,
            isrTasking: ownSensors.map((x) => ({
              label: x.label,
              cell: vecToCell(s.sensors.find((st) => st.id === x.id)!.pos),
            })),
          }
        : null,
    roster: ctx.sc.roles
      .filter((r) => s.enabledRoles.includes(r.id))
      .map((r) => ({
        role: r.id,
        title: r.title,
        callsign: r.callsign,
        joined: s.roles[r.id]!.joined,
      })),
  };
}

/** Frozen "what was knowable" snapshot at decision time (hindsight-safe card front). */
export function knowableSnapshot(ctx: Ctx, role: RoleId, basedOn: string[]): KnowableSnapshot {
  const pic = project(ctx, role, '');
  const t = ctx.s.tMs;
  const recent = pic.intel.slice(-20);
  const extra = pic.intel.filter((i) => basedOn.includes(i.id) && !recent.includes(i));
  return {
    ownCell: pic.ownUnit.cell,
    activeChannel: pic.activeChannel,
    cutOff: pic.cutOff,
    intentVersion: pic.intent.version,
    intentText: pic.intent.text,
    intel: [...extra, ...recent].map((i) => ({ ...i, ageMs: t - i.observedAtMs })),
    openConflicts: pic.conflicts,
    outages: pic.channels
      .filter((c) => c.level !== 'CLEAR')
      .map((c) => ({ channel: c.channel, level: c.level, hint: c.hint })),
    friendlies: pic.friendlies.map((f) => ({ ...f, ageMs: t - f.observedAtMs })),
  };
}

/** Ground truth at decision time (hindsight card back). */
export function truthSnapshot(ctx: Ctx, role: RoleId, targetCell: string | null): TruthSnapshot {
  const s = ctx.s;
  const own = roleUnit(ctx, role);
  const ownCell = vecToCell(unitPos(own, s.tMs));
  const tgt = targetCell ?? ownCell;
  const near = s.units.filter(
    (u) => u.side === 'RED' && u.status === 'ACTIVE' && cellSteps(vecToCell(unitPos(u, s.tMs)), tgt) === 1,
  );
  return {
    ownCell,
    ownStrength: Math.round(own.strength),
    targetCell,
    hostilesInTarget: unitsInCell(ctx, tgt, 'RED').map((u) => brief(ctx, u)),
    hostilesAdjacent: near.map((u) => brief(ctx, u)),
    friendliesInTarget: unitsInCell(ctx, tgt, 'BLUE').map((u) => u.callsign),
    rho: rho(ctx, tgt, own),
    airOnStation: airOnStation(ctx),
    features: s.features.map((f) => ({ id: f.id, label: f.label, intact: f.intact })),
  };
}

function mselSummary(m: MselState): string {
  const a = m.action;
  switch (a.kind) {
    case 'INJECT':
      return `${a.inject.type} on ${a.inject.channels.join('/')}${a.inject.roles.length ? ` → ${a.inject.roles.join(',')}` : ''} for ${a.inject.durationS}s`;
    case 'JAMMER':
      return `Jammer ${a.jammer.id} at ${a.jammer.cell} r=${a.jammer.radius} [${a.jammer.bands.join(',')}]`;
    case 'JAMMER_TOGGLE':
      return `Jammer ${a.jammerId} ${a.active ? 'ON' : 'OFF'}`;
    case 'CYBER':
      return `${a.cyber.kind}${a.cyber.role ? ` (${a.cyber.role})` : ''} for ${a.cyber.durationS}s`;
    case 'REPORT':
      return `Report via ${a.report.channel} → ${a.report.to.join(',')}`;
  }
}

export function mselViews(ctx: Ctx): MselView[] {
  return ctx.s.msel.map((m) => ({
    id: m.id,
    atS: m.atS,
    title: m.title,
    kind: m.action.kind,
    summary: mselSummary(m),
    status: m.status,
    firedAtMs: m.firedAtMs,
  }));
}

export function truthLinks(ctx: Ctx): TruthLinkView[] {
  const out: TruthLinkView[] = [];
  for (const role of ctx.s.enabledRoles) {
    const sup = ctx.roleSpec[role]!.superior;
    if (sup !== 'HHQ' && !ctx.s.enabledRoles.includes(sup)) continue;
    for (const c of sharedChannels(ctx, role, sup)) {
      const l = roleLink(ctx, c, role, sup);
      out.push({
        channel: c,
        a: role,
        b: sup,
        level: levelName(l.level),
        causes: l.causes,
        viaRelay: l.viaRelay,
      });
    }
  }
  return out;
}

/** DS / AAR truth view. `connected` is server-side presence info. */
export function projectTruth(ctx: Ctx, sessionCode: string, connected: ReadonlySet<RoleId> = new Set()): InstructorState {
  const s = ctx.s;
  const links = truthLinks(ctx);
  const comms = (Object.keys(ctx.ch) as ChannelId[]).map((c) => {
    const st = s.stats.channels[c] ?? { sent: 0, delivered: 0, dropped: 0, corrupted: 0 };
    const ls = links.filter((l) => l.channel === c);
    return {
      channel: c,
      ...st,
      clearLinks: ls.filter((l) => l.level === 'CLEAR').length,
      degradedLinks: ls.filter((l) => l.level === 'DEGRADED').length,
      deniedLinks: ls.filter((l) => l.level === 'DENIED').length,
    };
  });
  return {
    kind: 'truth',
    sessionCode,
    scenarioId: ctx.sc.id,
    scenarioTitle: ctx.sc.title,
    phase: s.phase,
    tMs: s.tMs,
    speed: s.speed,
    durationMin: ctx.sc.durationMin,
    terrain: [...ctx.sc.terrain],
    features: s.features.map((f) => ({ ...f })),
    objectives: ctx.sc.objectives.map((o) => ({ ...o })),
    intent: { version: s.intent.version, text: s.intent.text, byCallsign: s.intent.byCallsign },
    units: s.units.map((u) => {
      const p = unitPos(u, s.tMs);
      const last = u.track[u.track.length - 1]!;
      return {
        id: u.id,
        side: u.side,
        callsign: u.callsign,
        type: u.type,
        count: u.count,
        strength: Math.round(u.strength),
        strengthPct: Math.round((u.strength / u.maxStrength) * 100),
        decoy: u.decoy,
        pos: p,
        cell: vecToCell(p),
        status: u.status,
        ownerRole: u.ownerRole,
        destination: isMoving(u, s.tMs) ? vecToCell(last) : null,
      };
    }),
    jammers: s.jammers.map((j) => ({
      id: j.id,
      label: j.label ?? j.id,
      cell: j.cell,
      radius: j.radius,
      bands: [...j.bands],
      power: j.power,
      active: j.active,
    })),
    relays: [
      ...s.relays.map((r) => ({ id: r.id, label: r.label, cell: vecToCell(r.pos), pos: r.pos, active: s.tMs >= r.activeFromMs })),
      ...s.enabledRoles
        .filter((r) => s.roles[r]!.actingRelay)
        .map((r) => {
          const p = unitPos(roleUnit(ctx, r), s.tMs);
          return { id: `relay-${r}`, label: `${ctx.roleSpec[r]!.callsign} (relay)`, cell: vecToCell(p), pos: p, active: true };
        }),
    ],
    links,
    effects: [
      ...s.injects
        .filter((i) => !i.expired)
        .map((i) => ({
          id: i.id,
          kind: 'INJECT' as const,
          type: i.spec.type,
          label: i.spec.label ?? `${i.spec.type} ${i.spec.channels.join('/')}`,
          channels: [...i.spec.channels],
          roles: [...i.spec.roles],
          startMs: i.startMs,
          endMs: i.endMs,
        })),
      ...s.cyber
        .filter((c) => !c.expired)
        .map((c) => ({
          id: c.id,
          kind: 'CYBER' as const,
          type: c.spec.kind,
          label: c.spec.kind + (c.spec.role ? ` (${c.spec.role})` : ''),
          channels: c.spec.kind === 'C2_OUTAGE'
            ? (Object.keys(ctx.ch) as ChannelId[]).filter((k) => ctx.ch[k].digital)
            : c.spec.kind === 'DATALINK_COMPROMISE' ? (['ISR_DATALINK'] as ChannelId[]) : [],
          roles: c.spec.role ? [c.spec.role] : [],
          startMs: c.startMs,
          endMs: c.endMs,
        })),
    ],
    msel: mselViews(ctx),
    decisions: s.decisions.map((d) => ({ ...d })),
    roles: ctx.sc.roles.map((r) => {
      const rs = s.roles[r.id]!;
      const u = roleUnit(ctx, r.id);
      const decs = s.decisions.filter((d) => d.role === r.id);
      return {
        role: r.id,
        title: r.title,
        callsign: rs.playerCallsign ? `${r.callsign} · ${rs.playerCallsign}` : r.callsign,
        enabled: rs.enabled,
        joined: rs.joined,
        connected: connected.has(r.id),
        cutOff: rs.cutOff,
        activeChannel: rs.activeChannel,
        decisions: decs.length,
        lastDecisionMs: decs.length ? decs[decs.length - 1]!.tMs : null,
        perceivedCell: vecToCell(perceivedOwnPos(ctx, r.id)),
        trueCell: vecToCell(unitPos(u, s.tMs)),
      };
    }),
    comms,
    probes: s.probes.map((p) => probeStatus(p, s.enabledRoles)),
    air: { ...s.air },
    journal: s.journal.slice(-80).map((j) => ({ tMs: j.tMs, kind: j.kind, role: j.role, text: j.text })),
  };
}

