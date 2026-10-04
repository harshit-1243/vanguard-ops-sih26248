import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Server } from 'socket.io';
import { ZodError } from 'zod';
import {
  CreateSessionBodySchema,
  InstructorLoginBodySchema,
  JoinBodySchema,
  SessionCodeSchema,
} from '@vanguard/shared';
import { RateLimiter } from './auth';
import type { Config } from './config';
import { attachGateway } from './gateway';
import { NotFound, SessionManager } from './manager';
import { ScenarioRegistry } from './scenarios';
import type { LiveSession, SessionActor } from './session';
import { MemoryEventStore } from './store/memory';
import type { EventStore } from './store/types';

export interface AppContext {
  app: FastifyInstance;
  io: Server;
  manager: SessionManager;
  store: EventStore;
  config: Config;
}

export async function createStore(config: Config): Promise<EventStore> {
  if (!config.DATABASE_URL) return new MemoryEventStore();
  const { PrismaEventStore } = await import('./store/prisma');
  return new PrismaEventStore(config.DATABASE_URL);
}

export function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7).trim();
  const q = (req.query as Record<string, unknown> | undefined)?.token;
  return typeof q === 'string' ? q : null;
}

export async function buildApp(config: Config, store?: EventStore): Promise<AppContext> {
  const app = Fastify({
    logger: config.LOG_LEVEL === 'silent' ? false : { level: config.LOG_LEVEL },
    bodyLimit: 256 * 1024,
  });
  const st = store ?? (await createStore(config));
  await st.init();
  const scenarios = ScenarioRegistry.fromDir(config.scenariosDir);
  const manager = new SessionManager(st, scenarios, {
    tickHz: config.TICK_HZ,
    onError: (err) => app.log.error(err, 'session error'),
  });
  const pinLimiter = new RateLimiter(5, 60_000);

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
    if (err instanceof NotFound) return reply.code(404).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'Internal error' : err.message });
  });

  const sessionOr404 = async (code: string): Promise<LiveSession> => {
    const c = SessionCodeSchema.safeParse(code);
    const s = c.success ? await manager.getOrLoad(c.data) : undefined;
    if (!s) throw new NotFound('Exercise not found');
    return s;
  };

  /** DS any time; trainees of this session once ENDED (PRD US-AAR-9). */
  const requireAarAccess = async (req: FastifyRequest, reply: FastifyReply): Promise<LiveSession | null> => {
    const s = await sessionOr404((req.params as { code: string }).code);
    const actor: SessionActor | null = s.resolveToken(bearer(req));
    if (actor === 'DS' || (actor && s.phase === 'ENDED')) return s;
    void reply.code(actor ? 403 : 401).send({ error: actor ? 'AAR available after the exercise ends' : 'Unauthorized' });
    return null;
  };

  app.get('/healthz', async () => ({
    ok: true,
    store: st.kind,
    sessions: manager.list().length,
    uptimeS: Math.round(process.uptime()),
  }));

  app.get('/api/scenarios', async () => scenarios.list());

  app.post('/api/sessions', async (req, reply) => {
    const body = CreateSessionBodySchema.parse(req.body ?? {});
    const created = await manager.create(body.scenarioId, body.seed, body.enabledRoles).catch((err: unknown) => {
      if (err instanceof NotFound) throw err;
      if (err instanceof Error && /CDR|two roles/.test(err.message)) throw Object.assign(err, { statusCode: 400 });
      throw err;
    });
    return reply.code(201).send({
      code: created.session.code,
      pin: created.pin,
      instructorToken: created.instructorToken,
    });
  });

  app.post('/api/sessions/:code/instructor', async (req, reply) => {
    if (!pinLimiter.allow(req.ip)) return reply.code(429).send({ error: 'Too many attempts — wait a minute' });
    const s = await sessionOr404((req.params as { code: string }).code);
    const { pin } = InstructorLoginBodySchema.parse(req.body ?? {});
    const token = await s.instructorLogin(pin);
    if (!token) return reply.code(401).send({ error: 'Wrong PIN' });
    return { instructorToken: token };
  });

  app.get('/api/sessions/:code/lobby', async (req) => (await sessionOr404((req.params as { code: string }).code)).lobby());

  app.post('/api/sessions/:code/join', async (req, reply) => {
    const s = await sessionOr404((req.params as { code: string }).code);
    const body = JoinBodySchema.parse(req.body ?? {});
    const r = await s.join(body.roleId, body.callsign);
    if (!r.ok) return reply.code(409).send({ error: r.error });
    return { playerToken: r.token, roleId: body.roleId, callsign: body.callsign };
  });

  /** Who am I (token check for page reloads). */
  app.get('/api/sessions/:code/me', async (req, reply) => {
    const s = await sessionOr404((req.params as { code: string }).code);
    const actor = s.resolveToken(bearer(req));
    if (!actor) return reply.code(401).send({ error: 'Unauthorized' });
    return { actor, phase: s.phase };
  });

  /** Public briefing (what every participant is told before the exercise). */
  app.get('/api/sessions/:code/briefing', async (req) => {
    const s = await sessionOr404((req.params as { code: string }).code);
    const sc = s.scenario;
    return {
      title: sc.title,
      theatre: sc.theatre,
      summary: sc.summary,
      brief: sc.brief,
      intent: sc.intent.text,
      terrain: sc.terrain,
      objectives: sc.objectives,
      features: sc.features.map((f) => ({ id: f.id, label: f.label, kind: f.kind, cell: f.cell })),
    };
  });

  app.decorate('requireAarAccess', requireAarAccess);

  // ---- static SPA (production) ----
  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: '/', wildcard: false, index: ['index.html'] });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  const io = attachGateway(app.server, manager, app.log);
  // Disconnect websockets before the HTTP server closes, otherwise close() waits on them forever.
  app.addHook('preClose', async () => {
    io.disconnectSockets(true);
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
  app.addHook('onClose', async () => {
    await manager.shutdown();
    await st.close();
  });

  return { app, io, manager, store: st, config };
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAarAccess: (req: FastifyRequest, reply: FastifyReply) => Promise<LiveSession | null>;
  }
}
