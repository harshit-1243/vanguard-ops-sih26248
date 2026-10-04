import { formatT, type AarReport, type DecisionRecord, type ReplayResponse, type RoleId } from '@vanguard/shared';
import { buildAar, buildReplay } from '@vanguard/sim';
import type { LiveSession } from './session';

/** Optional AI enrichment (Phase 7). Must never throw — falls back to template text. */
export type AarEnricher = (aar: AarReport) => Promise<AarReport>;

const aarCache = new WeakMap<LiveSession, { key: string; aar: AarReport }>();
const replayCache = new WeakMap<LiveSession, Map<string, ReplayResponse>>();

/** AAR for a session (cached per event-log length once the exercise has ended). */
export async function aarFor(session: LiveSession, enrich?: AarEnricher): Promise<AarReport> {
  const key = `${session.events.length}:${session.sim.state.tMs}`;
  const hit = aarCache.get(session);
  if (hit && hit.key === key) return hit.aar;
  let aar = buildAar(session.sim.ctx, session.code);
  if (enrich) aar = await enrich(aar);
  if (session.phase === 'ENDED') aarCache.set(session, { key, aar });
  return aar;
}

export function replayFor(session: LiveSession, view: 'truth' | RoleId, stepS: number): ReplayResponse {
  const key = `${view}:${stepS}:${session.events.length}`;
  let m = replayCache.get(session);
  if (!m) replayCache.set(session, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  // Replay to the live clock too (events alone stop at the last input).
  const res = buildReplay(session.scenario, session.events, view, stepS);
  if (session.phase === 'ENDED') m.set(key, res);
  return res;
}

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(' ') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_COLUMNS = [
  'id', 't_sim', 't_sim_ms', 'role', 'callsign', 'action', 'target_cell', 'channel', 'confidence', 'rationale',
  'based_on', 'intent_self', 'cut_off', 'soundness', 'rule', 'adjudication_reason', 'outcome_value',
  'intent_score', 'knowable_intel', 'open_conflicts', 'outages', 'believed_cell', 'true_cell', 'rho', 'effects',
] as const;

export function decisionsCsv(decisions: DecisionRecord[]): string {
  const rows = decisions.map((d) => [
    d.id, formatT(d.tMs), d.tMs, d.role, d.callsign, d.action, d.targetCell, d.channel, d.confidence, d.rationale,
    d.basedOn, d.intentSelf, d.cutOff, d.adjudication.soundness, d.adjudication.rule, d.adjudication.reason,
    d.adjudication.outcome, d.intentScore, d.knowable.intel.length, d.knowable.openConflicts.length,
    d.knowable.outages.map((o) => `${o.channel}:${o.level}`), d.knowable.ownCell, d.truth.ownCell, d.truth.rho,
    d.effects.join(' | '),
  ]);
  return [CSV_COLUMNS.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}

export function eventsJson(session: LiveSession) {
  return {
    format: 'vanguard-ops/event-log@1',
    note: 'inputEvents are the authoritative append-only log; journal is re-derived by deterministic replay.',
    session: { code: session.code, scenarioId: session.scenario.id, seed: session.sim.state.seed, enabledRoles: session.sim.state.enabledRoles },
    stateHash: session.sim.hash(),
    inputEvents: session.events,
    journal: session.sim.state.journal,
  };
}
