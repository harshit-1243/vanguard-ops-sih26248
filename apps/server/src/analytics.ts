import {
  ADJUDICATION_RULE_LABEL,
  SessionSettingsSchema,
  type AarReport,
  type AnalyticsExercise,
  type AnalyticsGroup,
  type AnalyticsParticipant,
  type AnalyticsResponse,
  type MetricSet,
  type RoleId,
  type Scenario,
  type SessionSettings,
  type Soundness,
} from '@vanguard/shared';
import { buildAar, replay } from '@vanguard/sim';
import type { EventStore, SessionRecord } from './store/types';

/**
 * Cross-course analytics (PRD addendum v1.2). Every ENDED exercise is replayed once from its event
 * log, reduced to the same metrics its AAR shows, and cached (ended exercises are immutable).
 * Aggregates are plain means over exercises / role-instances, so each number traces back to AARs.
 */
interface RoleRow {
  role: RoleId;
  callsign: string;
  joined: boolean;
  decisions: number;
  metrics: MetricSet;
}

interface Extract {
  exercise: AnalyticsExercise;
  settings: SessionSettings;
  roles: RoleRow[];
  weak: { rule: string; reason: string }[];
}

const MAX_EXERCISES = 1000;

const mean = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null;
};

const METRIC_KEYS: (keyof MetricSet)[] = ['brier', 'verificationRate', 'intentCutOff', 'saMean', 'divergenceMean', 'deliveryRatio', 'soundRate', 'latencyMeanS'];
const meanMetrics = (sets: MetricSet[]): MetricSet =>
  Object.fromEntries(METRIC_KEYS.map((k) => [k, mean(sets.map((m) => m[k]))])) as unknown as MetricSet;

const soundRate = (c: Record<Soundness, number>): number | null => {
  const n = c.SOUND + c.RISKY + c.UNSOUND;
  return n ? c.SOUND / n : null;
};

/** players: name each officer typed when joining (falls back to the role callsign). */
export function extractFromAar(
  aar: AarReport,
  rec: Pick<SessionRecord, 'code' | 'course' | 'createdAt' | 'endedAt'>,
  settings: SessionSettings,
  players: Partial<Record<RoleId, string | null>> = {},
): Extract {
  const team = aar.q3.team;
  const decisionsByRole = new Map<RoleId, Record<Soundness, number>>();
  for (const d of aar.q3.decisions) {
    const c = decisionsByRole.get(d.role) ?? { SOUND: 0, RISKY: 0, UNSOUND: 0 };
    c[d.adjudication.soundness]++;
    decisionsByRole.set(d.role, c);
  }
  const roles: RoleRow[] = aar.q3.roleMetrics.map((r) => ({
    role: r.role,
    callsign: players[r.role] ?? r.callsign,
    joined: r.joined,
    decisions: r.decisions,
    metrics: {
      brier: r.calibration.brier,
      verificationRate: r.verification.rate,
      intentCutOff: r.intent.cutOff,
      saMean: r.sa.mean,
      divergenceMean: null,
      deliveryRatio: r.comms.sent ? r.comms.delivered / r.comms.sent : null,
      soundRate: soundRate(decisionsByRole.get(r.role) ?? { SOUND: 0, RISKY: 0, UNSOUND: 0 }),
      latencyMeanS: r.latency.meanS,
    },
  }));
  const outcome = aar.q2.outcome;
  return {
    settings,
    roles,
    weak: aar.q3.decisions.filter((d) => d.adjudication.soundness !== 'SOUND').map((d) => ({ rule: d.adjudication.rule, reason: d.adjudication.reason })),
    exercise: {
      code: rec.code,
      course: rec.course,
      scenarioId: aar.meta.scenarioId,
      scenarioTitle: aar.meta.scenarioTitle,
      createdAt: rec.createdAt.toISOString(),
      endedAt: rec.endedAt ? rec.endedAt.toISOString() : null,
      durationS: Math.round(aar.meta.endMs / 1000),
      roles: aar.meta.roles.length,
      decisions: team.decisions,
      soundCounts: team.soundCounts,
      objectivesHeld: outcome.objectives.filter((o) => o.held).length,
      objectivesTotal: outcome.objectives.length,
      friendlyStrengthPct: outcome.friendlyStrengthPct,
      hostileStrengthPct: outcome.hostileStrengthPct,
      settings: { ewIntensity: settings.ewIntensity, sensorReliability: settings.sensorReliability, commsQuality: settings.commsQuality, opfor: settings.opfor },
      metrics: {
        brier: team.brier,
        verificationRate: team.verificationRate,
        intentCutOff: team.intentCutOff,
        saMean: team.saMean,
        divergenceMean: team.divergenceMean,
        deliveryRatio: team.deliveryRatio,
        soundRate: soundRate(team.soundCounts),
        latencyMeanS: mean(aar.q3.roleMetrics.map((r) => r.latency.meanS)),
      },
    },
  };
}

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

export class AnalyticsService {
  private readonly cache = new Map<string, Extract>();
  private readonly failed = new Map<string, string>();

  constructor(private readonly store: EventStore) {}

  private async extract(rec: SessionRecord): Promise<Extract | null> {
    const hit = this.cache.get(rec.id);
    if (hit) return hit;
    if (this.failed.has(rec.id)) return null;
    try {
      const events = await this.store.loadEvents(rec.id);
      const sim = replay(rec.scenario as Scenario, events);
      const created = events.find((e) => e.type === 'SESSION_CREATED');
      const settings = SessionSettingsSchema.parse(created?.type === 'SESSION_CREATED' ? created.payload.settings : undefined);
      const players = Object.fromEntries(sim.state.enabledRoles.map((r) => [r, sim.state.roles[r]!.playerCallsign]));
      const x = extractFromAar(buildAar(sim.ctx, rec.code), rec, settings, players);
      this.cache.set(rec.id, x);
      return x;
    } catch (err) {
      this.failed.set(rec.id, err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  async compute(filters: { course?: string | null; scenarioId?: string | null } = {}): Promise<AnalyticsResponse> {
    const records = (await this.store.listEndedSessions()).slice(-MAX_EXERCISES);
    const all: Extract[] = [];
    const skipped: AnalyticsResponse['skipped'] = [];
    for (const rec of records) {
      const x = await this.extract(rec);
      if (x) all.push(x);
      else skipped.push({ code: rec.code, error: this.failed.get(rec.id) ?? 'unknown' });
      // Replays are CPU-bound; yield so live exercises keep ticking.
      await new Promise((r) => setImmediate(r));
    }
    const course = filters.course ?? null;
    const scenarioId = filters.scenarioId ?? null;
    const xs = all.filter((x) => (course === null || x.exercise.course === course) && (scenarioId === null || x.exercise.scenarioId === scenarioId));

    const group = (keyOf: (x: Extract) => string, labelOf: (x: Extract) => string): AnalyticsGroup[] => {
      const m = new Map<string, Extract[]>();
      for (const x of xs) m.set(keyOf(x), [...(m.get(keyOf(x)) ?? []), x]);
      return [...m.entries()].map(([key, g]) => ({
        key,
        label: labelOf(g[0]!),
        exercises: g.length,
        decisions: g.reduce((n, x) => n + x.exercise.decisions, 0),
        metrics: meanMetrics(g.map((x) => x.exercise.metrics)),
      }));
    };

    const roleMap = new Map<RoleId, { n: Set<string>; rows: RoleRow[] }>();
    const people = new Map<string, { p: AnalyticsParticipant; sets: MetricSet[] }>();
    for (const x of xs) {
      for (const r of x.roles) {
        if (!r.joined) continue;
        const g = roleMap.get(r.role) ?? { n: new Set<string>(), rows: [] };
        g.n.add(x.exercise.code);
        g.rows.push(r);
        roleMap.set(r.role, g);
        const key = `${x.exercise.course}|${r.callsign.trim().toUpperCase()}`;
        const e = people.get(key) ?? { p: { callsign: r.callsign, role: r.role, course: x.exercise.course, exercises: 0, decisions: 0, metrics: meanMetrics([]) }, sets: [] };
        e.p.exercises++;
        e.p.decisions += r.decisions;
        e.p.role = r.role;
        e.sets.push(r.metrics);
        people.set(key, e);
      }
    }
    const byRole: AnalyticsGroup[] = [...roleMap.entries()].map(([role, g]) => ({
      key: role,
      label: role,
      exercises: g.n.size,
      decisions: g.rows.reduce((n, r) => n + r.decisions, 0),
      metrics: meanMetrics(g.rows.map((r) => r.metrics)),
    }));
    const participants = [...people.values()].map((e) => ({ ...e.p, metrics: meanMetrics(e.sets) })).sort((a, b) => b.exercises - a.exercises || a.callsign.localeCompare(b.callsign));

    const pit = new Map<string, { count: number; example: string }>();
    for (const x of xs) for (const w of x.weak) pit.set(w.rule, { count: (pit.get(w.rule)?.count ?? 0) + 1, example: w.reason });
    const pitfalls = [...pit.entries()].map(([rule, v]) => ({ rule, label: ADJUDICATION_RULE_LABEL[rule] ?? rule, ...v })).sort((a, b) => b.count - a.count).slice(0, 8);

    const difficulty = (x: Extract) => `EW ${x.settings.ewIntensity} · sensors ${x.settings.sensorReliability} · comms ${x.settings.commsQuality} · OPFOR ${x.settings.opfor}`;
    const totals = {
      exercises: xs.length,
      decisions: xs.reduce((n, x) => n + x.exercise.decisions, 0),
      participants: participants.length,
      metrics: meanMetrics(xs.map((x) => x.exercise.metrics)),
    };
    const byRoleSorted = byRole.sort((a, b) => a.key.localeCompare(b.key));
    return {
      generatedAt: new Date().toISOString(),
      filters: { course, scenarioId },
      options: {
        courses: [...new Set(all.map((x) => x.exercise.course))].sort(),
        scenarios: [...new Map(all.map((x) => [x.exercise.scenarioId, x.exercise.scenarioTitle])).entries()].map(([id, title]) => ({ id, title })),
      },
      totals,
      exercises: xs.map((x) => x.exercise),
      byCourse: group((x) => x.exercise.course, (x) => x.exercise.course || '(no course label)'),
      byScenario: group((x) => x.exercise.scenarioId, (x) => x.exercise.scenarioTitle),
      byRole: byRoleSorted,
      byDifficulty: group(difficulty, difficulty),
      participants,
      pitfalls,
      insights: insights(xs, byRoleSorted, totals.metrics),
      skipped,
    };
  }

  /** Long-format CSV: one row per exercise × role (opens directly in Excel). */
  async csv(filters: { course?: string | null; scenarioId?: string | null } = {}): Promise<string> {
    await this.compute(filters);
    const rows: (string | number | null)[][] = [];
    for (const x of this.cache.values()) {
      const e = x.exercise;
      if ((filters.course ?? null) !== null && e.course !== filters.course) continue;
      if ((filters.scenarioId ?? null) !== null && e.scenarioId !== filters.scenarioId) continue;
      for (const r of x.roles) {
        if (!r.joined) continue;
        rows.push([e.code, e.course, e.scenarioId, e.createdAt, x.settings.ewIntensity, x.settings.sensorReliability, x.settings.commsQuality, x.settings.opfor,
          r.role, r.callsign, r.decisions, r.metrics.soundRate, r.metrics.brier, r.metrics.verificationRate, r.metrics.intentCutOff, r.metrics.saMean, r.metrics.latencyMeanS, r.metrics.deliveryRatio,
          e.objectivesHeld, e.objectivesTotal]);
      }
    }
    const head = ['exercise', 'course', 'scenario', 'created_at', 'ew', 'sensors', 'comms', 'opfor', 'role', 'callsign', 'decisions', 'sound_rate', 'brier', 'verification_rate', 'intent_cut_off', 'sa_mean', 'latency_mean_s', 'delivery_ratio', 'objectives_held', 'objectives_total'];
    const cell = (v: string | number | null) => {
      const s = v === null ? '' : typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : v;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [head.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n';
  }
}

/** Deterministic, explainable findings (an LLM may rephrase them, never invent them). */
export function insights(xs: Extract[], byRole: AnalyticsGroup[], m: MetricSet): string[] {
  const out: string[] = [];
  if (xs.length === 0) return ['No finished exercises match these filters yet.'];
  const ordered = [...xs].sort((a, b) => a.exercise.createdAt.localeCompare(b.exercise.createdAt));
  if (ordered.length >= 4) {
    const half = Math.floor(ordered.length / 2);
    const early = meanMetrics(ordered.slice(0, half).map((x) => x.exercise.metrics));
    const late = meanMetrics(ordered.slice(half).map((x) => x.exercise.metrics));
    const trend = (k: keyof MetricSet, label: string, higherBetter: boolean) => {
      const a = early[k];
      const b = late[k];
      if (a === null || b === null || Math.abs(b - a) < 0.05) return;
      const better = higherBetter ? b > a : b < a;
      const fmt = k === 'brier' ? (v: number) => v.toFixed(2) : pct;
      out.push(`${label} ${better ? 'improved' : 'declined'} from ${fmt(a)} to ${fmt(b)} between the earlier and later half of exercises.`);
    };
    trend('soundRate', 'Sound decisions', true);
    trend('verificationRate', 'Verification before acting on contested intel', true);
    trend('intentCutOff', 'Acting on intent while cut off', true);
    trend('saMean', 'Situational awareness (SAGAT)', true);
    trend('brier', 'Confidence calibration (Brier, lower is better)', false);
  }
  if (m.verificationRate !== null && m.verificationRate < 0.5) out.push(`Only ${pct(m.verificationRate)} of decisions on contested intel were verified first — drill "verify before you act".`);
  if (m.intentCutOff !== null && m.intentCutOff < 0.6) out.push(`When cut off, decisions matched the commander's intent ${pct(m.intentCutOff)} of the time — rehearse mission command under isolation.`);
  if (m.brier !== null && m.brier > 0.25) out.push(`Calibration is weak (Brier ${m.brier.toFixed(2)}): stated confidence does not track outcomes.`);
  if (m.saMean !== null && m.saMean < 0.6) out.push(`Mean SA probe accuracy is ${pct(m.saMean)} — pictures drift from ground truth under degradation.`);
  const rated = byRole.filter((r) => r.metrics.soundRate !== null);
  if (rated.length >= 2) {
    const worst = rated.reduce((a, b) => (b.metrics.soundRate! < a.metrics.soundRate! ? b : a));
    const best = rated.reduce((a, b) => (b.metrics.soundRate! > a.metrics.soundRate! ? b : a));
    if (best.metrics.soundRate! - worst.metrics.soundRate! >= 0.15) out.push(`${worst.label} has the lowest share of sound decisions (${pct(worst.metrics.soundRate)}) vs ${best.label} (${pct(best.metrics.soundRate)}).`);
  }
  const hard = xs.filter((x) => x.settings.ewIntensity === 'high');
  const normal = xs.filter((x) => x.settings.ewIntensity !== 'high');
  if (hard.length >= 2 && normal.length >= 2) {
    const a = mean(normal.map((x) => x.exercise.metrics.soundRate));
    const b = mean(hard.map((x) => x.exercise.metrics.soundRate));
    if (a !== null && b !== null) out.push(`High EW intensity changes sound decisions from ${pct(a)} to ${pct(b)}.`);
  }
  if (out.length === 0) out.push('No significant weaknesses or trends detected — consider raising the difficulty variables.');
  return out;
}
