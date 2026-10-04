import { describe, expect, it } from 'vitest';
import type { ProbeQuestionTruth } from '@vanguard/shared';
import { answerDivergence, generateProbe, probeAccuracy, probeDivergence, probeStatus, questionFromTemplate, scoreAnswer, type ProbeState } from '../src';
import { started } from './fixtures';

const q = (input: ProbeQuestionTruth['input'], truth: string): ProbeQuestionTruth => ({
  id: 'q', kind: 'HOSTILE_COUNT', text: '', input, options: [], truth, common: true,
});

describe('probe generation', () => {
  it('builds truth answers from templates', () => {
    const d = started();
    expect(questionFromTemplate(d.ctx, { kind: 'HOSTILE_COUNT', cell: 'D2' }, 'a').truth).toBe('0');
    expect(questionFromTemplate(d.ctx, { kind: 'HOSTILE_COUNT', cell: 'F4' }, 'a').truth).toBe('6');
    expect(questionFromTemplate(d.ctx, { kind: 'DECOY_ASSESS', cell: 'D2' }, 'a').truth).toBe('DECOYS');
    expect(questionFromTemplate(d.ctx, { kind: 'DECOY_ASSESS', cell: 'F4' }, 'a').truth).toBe('REAL');
    expect(questionFromTemplate(d.ctx, { kind: 'DECOY_ASSESS', cell: 'A1' }, 'a').truth).toBe('NONE');
    d.s.units.find((u) => u.id === 'r-decoy')!.track = [{ tMs: 0, x: 5.5, y: 3.5 }];
    expect(questionFromTemplate(d.ctx, { kind: 'DECOY_ASSESS', cell: 'F4' }, 'a').truth).toBe('MIXED');
    expect(questionFromTemplate(d.ctx, { kind: 'HOSTILE_LOCATION', unitId: 'r-armour', label: 'armour' }, 'a').truth).toBe('F4');
    expect(questionFromTemplate(d.ctx, { kind: 'FEATURE_STATUS', featureId: 'bridge' }, 'a').truth).toBe('YES');
    expect(questionFromTemplate(d.ctx, { kind: 'FRIENDLY_LOCATION', role: 'PL_B' }, 'a').truth).toBe('C6');
  });

  it('rotates common questions by probe index and adds a role-specific link question', () => {
    const d = started();
    const p0 = generateProbe(d.ctx, 'P', 0);
    const p1 = generateProbe(d.ctx, 'P', 1);
    expect(p0.CDR!.map((x) => x.kind)).toEqual(['HOSTILE_COUNT', 'FRIENDLY_LOCATION', 'FEATURE_STATUS', 'LINK_STATUS']);
    expect(p1.CDR!.map((x) => x.kind)).toEqual(['DECOY_ASSESS', 'HOSTILE_LOCATION', 'HOSTILE_COUNT', 'LINK_STATUS']);
    expect(p0.CDR!.at(-1)!.text).toMatch(/Higher HQ/);
    expect(p0.PL_A!.at(-1)!.text).toMatch(/KESTREL 6/);
  });
});

describe('scoring (PRD §9.6) and divergence (§9.7)', () => {
  it('scores numeric, cell and choice answers', () => {
    expect(scoreAnswer(q('number', '4'), '4')).toBe(1);
    expect(scoreAnswer(q('number', '4'), '5')).toBe(0.5);
    expect(scoreAnswer(q('number', '4'), '9')).toBe(0);
    expect(scoreAnswer(q('number', '4'), 'abc')).toBe(0);
    expect(scoreAnswer(q('number', '4'), 'UNKNOWN')).toBe(0);
    expect(scoreAnswer(q('number', '4'), undefined)).toBe(0);
    expect(scoreAnswer(q('cell', 'D4'), 'd4')).toBe(1);
    expect(scoreAnswer(q('cell', 'D4'), 'E5')).toBe(0.5);
    expect(scoreAnswer(q('cell', 'D4'), 'H8')).toBe(0);
    expect(scoreAnswer(q('cell', 'D4'), 'Z9')).toBe(0);
    expect(scoreAnswer(q('choice', 'YES'), 'yes')).toBe(1);
    expect(scoreAnswer(q('choice', 'YES'), 'NO')).toBe(0);
  });

  it('computes pairwise divergence', () => {
    expect(answerDivergence(q('number', '0'), '4', '4')).toBe(0);
    expect(answerDivergence(q('number', '0'), '4', '2')).toBe(0.5);
    expect(answerDivergence(q('number', '0'), 'x', '2')).toBe(1);
    expect(answerDivergence(q('cell', 'A1'), 'D4', 'D5')).toBe(0.5);
    expect(answerDivergence(q('cell', 'A1'), 'D4', 'H8')).toBe(1);
    expect(answerDivergence(q('choice', 'YES'), 'YES', 'NO')).toBe(1);
    expect(answerDivergence(q('choice', 'YES'), 'UNKNOWN', 'NO')).toBe(1);
    expect(answerDivergence(q('choice', 'YES'), undefined, 'NO')).toBe(1);
  });

  it('builds the divergence matrix and status view', () => {
    const common = q('number', '4');
    const p: ProbeState = {
      id: 'P', index: 0, startedAtMs: 0, endedAtMs: null, phaseBefore: 'RUNNING',
      questions: { CDR: [common, { ...common, id: 'l', common: false }], PL_A: [common], PL_B: [common] },
      answers: { CDR: { q: '4', l: 'YES' }, PL_A: { q: '2' }, PL_B: { q: '4' } },
      scores: { CDR: { q: 1, l: 1 }, PL_A: { q: 0 } },
    };
    const dv = probeDivergence(p);
    expect(dv.roles).toEqual(['CDR', 'PL_A', 'PL_B']);
    expect(dv.matrix[0]).toEqual([0, 0.5, 0]);
    expect(dv.matrix[1]![0]).toBe(0.5);
    expect(dv.team).toBe(0.33);
    expect(probeAccuracy(p, 'CDR')).toBe(1);
    expect(probeAccuracy(p, 'PL_B')).toBeNull();
    const st = probeStatus(p, ['CDR', 'PL_A', 'PL_B', 'EW']);
    expect(st.results.find((r) => r.role === 'EW')!.submitted).toBe(false);
    expect(probeDivergence({ ...p, answers: {} }).team).toBeNull();
  });
});
