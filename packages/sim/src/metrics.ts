import {
  vecToCell,
  type CommsEdge,
  type DecisionRecord,
  type RoleId,
  type RoleMetrics,
  type Soundness,
  type TeamMetrics,
  type TimelineEvent,
} from '@vanguard/shared';
import { probeAccuracy, probeDivergence } from './probes';
import type { Ctx } from './state';
import { unitPos } from './tracks';

export const LATENCY_WINDOW_MS = 600_000;

const r2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]): number | null => (xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return r2(s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2);
};

/** PRD §9.1 — decision latency after triggers (injects, cyber, link loss, cut-off) per role. */
export function latencyMetrics(ctx: Ctx, role: RoleId): RoleMetrics['latency'] {
  const seen = new Set<string>();
  const triggers = ctx.s.triggers.filter((t) => {
    if (t.role !== role) return false;
    const k = `${t.tMs}|${t.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const decisions = ctx.s.decisions.filter((d) => d.role === role).map((d) => d.tMs);
  const samples = triggers.map((t) => {
    const next = decisions.find((d) => d > t.tMs);
    const lat = next !== undefined && next - t.tMs <= LATENCY_WINDOW_MS ? (next - t.tMs) / 1000 : null;
    return { trigger: t.label, tMs: t.tMs, latencyS: lat };
  });
  const vals = samples.filter((x) => x.latencyS !== null).map((x) => x.latencyS!);
  return {
    triggers: samples.length,
    meanS: mean(vals),
    medianS: median(vals),
    noResponse: samples.filter((x) => x.latencyS === null).length,
    samples,
  };
}

/** PRD §9.2 — contested decisions verified first. */
export function verificationFor(ctx: Ctx, d: DecisionRecord): { contested: boolean; verified: boolean } {
  const conflicts = d.knowable.openConflicts;
  if (conflicts.length === 0) return { contested: false, verified: false };
  const rs = ctx.s.roles[d.role]!;
  const items = new Set(conflicts.flatMap((c) => c.itemIds));
  const cells = new Set(conflicts.map((c) => c.cell));
  const flagged = rs.flags.some((f) => f.atMs <= d.tMs && f.itemIds.some((i) => items.has(i)));
  const verified = rs.verifications.some((v) => v.atMs <= d.tMs && (items.has(v.itemId) || (v.cell !== null && cells.has(v.cell))));
  return { contested: true, verified: flagged || verified };
}

export function brier(ds: DecisionRecord[]): number | null {
  return ds.length ? r2(ds.reduce((n, d) => n + (d.confidence / 100 - d.adjudication.outcome) ** 2, 0) / ds.length) : null;
}

export function overconfidence(ds: DecisionRecord[]): number | null {
  if (!ds.length) return null;
  return r2(ds.reduce((n, d) => n + d.confidence / 100, 0) / ds.length - ds.reduce((n, d) => n + d.adjudication.outcome, 0) / ds.length);
}

export function selfAwareness(ds: DecisionRecord[]): number | null {
  const rated = ds.filter((d) => d.intentSelf !== 'UNSURE');
  if (!rated.length) return null;
  return r2(rated.filter((d) => (d.intentSelf === 'YES') === d.intentScore >= 0.5).length / rated.length);
}

function cutOffSeconds(ctx: Ctx, role: RoleId): number {
  return Math.round(
    ctx.s.roles[role]!.cutOffSpans.reduce((n, s) => n + ((s.endMs ?? ctx.s.tMs) - s.startMs), 0) / 1000,
  );
}

/** Mean time from losing the active channel (or being cut off) to the next PACE switch. */
function paceResponse(ctx: Ctx, role: RoleId): number | null {
  const rs = ctx.s.roles[role]!;
  const losses = ctx.s.triggers.filter((t) => t.role === role && (/denied/.test(t.label) || t.label === 'Cut off'));
  const vals: number[] = [];
  for (const l of losses) {
    const sw = rs.paceSwitches.find((p) => p.tMs >= l.tMs);
    if (sw && sw.tMs - l.tMs <= LATENCY_WINDOW_MS) vals.push((sw.tMs - l.tMs) / 1000);
  }
  return mean(vals);
}

export function roleMetrics(ctx: Ctx, role: RoleId): RoleMetrics {
  const s = ctx.s;
  const spec = ctx.roleSpec[role]!;
  const rs = s.roles[role]!;
  const ds = s.decisions.filter((d) => d.role === role);
  const ver = ds.map((d) => verificationFor(ctx, d));
  const contested = ver.filter((v) => v.contested).length;
  const verified = ver.filter((v) => v.contested && v.verified).length;
  const cut = ds.filter((d) => d.cutOff);
  const st = s.stats.roles[role];
  const perProbe = s.probes.map((p) => ({ probeId: p.id, index: p.index, accuracy: probeAccuracy(p, role) }));
  return {
    role,
    title: spec.title,
    callsign: spec.callsign,
    joined: rs.joined || rs.playerCallsign !== null || ds.length > 0,
    decisions: ds.length,
    latency: latencyMetrics(ctx, role),
    verification: {
      contested,
      verified,
      rate: contested ? r2(verified / contested) : null,
      flags: rs.flags.length,
      verifications: rs.verifications.length,
    },
    calibration: {
      n: ds.length,
      brier: brier(ds),
      meanConfidence: ds.length ? r2(ds.reduce((n, d) => n + d.confidence, 0) / ds.length / 100) : null,
      meanOutcome: ds.length ? r2(ds.reduce((n, d) => n + d.adjudication.outcome, 0) / ds.length) : null,
      overconfidence: overconfidence(ds),
    },
    intent: {
      overall: mean(ds.map((d) => d.intentScore)),
      cutOffN: cut.length,
      cutOff: mean(cut.map((d) => d.intentScore)),
      selfAwareness: selfAwareness(ds),
    },
    sa: { perProbe, mean: mean(perProbe.filter((p) => p.accuracy !== null).map((p) => p.accuracy!)) },
    comms: {
      sent: st?.sent ?? 0,
      delivered: st?.delivered ?? 0,
      dropped: st?.dropped ?? 0,
      corrupted: st?.corrupted ?? 0,
      forwarded: st?.forwarded ?? 0,
      paceSwitches: rs.paceSwitches.length,
      received: st?.received ?? 0,
      meanLatencyS: st && st.latencyN ? r2(st.latencySumMs / st.latencyN / 1000) : null,
    },
    cutOffTotalS: cutOffSeconds(ctx, role),
    paceResponseS: paceResponse(ctx, role),
  };
}

export function teamMetrics(ctx: Ctx, roles: RoleMetrics[]): TeamMetrics {
  const s = ctx.s;
  const ds = s.decisions;
  const contested = roles.reduce((n, r) => n + r.verification.contested, 0);
  const verified = roles.reduce((n, r) => n + r.verification.verified, 0);
  const cut = ds.filter((d) => d.cutOff);
  const sas = roles.map((r) => r.sa.mean).filter((x): x is number => x !== null);
  const divs = s.probes.map((p) => probeDivergence(p).team).filter((x): x is number => x !== null);
  const sent = roles.reduce((n, r) => n + r.comms.sent, 0);
  const delivered = roles.reduce((n, r) => n + r.comms.delivered, 0);
  const soundCounts: Record<Soundness, number> = { SOUND: 0, RISKY: 0, UNSOUND: 0 };
  for (const d of ds) soundCounts[d.adjudication.soundness]++;
  return {
    decisions: ds.length,
    brier: brier(ds),
    overconfidence: overconfidence(ds),
    verificationRate: contested ? r2(verified / contested) : null,
    intentCutOff: mean(cut.map((d) => d.intentScore)),
    saMean: mean(sas),
    divergenceMean: mean(divs),
    deliveryRatio: sent ? r2(delivered / sent) : null,
    soundCounts,
  };
}


/** Player-traffic graph: who talked to whom and what was lost. */
export function commsEdges(ctx: Ctx): CommsEdge[] {
  return Object.entries(ctx.s.stats.edges)
    .map(([k, v]) => {
      const [from, to] = k.split('>') as [RoleId | 'HHQ', RoleId | 'HHQ'];
      return { from, to, sent: v.sent, delivered: v.delivered, dropped: v.dropped };
    })
    .filter((e) => e.sent > 0)
    .sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
}

const TIMELINE_KINDS: Record<string, TimelineEvent['kind']> = {
  INJECT: 'INJECT',
  CYBER: 'CYBER',
  JAMMER: 'JAMMER',
  MSG_SENT: 'MSG_SENT',
  MSG_DELIVERED: 'MSG_RECV',
  MSG_DROPPED: 'MSG_DROP',
  PROBE: 'PROBE',
  ENGAGEMENT: 'ENGAGEMENT',
  STRIKE: 'STRIKE',
  FEATURE: 'FEATURE',
  PACE: 'PACE',
};

/** Swimlane timeline (PRD US-AAR-4). One lane per role + an ALL lane for exercise-wide events. */
export function timeline(ctx: Ctx): TimelineEvent[] {
  const s = ctx.s;
  const out: TimelineEvent[] = [];
  const enabled = new Set(s.enabledRoles);
  for (const j of s.journal) {
    const kind = TIMELINE_KINDS[j.kind];
    if (!kind) continue;
    if (j.kind === 'PROBE' && j.role) continue; // per-role submissions are noise on the chart
    const lane: RoleId | 'ALL' = j.role && enabled.has(j.role) && !['INJECT', 'CYBER', 'JAMMER', 'FEATURE', 'PROBE'].includes(j.kind) ? j.role : 'ALL';
    let endMs: number | null = null;
    if (j.kind === 'INJECT' && j.ref) endMs = s.injects.find((i) => i.id === j.ref)?.endMs ?? null;
    if (j.kind === 'CYBER' && j.ref) endMs = s.cyber.find((c) => c.id === j.ref)?.endMs ?? null;
    out.push({ tMs: j.tMs, endMs, lane: kind === 'CYBER' && j.role ? j.role : lane, kind, label: j.text, ref: j.ref, soundness: null });
  }
  for (const r of s.enabledRoles) {
    for (const span of s.roles[r]!.cutOffSpans) {
      out.push({ tMs: span.startMs, endMs: span.endMs ?? s.tMs, lane: r, kind: 'CUTOFF', label: `${r} cut off`, ref: null, soundness: null });
    }
  }
  for (const d of s.decisions) {
    out.push({
      tMs: d.tMs,
      endMs: null,
      lane: d.role,
      kind: 'DECISION',
      label: `${d.action}${d.targetCell ? ` ${d.targetCell}` : ''}${d.channel ? ` ${d.channel}` : ''} (${d.confidence}%)`,
      ref: d.id,
      soundness: d.adjudication.soundness,
    });
  }
  return out.sort((a, b) => a.tMs - b.tMs).slice(0, 1500);
}

export function outcome(ctx: Ctx) {
  const s = ctx.s;
  const t = s.tMs;
  const objectives = ctx.sc.objectives.map((o) => {
    const blue = s.units.some((u) => u.side === 'BLUE' && u.status === 'ACTIVE' && vecToCell(unitPos(u, t)) === o.cell);
    const red = s.units.some((u) => u.side === 'RED' && !u.decoy && u.status === 'ACTIVE' && vecToCell(unitPos(u, t)) === o.cell);
    return { ...o, held: blue && !red };
  });
  const blueUnits = s.units.filter((u) => u.side === 'BLUE' && (!u.ownerRole || s.enabledRoles.includes(u.ownerRole)));
  const redUnits = s.units.filter((u) => u.side === 'RED' && !u.decoy);
  const pctOf = (us: typeof blueUnits) =>
    Math.round((us.reduce((n, u) => n + (u.status === 'DESTROYED' ? 0 : u.strength), 0) / Math.max(1, us.reduce((n, u) => n + u.maxStrength, 0))) * 100);
  const features = s.features.map((f) => ({ id: f.id, label: f.label, kind: f.kind, cell: f.cell, intact: f.intact }));
  const held = objectives.filter((o) => o.held).length;
  const summary = `${held}/${objectives.length} objectives held at end; friendly combat power ${pctOf(blueUnits)}%, hostile ${pctOf(redUnits)}%. ${features
    .map((f) => `${f.label} ${f.intact ? 'intact' : 'destroyed'}`)
    .join('; ')}.`;
  return { objectives, friendlyStrengthPct: pctOf(blueUnits), hostileStrengthPct: pctOf(redUnits), features, summary };
}

interface Finding {
  text: string;
  weight: number;
}

/** PRD §9.10 — rule-based sustains and improves (top 3 each by magnitude). */
export function sustainImprove(roles: RoleMetrics[], team: TeamMetrics): { sustain: string[]; improve: string[] } {
  const sustain: Finding[] = [];
  const improve: Finding[] = [];
  const pc = (x: number) => `${Math.round(x * 100)}%`;
  for (const r of roles) {
    if (r.decisions === 0 && !r.joined) continue;
    const who = `${r.callsign} (${r.title})`;
    const v = r.verification;
    if (v.rate !== null && v.contested >= 1) {
      if (v.rate >= 0.6) sustain.push({ text: `${who} verified or flagged conflicting reports before acting (${v.verified}/${v.contested}).`, weight: v.rate });
      else if (v.rate < 0.4) improve.push({ text: `${who} acted on contested intel without flagging or verifying (${v.verified}/${v.contested} verified).`, weight: 1 - v.rate });
    }
    const c = r.calibration;
    if (c.brier !== null && c.n >= 2) {
      if (c.brier <= 0.15) sustain.push({ text: `${who} was well calibrated (Brier ${c.brier.toFixed(2)}).`, weight: 0.8 - c.brier });
      else if (c.overconfidence !== null && c.overconfidence > 0.15) improve.push({ text: `${who} was overconfident: stated ${pc(c.meanConfidence ?? 0)} vs. outcome ${pc(c.meanOutcome ?? 0)} (Brier ${c.brier.toFixed(2)}).`, weight: c.overconfidence + 0.2 });
      else if (c.brier > 0.25) improve.push({ text: `${who} confidence did not match outcomes (Brier ${c.brier.toFixed(2)}).`, weight: c.brier });
    }
    if (r.intent.cutOff !== null) {
      if (r.intent.cutOff >= 0.75) sustain.push({ text: `${who} acted on the commander's intent while cut off (adherence ${pc(r.intent.cutOff)} over ${r.intent.cutOffN} decision(s)).`, weight: r.intent.cutOff + 0.1 });
      else if (r.intent.cutOff < 0.5) improve.push({ text: `${who} drifted from the commander's intent while cut off (adherence ${pc(r.intent.cutOff)}).`, weight: 1 - r.intent.cutOff + 0.1 });
    } else if (r.cutOffTotalS > 60 && r.decisions === 0) {
      improve.push({ text: `${who} was cut off for ${Math.round(r.cutOffTotalS / 60)} min and took no decision — mission command means acting on intent.`, weight: 0.9 });
    }
    if (r.sa.mean !== null) {
      if (r.sa.mean >= 0.7) sustain.push({ text: `${who} kept an accurate picture under degradation (SA ${pc(r.sa.mean)}).`, weight: r.sa.mean - 0.2 });
      else if (r.sa.mean < 0.5) improve.push({ text: `${who} SA accuracy was low (${pc(r.sa.mean)}) — check report ages and sources.`, weight: 1 - r.sa.mean });
    }
    if (r.paceResponseS !== null && r.paceResponseS <= 60) sustain.push({ text: `${who} switched PACE within ${Math.round(r.paceResponseS)} s of losing the net.`, weight: 0.5 });
    if (r.latency.noResponse >= 2) improve.push({ text: `${who} did not respond to ${r.latency.noResponse} degradation events within 10 min.`, weight: 0.4 + r.latency.noResponse * 0.05 });
  }
  if (team.divergenceMean !== null && team.divergenceMean > 0.4) {
    improve.push({ text: `Team pictures diverged (mean SA divergence ${team.divergenceMean.toFixed(2)}) — more cross-reporting and relaying needed.`, weight: team.divergenceMean });
  }
  if (team.deliveryRatio !== null && team.deliveryRatio >= 0.8) sustain.push({ text: `Message discipline: ${pc(team.deliveryRatio)} of player traffic got through despite degradation.`, weight: 0.3 });
  const top = (xs: Finding[]) => xs.sort((a, b) => b.weight - a.weight).slice(0, 3).map((x) => x.text);
  return { sustain: top(sustain), improve: top(improve) };
}
