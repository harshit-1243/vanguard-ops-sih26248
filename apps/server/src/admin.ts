import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AdminLoginBodySchema,
  SaveScenarioBodySchema,
  type AdminStatus,
  type NarrativeBlock,
} from '@vanguard/shared';
import { AnalyticsService } from './analytics';
import { hashSecret, RateLimiter, sameHash } from './auth';
import { validateScenario } from './editor';
import type { LlmProvider } from './llm';
import type { ScenarioRegistry } from './scenarios';
import type { EventStore } from './store/types';

const MAX_CUSTOM_SCENARIOS = 200;

/**
 * Course-director area: scenario editor + cross-course analytics. Protected by ADMIN_KEY (sent as a
 * bearer token). Without ADMIN_KEY the area is open — intended for a closed LAN / local dev only;
 * the Render Blueprint generates a key.
 */
export function registerAdminRoutes(
  app: FastifyInstance,
  deps: { adminKey: string | undefined; scenarios: ScenarioRegistry; store: EventStore; llm: LlmProvider | null },
): void {
  const { scenarios, store, llm } = deps;
  const keyHash = deps.adminKey ? hashSecret(deps.adminKey) : null;
  const failLimiter = new RateLimiter(10, 60_000);
  const analytics = new AnalyticsService(store);
  if (!keyHash) app.log.warn('ADMIN_KEY not set — scenario editor and analytics are open to anyone who can reach the server');

  const isAdmin = (req: FastifyRequest): boolean => {
    if (!keyHash) return true;
    const h = req.headers.authorization;
    const token = h?.startsWith('Bearer ') ? h.slice(7).trim() : '';
    return token.length > 0 && sameHash(keyHash, hashSecret(token));
  };
  /** Returns false (and replies) when the caller is not the course director. */
  const guard = (req: FastifyRequest, reply: FastifyReply): boolean => {
    if (isAdmin(req)) return true;
    // Every failed attempt counts against the caller (brute-force protection).
    if (!failLimiter.allow(req.ip)) void reply.code(429).send({ error: 'Too many attempts — wait a minute' });
    else void reply.code(401).send({ error: 'Course-director key required' });
    return false;
  };

  app.get('/api/admin/status', async (): Promise<AdminStatus> => ({ required: keyHash !== null }));

  app.post('/api/admin/login', async (req, reply) => {
    if (!failLimiter.allow(`login:${req.ip}`)) return reply.code(429).send({ error: 'Too many attempts — wait a minute' });
    const { key } = AdminLoginBodySchema.parse(req.body ?? {});
    if (keyHash && !sameHash(keyHash, hashSecret(key))) return reply.code(401).send({ error: 'Wrong key' });
    return { ok: true };
  });

  // ---- scenario library + editor ----
  app.get('/api/admin/scenarios/:id', async (req, reply) => {
    if (!guard(req, reply)) return reply;
    const sc = scenarios.get((req.params as { id: string }).id);
    if (!sc) return reply.code(404).send({ error: 'Unknown scenario' });
    return { scenario: sc, custom: scenarios.isCustom(sc.id) };
  });

  app.post('/api/admin/scenarios/validate', async (req, reply) => {
    if (!guard(req, reply)) return reply;
    const { scenario } = SaveScenarioBodySchema.parse(req.body ?? {});
    const { scenario: _parsed, ...v } = validateScenario(scenario);
    return v;
  });

  app.put('/api/admin/scenarios/:id', async (req, reply) => {
    if (!guard(req, reply)) return reply;
    const id = (req.params as { id: string }).id;
    const { scenario } = SaveScenarioBodySchema.parse(req.body ?? {});
    const v = validateScenario(scenario);
    if (!v.ok || !v.scenario) {
      const { scenario: _s, ...rest } = v;
      return reply.code(400).send({ error: 'Scenario is not valid', validation: rest });
    }
    if (v.scenario.id !== id) return reply.code(400).send({ error: `Scenario id "${v.scenario.id}" does not match URL "${id}"` });
    if (scenarios.isBuiltin(id)) return reply.code(409).send({ error: 'Built-in scenarios are read-only — duplicate it under a new id' });
    if (!scenarios.isCustom(id) && scenarios.list().filter((s) => s.custom).length >= MAX_CUSTOM_SCENARIOS) {
      return reply.code(409).send({ error: `At most ${MAX_CUSTOM_SCENARIOS} custom scenarios` });
    }
    const saved = await store.saveCustomScenario({ id, title: v.scenario.title, scenario: v.scenario });
    scenarios.putCustom(v.scenario, saved.updatedAt);
    const { scenario: _s, ...rest } = v;
    return { ok: true, id, updatedAt: saved.updatedAt.toISOString(), validation: rest };
  });

  app.delete('/api/admin/scenarios/:id', async (req, reply) => {
    if (!guard(req, reply)) return reply;
    const id = (req.params as { id: string }).id;
    if (scenarios.isBuiltin(id)) return reply.code(409).send({ error: 'Built-in scenarios cannot be deleted' });
    if (!scenarios.isCustom(id)) return reply.code(404).send({ error: 'Unknown scenario' });
    await store.deleteCustomScenario(id);
    scenarios.removeCustom(id);
    return { ok: true };
  });

  // ---- cross-course analytics ----
  const filtersOf = (req: FastifyRequest) => {
    const q = req.query as { course?: string; scenario?: string };
    return {
      course: typeof q.course === 'string' ? q.course.slice(0, 60) : null,
      scenarioId: typeof q.scenario === 'string' && q.scenario ? q.scenario.slice(0, 60) : null,
    };
  };
  app.get('/api/admin/analytics', async (req, reply) => {
    if (!guard(req, reply)) return reply;
    return analytics.compute(filtersOf(req));
  });
  app.get('/api/admin/analytics.csv', async (req, reply) => {
    if (!guard(req, reply)) return reply;
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="vanguard-analytics.csv"')
      .send(await analytics.csv(filtersOf(req)));
  });
  /** Optional AI summary of the analytics for the course director (labelled draft; null without AI). */
  app.post('/api/admin/analytics/brief', async (req, reply) => {
    if (!guard(req, reply)) return reply;
    if (!llm) return { briefing: null };
    const a = await analytics.compute(filtersOf(req));
    const facts = {
      exercises: a.totals.exercises,
      decisions: a.totals.decisions,
      team: a.totals.metrics,
      byRole: a.byRole.map((r) => ({ role: r.label, sound: r.metrics.soundRate, verification: r.metrics.verificationRate, intentCutOff: r.metrics.intentCutOff, sa: r.metrics.saMean })),
      pitfalls: a.pitfalls.slice(0, 5).map((p) => ({ rule: p.rule, count: p.count })),
      findings: a.insights,
    };
    try {
      const text = await llm.generate(
        'You advise the course director of a staff college running a FICTIONAL, synthetic wargame. Use only the facts given (rates are 0–1; Brier lower is better). Plain text, at most 5 sentences, no real-world units or technical EW detail.',
        `Summarise what this cohort does well, what it most needs to practise, and which exercise variables to change next:\n${JSON.stringify(facts)}`,
      );
      const briefing: NarrativeBlock = { text: text.slice(0, 1500), source: 'ai', provider: llm.name };
      return { briefing };
    } catch (err) {
      app.log.warn(err, 'LLM analytics brief failed');
      return { briefing: null };
    }
  });
}
