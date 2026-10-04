import {
  DISCLAIMER,
  formatAge,
  formatT,
  type AarReport,
  type DecisionRecord,
  type NarrativeBlock,
  type ReplayFrame,
  type ReplayResponse,
  type RoleId,
  type Scenario,
  type SimEvent,
} from '@vanguard/shared';
import { hashValue } from './hash';
import { commsEdges, outcome, roleMetrics, sustainImprove, teamMetrics, timeline } from './metrics';
import { probeStatus } from './probes';
import { mselViews, project, projectTruth } from './projection';
import { replay } from './replay';
import type { Ctx } from './state';

const ACTION_TEXT: Record<DecisionRecord['action'], string> = {
  ADVANCE: 'advance',
  HOLD: 'hold',
  WITHDRAW: 'withdraw',
  REPOSITION: 'reposition',
  REQUEST_RECON: 'request recon',
  CALL_AIR: 'call air support',
  RELAY: 'relay',
  SWITCH_CHANNEL: 'switch channel',
};

/** Deterministic coaching note for one decision (template fallback for the AI layer). */
export function rationaleFeedback(d: DecisionRecord): NarrativeBlock {
  const parts: string[] = [
    `Decision to ${ACTION_TEXT[d.action]}${d.targetCell ? ` ${d.targetCell}` : ''} at ${formatT(d.tMs)}.`,
  ];
  const k = d.knowable;
  const cited = k.intel.filter((i) => d.basedOn.includes(i.id));
  const oldest = cited.length ? Math.max(...cited.map((i) => i.ageMs)) : null;
  if (d.basedOn.length === 0) parts.push('No intel was cited as the basis — make the evidence explicit.');
  else if (oldest !== null && oldest > 300_000) parts.push(`The oldest cited report was ${formatAge(oldest)} old; consider its age before committing.`);
  if (k.openConflicts.length > 0) {
    parts.push(`${k.openConflicts.length} conflicting report pair(s) were open at the time (e.g. ${k.openConflicts[0]!.reason.toLowerCase()}).`);
  }
  if (k.cutOff) {
    parts.push(
      d.intentScore >= 0.75
        ? 'Cut off from the commander, the action served the stated intent — good mission command.'
        : d.intentScore >= 0.5
          ? 'Cut off from the commander, the action only partly served the intent.'
          : 'Cut off from the commander, the action worked against the stated intent.',
    );
  }
  const conf = d.confidence / 100;
  const gap = conf - d.adjudication.outcome;
  if (gap > 0.3) parts.push(`Stated confidence (${d.confidence}%) was well above how sound the action proved (${d.adjudication.soundness}).`);
  else if (gap < -0.3) parts.push(`You were under-confident (${d.confidence}%) for an action that proved ${d.adjudication.soundness}.`);
  else parts.push(`Confidence (${d.confidence}%) was in line with the outcome (${d.adjudication.soundness}).`);
  parts.push(`Ground truth: ${d.adjudication.reason}.`);
  return { text: parts.join(' '), source: 'template', provider: null };
}

/** Deterministic AAR narrative draft following the four AAR questions. */
export function templateNarrative(r: Omit<AarReport, 'q4'> & { q4: Omit<AarReport['q4'], 'narrative' | 'rationaleFeedback'> }): NarrativeBlock {
  const t = r.q3.team;
  const cut = r.q3.roleMetrics.filter((m) => m.cutOffTotalS > 0);
  const lines = [
    `1. What was supposed to happen? ${r.q1.brief.mission} Intent: ${r.q1.intent.text}`,
    `2. What actually happened? ${r.q2.outcome.summary} The team made ${t.decisions} decisions (${t.soundCounts.SOUND} sound, ${t.soundCounts.RISKY} risky, ${t.soundCounts.UNSOUND} unsound)${
      cut.length ? `; ${cut.map((m) => `${m.callsign} was cut off for ${Math.round(m.cutOffTotalS / 60)} min`).join(', ')}` : ''
    }.`,
    `3. Why? Team calibration (Brier) ${t.brier ?? '—'}, verification of contested intel ${t.verificationRate === null ? '—' : `${Math.round(t.verificationRate * 100)}%`}, intent adherence while cut off ${
      t.intentCutOff === null ? '—' : `${Math.round(t.intentCutOff * 100)}%`
    }, mean SA accuracy ${t.saMean === null ? '—' : `${Math.round(t.saMean * 100)}%`}, SA divergence ${t.divergenceMean ?? '—'}.`,
    `4. Sustain: ${r.q4.sustain.join(' ') || 'n/a'} Improve: ${r.q4.improve.join(' ') || 'n/a'}`,
  ];
  return { text: lines.join('\n\n'), source: 'template', provider: null };
}

/** Build the full AAR from the (replayed or live) simulation context. */
export function buildAar(ctx: Ctx, sessionCode: string): AarReport {
  const s = ctx.s;
  const sc = ctx.sc;
  const roles = s.enabledRoles.map((r) => roleMetrics(ctx, r));
  const team = teamMetrics(ctx, roles);
  const out = outcome(ctx);
  const si = sustainImprove(roles, team);
  const truth = projectTruth(ctx, sessionCode);
  const objectiveText = `${sc.brief.mission}`;
  const outcomeText = `${out.summary} ${team.soundCounts.SOUND}/${team.decisions} decisions sound.`;
  const base = {
    meta: {
      sessionCode,
      scenarioId: sc.id,
      scenarioTitle: sc.title,
      theatre: sc.theatre,
      seed: s.seed,
      endMs: s.tMs,
      stateHash: hashValue(s),
      roles: s.enabledRoles.map((r) => ({
        role: r,
        title: ctx.roleSpec[r]!.title,
        callsign: ctx.roleSpec[r]!.callsign,
        joined: s.roles[r]!.joined || s.decisions.some((d) => d.role === r),
      })),
    },
    disclaimer: DISCLAIMER,
    exec: { objective: objectiveText, outcome: outcomeText, sustain: si.sustain, improve: si.improve },
    q1: {
      brief: { ...sc.brief },
      intent: {
        text: sc.intent.text,
        priority: sc.intent.priority,
        objectiveCells: [...sc.intent.objectiveCells],
        deadlineS: sc.intent.deadlineS,
        finalVersion: s.intent.version,
        finalText: s.intent.text,
      },
      objectives: sc.objectives.map((o) => ({ ...o })),
      msel: mselViews(ctx),
    },
    q2: { outcome: out, timeline: timeline(ctx) },
    q3: {
      decisions: s.decisions.map((d) => ({ ...d })),
      roleMetrics: roles,
      team,
      probes: s.probes.map((p) => probeStatus(p, s.enabledRoles)),
      comms: { channels: truth.comms, edges: commsEdges(ctx) },
    },
    q4: { sustain: si.sustain, improve: si.improve },
  };
  return {
    ...base,
    q4: {
      ...base.q4,
      narrative: templateNarrative(base),
      rationaleFeedback: Object.fromEntries(s.decisions.map((d) => [d.id, rationaleFeedback(d)])),
    },
  };
}

/** One replay frame for a view (truth or a role's perceived picture). */
function frame(ctx: Ctx, view: 'truth' | RoleId, note: string | null): ReplayFrame {
  const s = ctx.s;
  if (view === 'truth') {
    const t = projectTruth(ctx, '');
    return {
      tMs: s.tMs,
      units: t.units.map((u) => ({ id: u.id, side: u.side, label: u.decoy ? `DECOY ${u.count}x` : u.callsign, type: u.type, cell: u.cell, x: u.pos.x, y: u.pos.y, status: u.status, decoy: u.decoy })),
      jammers: t.jammers.map((j) => ({ cell: j.cell, radius: j.radius * j.power, active: j.active })),
      cutOff: t.roles.filter((r) => r.cutOff).map((r) => r.role),
      note,
    };
  }
  const p = project(ctx, view, '');
  return {
    tMs: s.tMs,
    units: [
      { id: 'own', side: 'BLUE', label: p.ownUnit.callsign, type: p.ownUnit.type, cell: p.ownUnit.cell, x: p.ownUnit.pos.x, y: p.ownUnit.pos.y, status: p.ownUnit.status },
      ...p.friendlies.filter((f) => f.pos).map((f) => ({ id: `f-${f.role}`, side: 'BLUE' as const, label: f.callsign, type: 'FR', cell: f.cell!, x: f.pos!.x, y: f.pos!.y, status: 'ACTIVE', ageMs: s.tMs - f.observedAtMs })),
      ...p.contacts.map((c) => {
        const col = c.cell.charCodeAt(0) - 65;
        const row = Number(c.cell[1]) - 1;
        return { id: c.itemId, side: 'RED' as const, label: c.kind === 'NEGATIVE' ? 'NO CONTACT' : `${c.count ?? '?'}x ${c.unitType ?? '?'}`, type: c.kind === 'NEGATIVE' ? 'NEG' : (c.unitType ?? '?'), cell: c.cell, x: col + 0.5, y: row + 0.5, status: 'ACTIVE', ageMs: s.tMs - c.observedAtMs, conflict: c.inConflict };
      }),
    ],
    jammers: (p.spectrum ?? []).map((x) => ({ cell: x.approxCell, radius: 1, active: true })),
    cutOff: p.cutOff ? [view] : [],
    note,
  };
}

/** Rebuild state from the event log and sample frames every `stepS` sim seconds (US-AAR-7). */
export function buildReplay(scenario: Scenario, events: readonly SimEvent[], view: 'truth' | RoleId, stepS = 10): ReplayResponse {
  const frames: ReplayFrame[] = [];
  const stepMs = Math.max(1, stepS) * 1000;
  let lastJournal = 0;
  let started = false;
  const capture = (sim: { ctx: Ctx }) => {
    const j = sim.ctx.s.journal;
    const fresh = j.slice(lastJournal).filter((e) => !['MSG_DELIVERED', 'MSG_SENT', 'MSG_DROPPED', 'REPORT', 'JOIN'].includes(e.kind));
    lastJournal = j.length;
    frames.push(frame(sim.ctx, view, fresh.length ? `${formatT(fresh[0]!.tMs)} ${fresh[0]!.text}` : null));
  };
  const sim = replay(scenario, events, {
    onTick: (sm, cause) => {
      if (!started && sm.state.phase !== 'LOBBY') {
        started = true;
        capture(sm);
        return;
      }
      if (cause === 'step' && sm.state.tMs % stepMs === 0) capture(sm);
    },
  });
  if (frames.at(-1)?.tMs !== sim.state.tMs) capture(sim);
  return { view, stepS, endMs: sim.state.tMs, terrain: [...scenario.terrain], frames };
}
