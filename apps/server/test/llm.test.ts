import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AarReport } from '@vanguard/shared';
import { aarFor } from '../src/aar';
import { loadConfig } from '../src/config';
import { seedDemo } from '../src/demo';
import { AnthropicProvider, OllamaProvider, createProvider, makeEnricher, reportVariants, type LlmProvider } from '../src/llm';
import { SessionManager } from '../src/manager';
import { ScenarioRegistry } from '../src/scenarios';
import { MemoryEventStore } from '../src/store/memory';
import { createSession, startServer } from './helpers';

const config = loadConfig({ LOG_LEVEL: 'silent' });
const log = { warn: vi.fn() };

async function demoAar(): Promise<AarReport> {
  const m = new SessionManager(new MemoryEventStore(), ScenarioRegistry.fromDir(config.scenariosDir), { tickHz: 1 });
  const d = await seedDemo(m);
  return aarFor(m.get(d.code)!);
}

const fake = (impl: (system: string, prompt: string) => Promise<string>): LlmProvider => ({ name: 'fake:model', generate: impl });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LLM provider selection', () => {
  it('defaults to none (templates only)', () => {
    expect(createProvider(config)).toBeNull();
    expect(createProvider(loadConfig({ LLM_PROVIDER: 'ollama' }))).toBeInstanceOf(OllamaProvider);
    const a = createProvider(loadConfig({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key' }));
    expect(a).toBeInstanceOf(AnthropicProvider);
    expect(a!.name).toBe('anthropic:claude-opus-5-5');
    expect(makeEnricher(null, log)).toBeUndefined();
  });
});

describe('AAR enrichment', () => {
  it('replaces narrative and feedback with AI drafts, labelled as such', async () => {
    const aar = await demoAar();
    const enrich = makeEnricher(fake(async (_s, p) => (p.startsWith('Write a four-part') ? 'AI narrative draft.' : 'AI coaching note.')), log)!;
    const out = await enrich(aar);
    expect(out.q4.narrative).toEqual({ text: 'AI narrative draft.', source: 'ai', provider: 'fake:model' });
    const fb = Object.values(out.q4.rationaleFeedback);
    expect(fb.filter((f) => f.source === 'ai').length).toBe(Math.min(12, aar.q3.decisions.length));
  });

  it('falls back to templates when the provider fails', async () => {
    const aar = await demoAar();
    const enrich = makeEnricher(fake(async () => { throw new Error('offline'); }), log)!;
    const out = await enrich(aar);
    expect(out.q4.narrative.source).toBe('template');
    expect(Object.values(out.q4.rationaleFeedback).every((f) => f.source === 'template')).toBe(true);
    expect(log.warn).toHaveBeenCalled();
  });
});

describe('report variants', () => {
  const input = { cell: 'D6', unitType: 'ARMOUR' as const, count: 5 };

  it('template formats + contradictory pair', async () => {
    const r = await reportVariants(null, input, 372_000);
    expect(r.source).toBe('template');
    expect(r.formats.salute).toMatch(/^SALUTE — S: 5 vehicles/);
    expect(r.formats.contact).toBe('CONTACT. 5x ARMOUR at GRID D6. Time T+06:12.');
    expect(r.formats.sitrep).toMatch(/SITREP/);
    expect(r.contradictory[1]).toMatch(/decoys/);
    expect((await reportVariants(null, { ...input, count: 1 }, 0)).contradictory[1]).toMatch(/^NEGATIVE/);
  });

  it('parses an AI pair and falls back on garbage', async () => {
    const ok = await reportVariants(fake(async () => 'A: Five tanks at D6.\nB: D6 is empty, decoys only.'), input, 0);
    expect(ok).toMatchObject({ source: 'ai', provider: 'fake:model', contradictory: ['Five tanks at D6.', 'D6 is empty, decoys only.'] });
    const bad = await reportVariants(fake(async () => 'no structure'), input, 0);
    expect(bad.source).toBe('template');
  });
});

describe('adapters (mocked transport)', () => {
  it('Ollama posts to /api/generate and returns the response text', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ response: ' hello ' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = new OllamaProvider('http://ollama:11434/', 'llama3.2');
    expect(await p.generate('sys', 'prompt')).toBe('hello');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://ollama:11434/api/generate');
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'llama3.2', system: 'sys', prompt: 'prompt', stream: false });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await expect(p.generate('s', 'p')).rejects.toThrow(/HTTP 500/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    await expect(p.generate('s', 'p')).rejects.toThrow(/Empty/);
  });

  it('Anthropic adapter sends Opus 5.5 at low effort with refusal fallbacks and handles refusals', async () => {
    const p = new AnthropicProvider('test-key', 'claude-opus-5-5');
    const create = vi.fn(async (_req: unknown) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'draft' }] as { type: string; text: string }[] }));
    (p as unknown as { client: { beta: { messages: { create: typeof create } } } }).client.beta.messages.create = create;
    expect(await p.generate('sys', 'prompt')).toBe('draft');
    expect(create.mock.calls[0]![0]).toMatchObject({
      model: 'claude-opus-5-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: 'sys',
      messages: [{ role: 'user', content: 'prompt' }],
    });
    create.mockResolvedValueOnce({ stop_reason: 'refusal', content: [] });
    await expect(p.generate('s', 'p')).rejects.toThrow(/declined/);
    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [] });
    await expect(p.generate('s', 'p')).rejects.toThrow(/Empty/);
  });
});

describe('AI endpoints', () => {
  it('status + DS-only report variants; drafted texts flow into a CONFLICT inject', async () => {
    const srv = await startServer();
    try {
      expect((await srv.api('GET', '/api/ai/status')).body).toMatchObject({ provider: 'none', enabled: false, ready: true, lastError: null });
      const { code, instructorToken } = await createSession(srv);
      expect((await srv.api('POST', `/api/sessions/${code}/ai/report-variants`, { cell: 'D6' })).status).toBe(401);
      const r = await srv.api<{ contradictory: [string, string] }>('POST', `/api/sessions/${code}/ai/report-variants`, { cell: 'D6' }, instructorToken);
      expect(r.status).toBe(200);
      const s = srv.manager.get(code)!;
      s.dsCommand({ type: 'START' });
      s.stopClock();
      await srv.api('POST', `/api/sessions/${code}/join`, { roleId: 'CDR', callsign: 'ARJUN' });
      const res = s.dsCommand({ type: 'FIRE_INJECT', inject: { type: 'CONFLICT', channels: ['CMD_NET'], roles: ['CDR'], durationS: 60, params: { targetCell: 'D6', reportTexts: r.body.contradictory } } });
      expect(res.ok).toBe(true);
      s.advance(10);
      const texts = s.sim.state.roles.CDR!.intel.filter((i) => i.cell === 'D6').map((i) => i.text);
      // Each half travels through the degraded net (it may be dropped); whatever arrives uses the drafted text.
      expect(texts.length).toBeGreaterThanOrEqual(1);
      for (const t of texts) expect(r.body.contradictory).toContain(t);
    } finally {
      await srv.close();
    }
  });
});

describe('OpenAI-compatible providers (Groq / Cerebras / xAI)', () => {
  it('selects presets only when a key is present, honours overrides', async () => {
    const { OpenAiCompatibleProvider } = await import('../src/llm');
    expect(createProvider(loadConfig({ LLM_PROVIDER: 'groq' }))).toBeNull();
    expect(createProvider(loadConfig({ LLM_PROVIDER: 'groq', GROQ_API_KEY: 'k' }))!.name).toBe('groq:openai/gpt-oss-120b');
    expect(createProvider(loadConfig({ LLM_PROVIDER: 'cerebras', CEREBRAS_API_KEY: 'k' }))!.name).toBe('cerebras:gpt-oss-120b');
    expect(createProvider(loadConfig({ LLM_PROVIDER: 'xai', XAI_API_KEY: 'k', LLM_MODEL: 'grok-x' }))!.name).toBe('xai:grok-x');
    expect(createProvider(loadConfig({ LLM_PROVIDER: 'openai', LLM_API_KEY: 'k' }))).toBeNull();
    expect(createProvider(loadConfig({ LLM_PROVIDER: 'openai', LLM_API_KEY: 'k', LLM_BASE_URL: 'http://x/v1', LLM_MODEL: 'm' }))).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  it('posts chat completions and reads the first choice', async () => {
    const { OpenAiCompatibleProvider } = await import('../src/llm');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: ' draft ' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = new OpenAiCompatibleProvider('groq', 'https://api.groq.com/openai/v1/', 'secret', 'llama-3.3-70b-versatile');
    expect(await p.generate('sys', 'hi')).toBe('draft');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret');
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }] });
    // 429: retried (honouring Retry-After), then surfaced with lastError set
    const limited = vi.fn(async () => new Response('rate limited', { status: 429, headers: { 'retry-after': '0.01' } }));
    vi.stubGlobal('fetch', limited);
    await expect(p.generate('s', 'p')).rejects.toThrow(/HTTP 429/);
    expect(limited).toHaveBeenCalledTimes(3);
    expect(p.lastError).toMatch(/HTTP 429/);
    expect(p.lastOkAt).not.toBeNull();
    const flaky = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 429, headers: { 'retry-after': '0.01' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'ok after retry' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', flaky);
    expect(await p.generate('s', 'p')).toBe('ok after retry');
    // reasoning models get low effort + headroom
    const reasoningFetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', reasoningFetch);
    await new OpenAiCompatibleProvider('groq', 'https://api.groq.com/openai/v1', 'k', 'openai/gpt-oss-120b').generate('s', 'p');
    expect(JSON.parse(String((reasoningFetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ reasoning_effort: 'low', max_tokens: 2500 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })));
    await expect(p.generate('s', 'p')).rejects.toThrow(/Empty/);
  });
});

describe('AI inject advisor', () => {
  it('suggests training-objective injects from live state; DS-only; apply works', async () => {
    const { adviseRules } = await import('../src/advisor');
    const srv = await startServer();
    try {
      const { code, instructorToken } = await createSession(srv, ['CDR', 'PL_A', 'PL_B']);
      const s = srv.manager.get(code)!;
      s.dsCommand({ type: 'START' });
      s.stopClock();
      s.advance(330);
      const rules = adviseRules(s);
      expect(rules.map((r) => r.id)).toEqual(['mission-command', 'pace', 'sa-probe']);
      expect((await srv.api('POST', `/api/sessions/${code}/ai/advisor`, {})).status).toBe(401);
      const r = await srv.api<{ suggestions: { id: string; command: unknown }[]; briefing: unknown }>('POST', `/api/sessions/${code}/ai/advisor`, {}, instructorToken);
      expect(r.body.briefing).toBeNull();
      const jam = r.body.suggestions.find((x) => x.id === 'mission-command')!;
      expect(s.dsCommand(jam.command as never).ok).toBe(true);
      expect(s.sim.state.jammers).toHaveLength(1);
      s.advance(5);
      expect(adviseRules(s).some((x) => x.id === 'mission-command')).toBe(false);
    } finally {
      await srv.close();
    }
  });

  it('adds an AI briefing when a provider is configured, and survives provider failure', async () => {
    const { advise } = await import('../src/advisor');
    const m = new SessionManager(new MemoryEventStore(), ScenarioRegistry.fromDir(config.scenariosDir), { tickHz: 1 });
    const { session } = await m.create('iron-bridge');
    session.dsCommand({ type: 'START' });
    session.stopClock();
    session.advance(400);
    const ok = await advise(session, fake(async () => 'Fire the jammer next.'));
    expect(ok.briefing).toMatchObject({ source: 'ai', text: 'Fire the jammer next.' });
    const bad = await advise(session, fake(async () => { throw new Error('quota'); }));
    expect(bad.briefing).toBeNull();
    expect(bad.suggestions.length).toBeGreaterThan(0);
  });
});

describe('plainText', () => {
  it('strips Markdown emphasis and headings that models add despite instructions', async () => {
    const { plainText } = await import('../src/llm');
    expect(plainText('## 1. What happened?\n**KESTREL** held __E5__.  \n- kept bullets')).toBe('1. What happened?\nKESTREL held E5.\n- kept bullets');
  });
});
