import Anthropic from '@anthropic-ai/sdk';
import {
  UNIT_TYPE_LABEL,
  reportText,
  saluteLines,
  type AarReport,
  type Cell,
  type NarrativeBlock,
  type UnitType,
} from '@vanguard/shared';
import type { AarEnricher } from './aar';
import type { Config } from './config';

/**
 * Optional AI layer (Smart Automation). LLM_PROVIDER=none|ollama|anthropic.
 * With `none` (the default) every feature uses deterministic templates. Any provider error,
 * timeout or refusal falls back to the template text — the app never depends on the model.
 */
export interface LlmProvider {
  readonly name: string;
  generate(system: string, prompt: string): Promise<string>;
}

const TIMEOUT_MS = 30_000;

/** Claude via the official SDK (low effort: short drafting tasks). */
export class AnthropicProvider implements LlmProvider {
  readonly name: string;
  private readonly client: Anthropic;

  constructor(
    apiKey: string | undefined,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey: apiKey || undefined, timeout: TIMEOUT_MS, maxRetries: 1 });
    this.name = `anthropic:${model}`;
  }

  async generate(system: string, prompt: string): Promise<string> {
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      // Server-side refusal fallback (routes a declined request to another model in the same call).
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: prompt }],
    } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (res.stop_reason === 'refusal') throw new Error('Model declined the request');
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) throw new Error('Empty response');
    return text;
  }
}

/** Local model via Ollama's HTTP API (fully offline when the ollama container is running). */
export class OllamaProvider implements LlmProvider {
  readonly name: string;
  constructor(
    private readonly url: string,
    private readonly model: string,
  ) {
    this.name = `ollama:${model}`;
  }

  async generate(system: string, prompt: string): Promise<string> {
    const res = await fetch(`${this.url.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, system, prompt, stream: false, options: { temperature: 0.3 } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = (await res.json()) as { response?: string };
    const text = (data.response ?? '').trim();
    if (!text) throw new Error('Empty response');
    return text;
  }
}

export function createProvider(config: Config): LlmProvider | null {
  if (config.LLM_PROVIDER === 'anthropic') return new AnthropicProvider(config.ANTHROPIC_API_KEY, config.ANTHROPIC_MODEL);
  if (config.LLM_PROVIDER === 'ollama') return new OllamaProvider(config.OLLAMA_URL, config.OLLAMA_MODEL);
  return null;
}

const SYSTEM = [
  'You are a Directing Staff (DS) assistant at a staff college, drafting after-action-review text for a',
  'FICTIONAL, synthetic training wargame. Use only the facts provided. Be concise, neutral and',
  'constructive; judge decisions on what was knowable at the time, not on hindsight. Never invent units,',
  'real-world places, real operations, weapons data or technical electronic-warfare detail. Plain text only.',
].join(' ');

const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Narrative + per-decision feedback drafts. Falls back to the template blocks on any error. */
export function makeEnricher(provider: LlmProvider | null, log: { warn: (o: unknown, m?: string) => void }): AarEnricher | undefined {
  if (!provider) return undefined;
  return async (aar: AarReport): Promise<AarReport> => {
    const facts = {
      scenario: aar.meta.scenarioTitle,
      mission: aar.q1.brief.mission,
      intent: aar.q1.intent.finalText,
      outcome: aar.q2.outcome.summary,
      team: aar.q3.team,
      roles: aar.q3.roleMetrics.map((r) => ({ role: r.role, callsign: r.callsign, decisions: r.decisions, brier: r.calibration.brier, verificationRate: r.verification.rate, intentWhileCutOff: r.intent.cutOff, sa: r.sa.mean, cutOffMin: Math.round(r.cutOffTotalS / 60) })),
      sustain: aar.q4.sustain,
      improve: aar.q4.improve,
    };
    const narrativeP = provider
      .generate(SYSTEM, `Write a four-part AAR narrative (headings: 1. What was supposed to happen? 2. What actually happened? 3. Why? 4. Sustain / improve), max 300 words, from these facts:\n${JSON.stringify(facts)}`)
      .then((text): NarrativeBlock => ({ text: cap(text, 4000), source: 'ai', provider: provider.name }))
      .catch((err: unknown) => {
        log.warn(err, 'LLM narrative failed — using template');
        return aar.q4.narrative;
      });
    const feedback = { ...aar.q4.rationaleFeedback };
    const decisions = aar.q3.decisions.slice(0, 12);
    const work = decisions.map((d) => async () => {
      const f = {
        role: d.role, action: d.action, target: d.targetCell, confidence: d.confidence, rationale: d.rationale,
        cutOff: d.cutOff, intelHeld: d.knowable.intel.length, openConflicts: d.knowable.openConflicts.map((c) => c.reason),
        citedAges: d.knowable.intel.filter((i) => d.basedOn.includes(i.id)).map((i) => Math.round(i.ageMs / 60000)),
        outcome: d.adjudication.soundness, reason: d.adjudication.reason, intentScore: d.intentScore,
      };
      try {
        const text = await provider.generate(SYSTEM, `In at most 3 sentences, coach this trainee on the decision below. Address what they knew, how they handled uncertainty and whether their confidence matched the outcome.\n${JSON.stringify(f)}`);
        feedback[d.id] = { text: cap(text, 800), source: 'ai', provider: provider.name };
      } catch (err) {
        log.warn(err, `LLM feedback failed for ${d.id} — using template`);
      }
    });
    // Small concurrency limit to stay polite to the provider.
    const queue = [...work];
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await job();
    }));
    return { ...aar, q4: { ...aar.q4, narrative: await narrativeP, rationaleFeedback: feedback } };
  };
}

export interface ReportVariants {
  source: 'template' | 'ai';
  provider: string | null;
  formats: { salute: string; contact: string; sitrep: string };
  contradictory: [string, string];
}

/** Report text in military formats + a contradictory pair (template, or AI-drafted). */
export async function reportVariants(
  provider: LlmProvider | null,
  input: { cell: Cell; unitType: UnitType; count: number },
  tMs: number,
): Promise<ReportVariants> {
  const r = { kind: 'CONTACT' as const, cell: input.cell, unitType: input.unitType, count: input.count, observedAtMs: tMs };
  const s = saluteLines(r);
  const what = UNIT_TYPE_LABEL[input.unitType] ?? input.unitType;
  const template: ReportVariants = {
    source: 'template',
    provider: null,
    formats: {
      salute: `SALUTE — S: ${s.S} / A: ${s.A} / L: ${s.L} / U: ${s.U} / T: ${s.T} / E: ${s.E}`,
      contact: reportText(r),
      sitrep: `SITREP. Hostile ${what} (${input.count}) observed GRID ${input.cell}. Own forces holding. Request instructions.`,
    },
    contradictory: [
      reportText(r),
      input.count >= 3
        ? `CONTACT. ${Math.max(1, input.count - 3)}x ${what.toUpperCase()} at GRID ${input.cell}; remainder appear to be decoys.`
        : `NEGATIVE. No heavy-vehicle signature at GRID ${input.cell}.`,
    ],
  };
  if (!provider) return template;
  try {
    const out = await provider.generate(
      SYSTEM,
      `Write two short, contradictory radio contact reports (one line each, military style) about grid ${input.cell} where the true observation is ${input.count}x ${what}. One should support the observation, the other should contradict it (different count, type or "no contact"). Output exactly two lines starting "A:" and "B:".`,
    );
    const a = /^\s*A:\s*(.+)$/m.exec(out)?.[1]?.trim();
    const b = /^\s*B:\s*(.+)$/m.exec(out)?.[1]?.trim();
    if (!a || !b) throw new Error('Unparseable variants');
    return { ...template, source: 'ai', provider: provider.name, contradictory: [cap(a, 300), cap(b, 300)] };
  } catch {
    return template;
  }
}
