import {
  CHANNEL_SOURCE_LABEL,
  allCells,
  cellCentre,
  dist,
  formatT,
  neighbours,
  reportText,
  vecToCell,
  type Cell,
  type ChannelId,
  type Confidence,
  type IntelItem,
  type RoleId,
  type ScriptedReport,
  type UnitType,
  type Vec,
} from '@vanguard/shared';
import { injectApplies, sharedChannels } from './links';
import { markSpotted } from './opfor';
import { transmit } from './pipeline';
import { chance, pick, randInt } from './rng';
import { journal, nextId, type Ctx, type ReportMeta, type UnitState } from './state';
import { clampToGrid, perceivedOwnPos, posAt, roleUnit, unitPos } from './tracks';

export const SPOOF_INTERVAL_MS = 30_000;
export const OWN_OBS_INTERVAL_MS = 30_000;
export const POSREP_INTERVAL_MS = 60_000;
export const SENSOR_REFRESH_EVERY = 5;

interface Observation {
  cell: Cell;
  unitType: UnitType;
  count: number;
  unitIds: string[];
  decoyOnly: boolean;
}

function activeHostiles(ctx: Ctx): UnitState[] {
  return ctx.s.units.filter((u) => u.side === 'RED' && u.status === 'ACTIVE');
}

/** Group observed hostile units by (cell, perceived type). */
export function observe(
  ctx: Ctx,
  origin: Vec,
  range: number,
  tMs: number,
  opts: { discriminates: boolean; detects?: UnitType[]; closeDecoyRange?: number },
): Observation[] {
  const groups = new Map<string, Observation>();
  for (const u of activeHostiles(ctx)) {
    if (opts.detects && !opts.detects.includes(u.type)) continue;
    const p = posAt(u.track, tMs);
    const d = dist(origin, p);
    if (d > range) continue;
    let type: UnitType = u.type;
    if (u.decoy) {
      if (opts.discriminates) continue;
      if (opts.closeDecoyRange !== undefined && d <= opts.closeDecoyRange) type = 'DECOY';
    }
    const cell = vecToCell(p);
    const key = `${cell}|${type}`;
    const g = groups.get(key) ?? { cell, unitType: type, count: 0, unitIds: [], decoyOnly: true };
    g.count += u.count;
    g.unitIds.push(u.id);
    g.decoyOnly = g.decoyOnly && u.decoy;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.cell + a.unitType < b.cell + b.unitType ? -1 : 1));
}

export function makeIntel(
  ctx: Ctx,
  base: Omit<IntelItem, 'id' | 'deliveredAtMs' | 'corrupted' | 'forwardedBy' | 'text' | 'subjectRole'> & {
    text?: string;
    subjectRole?: RoleId | null;
  },
): IntelItem {
  return {
    id: nextId(ctx.s, 'I'),
    deliveredAtMs: 0,
    corrupted: false,
    forwardedBy: null,
    subjectRole: base.subjectRole ?? null,
    ...base,
    text:
      base.text ??
      reportText({
        kind: base.kind,
        cell: base.cell,
        unitType: base.unitType,
        count: base.count,
        observedAtMs: base.observedAtMs,
      }),
  };
}

function staleInjectFor(ctx: Ctx, channel: ChannelId, role: RoleId) {
  return ctx.s.injects.find(
    (i) => i.spec.type === 'STALE' && injectApplies(i, channel, [role], ctx.s.tMs),
  );
}

function datalinkCompromised(ctx: Ctx): boolean {
  return ctx.s.cyber.some(
    (c) =>
      c.spec.kind === 'DATALINK_COMPROMISE' && !c.expired && ctx.s.tMs >= c.startMs && ctx.s.tMs < c.endMs,
  );
}

/** One sensor sweep → CONTACT/NEGATIVE reports on change (and periodic refresh). */
export function sensorSweep(ctx: Ctx, sensorId: string): void {
  const s = ctx.s;
  const st = s.sensors.find((x) => x.id === sensorId)!;
  const spec = ctx.sensorSpec[sensorId]!;
  st.sweepCount += 1;
  const obs = observe(ctx, st.pos, spec.rangeCells, s.tMs, {
    discriminates: spec.discriminatesDecoys,
    detects: spec.detects,
  });
  const sigs = new Map<Cell, string>();
  const byCell = new Map<Cell, Observation[]>();
  for (const o of obs) {
    byCell.set(o.cell, [...(byCell.get(o.cell) ?? []), o]);
  }
  for (const [cell, list] of byCell) sigs.set(cell, list.map((o) => `${o.unitType}:${o.count}`).join(','));
  if (spec.reportsNegatives) {
    for (const c of allCells()) {
      if (dist(cellCentre(c), st.pos) <= spec.rangeCells && !sigs.has(c)) sigs.set(c, 'NEG');
    }
  }
  const refresh = st.sweepCount % SENSOR_REFRESH_EVERY === 0;
  const cells = [...new Set([...sigs.keys(), ...Object.keys(st.lastSig)])].sort();
  for (const cell of cells) {
    const sig = sigs.get(cell);
    const prev = st.lastSig[cell];
    if (sig === undefined) {
      // Contact disappeared from coverage — a sensor with negatives will report NEG via sigs.
      delete st.lastSig[cell];
      continue;
    }
    const changed = sig !== prev;
    if (!changed && !refresh) continue;
    st.lastSig[cell] = sig;
    const list = byCell.get(cell) ?? [];
    if (sig === 'NEG') {
      sendReport(ctx, spec.channel, sensorId, spec.label, spec.deliverTo, () => ({
        kind: 'NEGATIVE',
        cell,
        unitType: null,
        count: 0,
        confidence: 'M',
        meta: { truthUnitIds: [], spoofed: false, decoyOnly: false, twin: false, stale: false },
      }));
      continue;
    }
    for (const o of list) {
      sendReport(ctx, spec.channel, sensorId, spec.label, spec.deliverTo, (to) => {
        const stale = staleInjectFor(ctx, spec.channel, to);
        let reportCell = o.cell;
        let observedAtMs = s.tMs;
        let spoofed = false;
        if (stale) {
          const staleMs = (stale.spec.params.staleS ?? 300) * 1000;
          observedAtMs = Math.max(0, s.tMs - staleMs);
          const units = o.unitIds.map((id) => s.units.find((u) => u.id === id)!);
          reportCell = vecToCell(posAt(units[0]!.track, observedAtMs));
        }
        if (spec.channel === 'ISR_DATALINK' && datalinkCompromised(ctx) && chance(s, 0.5)) {
          const shift = randInt(s, 1, 2);
          let c = reportCell;
          for (let i = 0; i < shift; i++) c = pick(s, neighbours(c));
          reportCell = c;
          spoofed = true;
        }
        return {
          kind: 'CONTACT',
          cell: reportCell,
          unitType: o.unitType,
          count: o.count,
          confidence: 'M',
          observedAtMs,
          meta: {
            truthUnitIds: o.unitIds,
            spoofed,
            decoyOnly: o.decoyOnly,
            twin: false,
            stale: !!stale,
          },
        };
      });
    }
  }
}

interface ReportSpec {
  kind: IntelItem['kind'];
  cell: Cell | null;
  unitType: UnitType | null;
  count: number | null;
  confidence: Confidence;
  observedAtMs?: number;
  text?: string;
  meta: ReportMeta;
  subjectRole?: RoleId | null;
}

export function sendReport(
  ctx: Ctx,
  channel: ChannelId,
  from: string,
  sourceLabel: string,
  to: RoleId[],
  spec: (to: RoleId) => ReportSpec,
  fromPos?: Vec | ((to: RoleId) => Vec),
  fromRole: RoleId | null = null,
): void {
  const metas = new Map<RoleId, ReportMeta>();
  transmit(ctx, {
    channel,
    from,
    fromRole,
    fromPos,
    to,
    playerTraffic: false,
    build: (r) => {
      const sp = spec(r);
      metas.set(r, sp.meta);
      const item = makeIntel(ctx, {
        kind: sp.kind,
        sourceLabel,
        channel,
        observedAtMs: sp.observedAtMs ?? ctx.s.tMs,
        cell: sp.cell,
        cellUncertain: false,
        side: sp.kind === 'POSREP' ? 'BLUE' : sp.kind === 'INFO' ? null : 'RED',
        unitType: sp.unitType,
        count: sp.count,
        confidence: sp.confidence,
        text: sp.text,
        subjectRole: sp.subjectRole ?? null,
      });
      return { kind: 'INTEL', item };
    },
    meta: (r) => metas.get(r) ?? null,
  });
}

/** Own-unit observation: delivered straight into the owner's picture (no channel). */
export function ownObservation(ctx: Ctx, role: RoleId): void {
  const s = ctx.s;
  const rs = s.roles[role]!;
  const u = roleUnit(ctx, role);
  if (u.status !== 'ACTIVE') return;
  const here = unitPos(u, s.tMs);
  const obs = observe(ctx, here, u.visualRange, s.tMs, { discriminates: false, closeDecoyRange: 0.6 });
  const seen = new Set<string>();
  for (const o of obs) {
    const key = `C:${o.cell}|${o.unitType}`;
    const sig = String(o.count);
    seen.add(key);
    if (rs.ownObsSig[key] === sig) continue;
    rs.ownObsSig[key] = sig;
    const item = makeIntel(ctx, {
      kind: 'CONTACT',
      sourceLabel: `OWN OBS (${ctx.roleSpec[role]!.callsign})`,
      channel: 'OWN',
      observedAtMs: s.tMs,
      cell: o.cell,
      cellUncertain: false,
      side: 'RED',
      unitType: o.unitType,
      count: o.count,
      confidence: o.unitType === 'DECOY' ? 'M' : 'H',
      text:
        o.unitType === 'DECOY'
          ? `OBSERVATION. ${o.count}x vehicles at GRID ${o.cell} appear static and inflatable — POSSIBLE DECOYS.`
          : undefined,
    });
    item.deliveredAtMs = s.tMs;
    rs.intel.push(item);
    markSpotted(ctx, o.unitIds);
    s.reportMeta[item.id] = {
      truthUnitIds: o.unitIds,
      spoofed: false,
      decoyOnly: o.decoyOnly,
      twin: false,
      stale: false,
    };
  }
  for (const k of Object.keys(rs.ownObsSig)) {
    if (k.startsWith('C:') && !seen.has(k)) delete rs.ownObsSig[k];
  }
  // Features within visual range (e.g., bridge blown)
  for (const f of s.features) {
    if (dist(cellCentre(f.cell), here) > u.visualRange + 0.5) continue;
    const key = `F:${f.id}`;
    const sig = f.intact ? 'INTACT' : 'DOWN';
    if (rs.ownObsSig[key] === sig) continue;
    const first = rs.ownObsSig[key] === undefined;
    rs.ownObsSig[key] = sig;
    if (first && f.intact) continue;
    const item = makeIntel(ctx, {
      kind: 'INFO',
      sourceLabel: `OWN OBS (${ctx.roleSpec[role]!.callsign})`,
      channel: 'OWN',
      observedAtMs: s.tMs,
      cell: f.cell,
      cellUncertain: false,
      side: null,
      unitType: null,
      count: null,
      confidence: 'H',
      text: `OBSERVATION. ${f.label} at GRID ${f.cell} is ${f.intact ? 'INTACT' : 'DESTROYED'}.`,
    });
    item.deliveredAtMs = s.tMs;
    rs.intel.push(item);
  }
}

/** Preferred channel from a role to a recipient: given channel if shared, else first shared PACE channel, else RUNNER. */
export function routeChannel(ctx: Ctx, from: RoleId, to: RoleId | 'HHQ', preferred: ChannelId): ChannelId {
  const pref = ctx.ch[preferred];
  if (pref.messaging && pref.members.includes(from) && pref.members.includes(to)) return preferred;
  const pace = ctx.roleSpec[from]!.pace;
  const shared = sharedChannels(ctx, from, to);
  return pace.find((c) => shared.includes(c)) ?? shared[0] ?? 'RUNNER';
}

/** Automatic position report to the superior over the active channel. */
export function sendPosrep(ctx: Ctx, role: RoleId): void {
  const s = ctx.s;
  const rs = s.roles[role]!;
  const sup = ctx.roleSpec[role]!.superior;
  if (sup === 'HHQ' || !s.enabledRoles.includes(sup)) return;
  const u = roleUnit(ctx, role);
  if (u.status === 'DESTROYED') return;
  const p = perceivedOwnPos(ctx, role);
  const cell = vecToCell(p);
  const channel = routeChannel(ctx, role, sup, rs.activeChannel);
  const callsign = ctx.roleSpec[role]!.callsign;
  sendReport(
    ctx,
    channel,
    role,
    callsign,
    [sup],
    () => ({
      kind: 'POSREP',
      cell,
      unitType: u.type,
      count: null,
      confidence: 'H',
      text: reportText({ kind: 'POSREP', cell, unitType: u.type, count: null, observedAtMs: s.tMs, callsign }),
      meta: { truthUnitIds: [u.id], spoofed: !!rs.gps, decoyOnly: false, twin: false, stale: false },
      subjectRole: role,
    }),
    undefined,
    role,
  );
}

export function sendScripted(ctx: Ctx, r: ScriptedReport): void {
  sendReport(ctx, r.channel, r.from, r.fromLabel, r.to, () => ({
    kind: r.kind,
    cell: r.cell ?? null,
    unitType: r.unitType ?? null,
    count: r.count ?? null,
    confidence: r.confidence,
    text: r.text,
    meta: { truthUnitIds: [], spoofed: false, decoyOnly: false, twin: false, stale: false },
  }));
  journal(ctx.s, 'REPORT', `Scripted report via ${r.channel}: ${r.text.slice(0, 60)}`);
}

/** Spoofed contacts from SPOOF injects and DATALINK_COMPROMISE (every 30 s while active). */
export function generateSpoofs(ctx: Ctx): void {
  const s = ctx.s;
  const objectives = ctx.sc.intent.objectiveCells;
  const spoofOne = (channel: ChannelId, roles: RoleId[], target: Cell | undefined) => {
    const members = ctx.ch[channel].members.filter((m) => s.enabledRoles.includes(m as RoleId)) as RoleId[];
    const to = roles.length > 0 ? roles.filter((r) => s.enabledRoles.includes(r)) : members;
    if (to.length === 0) return;
    const base = target ?? pick(s, objectives);
    const cell = target ?? pick(s, [base, ...neighbours(base)]);
    const unitType = pick(s, ['ARMOUR', 'MECH'] as UnitType[]);
    const count = randInt(s, 3, 6);
    const sensor = ctx.sc.sensors.find((x) => x.channel === channel);
    const label = sensor?.label ?? CHANNEL_SOURCE_LABEL[channel];
    sendReport(
      ctx,
      channel,
      'SPOOF',
      label,
      to,
      () => ({
        kind: 'CONTACT',
        cell,
        unitType,
        count,
        confidence: 'M',
        meta: { truthUnitIds: [], spoofed: true, decoyOnly: false, twin: false, stale: false },
      }),
      // Hostile emitter / compromised feed reaches the recipient regardless of geometry.
      (r) => clampToGrid(perceivedOwnPos(ctx, r)),
    );
  };
  for (const inj of s.injects) {
    if (inj.spec.type !== 'SPOOF' || inj.expired || s.tMs < inj.startMs || s.tMs >= inj.endMs) continue;
    if (s.tMs - inj.lastSpoofMs < SPOOF_INTERVAL_MS) continue;
    inj.lastSpoofMs = s.tMs;
    for (const c of inj.spec.channels) spoofOne(c, inj.spec.roles, inj.spec.params.targetCell);
  }
  for (const cy of s.cyber) {
    if (cy.spec.kind !== 'DATALINK_COMPROMISE' || cy.expired || s.tMs < cy.startMs || s.tMs >= cy.endMs) continue;
    if (s.tMs - cy.lastSpoofMs < SPOOF_INTERVAL_MS) continue;
    cy.lastSpoofMs = s.tMs;
    spoofOne('ISR_DATALINK', [], undefined);
  }
}

/** CONFLICT inject with a target cell: an immediate contradictory pair about that cell. */
export function conflictPair(ctx: Ctx, channels: ChannelId[], roles: RoleId[], cell: Cell, texts?: [string, string]): void {
  const s = ctx.s;
  for (const channel of channels) {
    const members = ctx.ch[channel].members.filter((m) => s.enabledRoles.includes(m as RoleId)) as RoleId[];
    const to = roles.length > 0 ? roles.filter((r) => s.enabledRoles.includes(r)) : members;
    if (to.length === 0) continue;
    const count = randInt(s, 4, 7);
    const meta = { truthUnitIds: [], spoofed: true, decoyOnly: false, twin: true, stale: false };
    const fromPos = (r: RoleId) => perceivedOwnPos(ctx, r);
    sendReport(ctx, channel, 'INJECT', CHANNEL_SOURCE_LABEL[channel], to, () => ({
      kind: 'CONTACT', cell, unitType: 'ARMOUR', count, confidence: 'M', meta, text: texts?.[0],
    }), fromPos);
    sendReport(ctx, channel, 'INJECT', 'UNCONFIRMED', to, () => ({
      kind: 'NEGATIVE', cell, unitType: null, count: 0, confidence: 'M', meta, text: texts?.[1],
    }), fromPos);
  }
}

/** Truthful recon / verification report about a cell (decoys discriminated). */
export function reconReport(ctx: Ctx, role: RoleId, cell: Cell, label: string): void {
  const s = ctx.s;
  const real = s.units.filter(
    (u) => u.side === 'RED' && u.status === 'ACTIVE' && !u.decoy && vecToCell(unitPos(u, s.tMs)) === cell,
  );
  const decoys = s.units.filter(
    (u) => u.side === 'RED' && u.status === 'ACTIVE' && u.decoy && vecToCell(unitPos(u, s.tMs)) === cell,
  );
  const count = real.reduce((n, u) => n + u.count, 0);
  const unitType: UnitType | null = real[0]?.type ?? null;
  const decoyNote = decoys.length > 0 ? ` ${decoys.reduce((n, u) => n + u.count, 0)}x DECOYS identified.` : '';
  const rs = s.roles[role]!;
  const channel = routeChannel(ctx, role, role, rs.activeChannel);
  const text =
    count > 0
      ? `RECON REPORT. GRID ${cell}: ${count}x ${unitType} confirmed.${decoyNote} Time ${formatT(s.tMs)}.`
      : `RECON REPORT. GRID ${cell}: no hostile vehicles.${decoyNote} Time ${formatT(s.tMs)}.`;
  sendReport(
    ctx,
    channel,
    'RECON',
    label,
    [role],
    () => ({
      kind: 'RECON',
      cell,
      unitType,
      count,
      confidence: 'H',
      text,
      meta: { truthUnitIds: real.map((u) => u.id), spoofed: false, decoyOnly: false, twin: false, stale: false },
    }),
    cellCentre(cell),
  );
  journal(s, 'REPORT', `${label} on ${cell} sent to ${role} via ${channel}`, role);
}


