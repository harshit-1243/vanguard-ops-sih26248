import {
  allCells,
  areAdjacent,
  isCell,
  vecToCell,
  type ProbeQuestionTruth,
  type ProbeStatusView,
  type ProbeTemplate,
  type RoleId,
} from '@vanguard/shared';
import { unitsInCell } from './adjudication';
import { isCutOff } from './links';
import type { Ctx, ProbeState } from './state';
import { roleUnit, unitPos } from './tracks';

export const UNKNOWN = 'UNKNOWN';
const CELLS = allCells();

/** Build a truth-scored question from a template at the current sim time. */
export function questionFromTemplate(ctx: Ctx, t: ProbeTemplate, id: string): ProbeQuestionTruth {
  const s = ctx.s;
  switch (t.kind) {
    case 'HOSTILE_COUNT': {
      const n = unitsInCell(ctx, t.cell, 'RED')
        .filter((u) => !u.decoy)
        .reduce((a, u) => a + u.count, 0);
      return { id, kind: t.kind, text: `How many real hostile vehicles are in ${t.cell} right now?`, input: 'number', options: [], truth: String(n), common: true };
    }
    case 'FRIENDLY_LOCATION': {
      const spec = ctx.roleSpec[t.role]!;
      const u = roleUnit(ctx, t.role);
      return { id, kind: t.kind, text: `Which sector is ${spec.callsign} (${spec.title}) in right now?`, input: 'cell', options: CELLS, truth: vecToCell(unitPos(u, s.tMs)), common: true };
    }
    case 'FEATURE_STATUS': {
      const f = s.features.find((x) => x.id === t.featureId)!;
      return { id, kind: t.kind, text: `Is the ${f.label} (${f.cell}) intact?`, input: 'choice', options: ['YES', 'NO'], truth: f.intact ? 'YES' : 'NO', common: true };
    }
    case 'DECOY_ASSESS': {
      const reds = unitsInCell(ctx, t.cell, 'RED');
      const real = reds.some((u) => !u.decoy);
      const decoy = reds.some((u) => u.decoy);
      const truth = real && decoy ? 'MIXED' : decoy ? 'DECOYS' : real ? 'REAL' : 'NONE';
      return { id, kind: t.kind, text: `The hostile vehicles in ${t.cell} are:`, input: 'choice', options: ['REAL', 'DECOYS', 'MIXED', 'NONE'], truth, common: true };
    }
    case 'HOSTILE_LOCATION': {
      const u = s.units.find((x) => x.id === t.unitId)!;
      return { id, kind: t.kind, text: `Which sector is the ${t.label} in right now?`, input: 'cell', options: CELLS, truth: vecToCell(unitPos(u, s.tMs)), common: true };
    }
  }
}

/** Common questions (shared by all roles, for divergence) + one role-specific link question. */
export function generateProbe(ctx: Ctx, probeId: string, index: number): ProbeState['questions'] {
  const bank = ctx.sc.probeBank;
  const picked: ProbeTemplate[] = [];
  for (let k = 0; picked.length < Math.min(3, bank.length) && k < bank.length; k++) {
    const t = bank[(index * 3 + k) % bank.length]!;
    if (!picked.includes(t)) picked.push(t);
  }
  const common = picked.map((t, k) => questionFromTemplate(ctx, t, `${probeId}-q${k + 1}`));
  const out: ProbeState['questions'] = {};
  for (const role of ctx.s.enabledRoles) {
    const sup = ctx.roleSpec[role]!.superior;
    const supLabel = sup === 'HHQ' ? 'Higher HQ' : ctx.roleSpec[sup]!.callsign;
    out[role] = [
      ...common,
      {
        id: `${probeId}-link`,
        kind: 'LINK_STATUS',
        text: `Can you reach ${supLabel} right now by radio or data link (runner excluded)?`,
        input: 'choice',
        options: ['YES', 'NO'],
        truth: isCutOff(ctx, role) ? 'NO' : 'YES',
        common: false,
      },
    ];
  }
  return out;
}

/** PRD §9.6 scoring. */
export function scoreAnswer(q: ProbeQuestionTruth, answer: string | undefined): number {
  const a = (answer ?? '').trim().toUpperCase();
  if (a === '' || a === UNKNOWN) return 0;
  if (q.input === 'number') {
    const n = Number(a);
    if (!Number.isFinite(n)) return 0;
    const diff = Math.abs(n - Number(q.truth));
    return diff === 0 ? 1 : diff <= 1 ? 0.5 : 0;
  }
  if (q.input === 'cell') {
    if (!isCell(a)) return 0;
    if (a === q.truth) return 1;
    return isCell(q.truth) && areAdjacent(a, q.truth) ? 0.5 : 0;
  }
  return a === q.truth ? 1 : 0;
}

/** PRD §9.7 per-question divergence between two answers. */
export function answerDivergence(q: ProbeQuestionTruth, a?: string, b?: string): number {
  const x = (a ?? '').trim().toUpperCase();
  const y = (b ?? '').trim().toUpperCase();
  if (!x || !y || x === UNKNOWN || y === UNKNOWN) return 1;
  if (x === y) return 0;
  if (q.input === 'number') {
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return 1;
    return Math.min(1, Math.abs(nx - ny) / Math.max(nx, ny, 1));
  }
  if (q.input === 'cell' && isCell(x) && isCell(y)) return areAdjacent(x, y) ? 0.5 : 1;
  return 1;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function probeAccuracy(p: ProbeState, role: RoleId): number | null {
  const sc = p.scores[role];
  const qs = p.questions[role];
  if (!sc || !qs || qs.length === 0) return null;
  return r2(qs.reduce((n, q) => n + (sc[q.id] ?? 0), 0) / qs.length);
}

export function probeDivergence(p: ProbeState): ProbeStatusView['divergence'] {
  const roles = (Object.keys(p.answers) as RoleId[]).sort();
  const matrix: (number | null)[][] = roles.map(() => roles.map(() => null));
  const pairs: number[] = [];
  for (let i = 0; i < roles.length; i++) {
    for (let j = 0; j < roles.length; j++) {
      if (i === j) {
        matrix[i]![j] = 0;
        continue;
      }
      if (j < i) {
        matrix[i]![j] = matrix[j]![i]!;
        continue;
      }
      const qa = (p.questions[roles[i]!] ?? []).filter((q) => q.common);
      if (qa.length === 0) continue;
      const d = qa.reduce(
        (n, q) => n + answerDivergence(q, p.answers[roles[i]!]?.[q.id], p.answers[roles[j]!]?.[q.id]),
        0,
      ) / qa.length;
      matrix[i]![j] = r2(d);
      pairs.push(d);
    }
  }
  return { roles, matrix, team: pairs.length ? r2(pairs.reduce((a, b) => a + b, 0) / pairs.length) : null };
}

export function probeStatus(p: ProbeState, enabled: RoleId[]): ProbeStatusView {
  return {
    id: p.id,
    index: p.index,
    startedAtMs: p.startedAtMs,
    endedAtMs: p.endedAtMs,
    questions: p.questions as Record<string, ProbeQuestionTruth[]>,
    results: enabled.map((role) => ({
      role,
      submitted: !!p.answers[role],
      answers: p.answers[role] ?? {},
      scores: p.scores[role] ?? {},
      accuracy: probeAccuracy(p, role),
    })),
    divergence: probeDivergence(p),
  };
}
