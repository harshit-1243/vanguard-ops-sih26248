import type { RoleId, Scenario, SessionSettings } from '@vanguard/shared';
import { newSessionCode } from './auth';
import type { ScenarioRegistry } from './scenarios';
import { LiveSession, type SessionOptions } from './session';
import type { EventStore } from './store/types';

export class SessionManager {
  private readonly sessions = new Map<string, LiveSession>();

  constructor(
    readonly store: EventStore,
    readonly scenarios: ScenarioRegistry,
    private readonly opts: SessionOptions,
  ) {}

  /** Hook used by the socket gateway to broadcast on every change. */
  set onChange(fn: (s: LiveSession) => void) {
    this.opts.onChange = fn;
    for (const s of this.sessions.values()) s.onChange = fn;
  }

  async create(scenarioId: string, seed?: number, enabledRoles?: RoleId[], settings?: SessionSettings) {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) throw new NotFound(`Unknown scenario ${scenarioId}`);
    let code = newSessionCode();
    for (let i = 0; i < 20 && (this.sessions.has(code) || (await this.store.findSessionByCode(code))); i++) {
      code = newSessionCode();
    }
    const created = await LiveSession.create(
      this.store,
      scenario,
      code,
      seed ?? scenario.defaultSeed,
      enabledRoles,
      this.opts,
      settings,
    );
    this.sessions.set(code, created.session);
    return created;
  }

  get(code: string): LiveSession | undefined {
    return this.sessions.get(code.toUpperCase());
  }

  /** Get a live session or load an ENDED one from the store (for AAR access after restart). */
  async getOrLoad(code: string): Promise<LiveSession | undefined> {
    const live = this.get(code);
    if (live) return live;
    const rec = await this.store.findSessionByCode(code.toUpperCase());
    if (!rec) return undefined;
    const session = await LiveSession.rehydrate(this.store, rec, rec.scenario as Scenario, this.opts);
    this.sessions.set(rec.code, session);
    return session;
  }

  /** Rebuild every non-ended session from the event log (server restart). */
  async rehydrateAll(): Promise<number> {
    const open = await this.store.listOpenSessions();
    for (const rec of open) {
      const session = await LiveSession.rehydrate(this.store, rec, rec.scenario as Scenario, this.opts);
      this.sessions.set(rec.code, session);
    }
    return open.length;
  }

  list(): LiveSession[] {
    return [...this.sessions.values()];
  }

  async shutdown(): Promise<void> {
    for (const s of this.sessions.values()) {
      s.dispose();
      await s.flush();
    }
  }
}

export class NotFound extends Error {
  readonly statusCode = 404;
}
