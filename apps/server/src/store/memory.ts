import type { RoleId, StoredEvent } from '@vanguard/shared';
import type { CustomScenarioRecord, EventStore, PlayerRecord, SessionPatch, SessionRecord } from './types';

/** In-process store: zero-setup local dev and tests (DECISIONS D-003). Data is lost on restart. */
export class MemoryEventStore implements EventStore {
  readonly kind = 'memory' as const;
  private sessions = new Map<string, SessionRecord>();
  private events = new Map<string, StoredEvent[]>();
  private players = new Map<string, Map<RoleId, PlayerRecord>>();
  private scenarios = new Map<string, CustomScenarioRecord>();

  async init(): Promise<void> {}

  async createSession(rec: SessionRecord): Promise<void> {
    if ([...this.sessions.values()].some((s) => s.code === rec.code)) {
      throw new Error('duplicate code');
    }
    this.sessions.set(rec.id, structuredClone(rec));
    this.events.set(rec.id, []);
    this.players.set(rec.id, new Map());
  }

  async updateSession(id: string, patch: SessionPatch): Promise<void> {
    const s = this.sessions.get(id);
    if (s) Object.assign(s, structuredClone(patch));
  }

  async findSessionByCode(code: string): Promise<SessionRecord | null> {
    const s = [...this.sessions.values()].find((x) => x.code === code);
    return s ? structuredClone(s) : null;
  }

  async listOpenSessions(): Promise<SessionRecord[]> {
    return [...this.sessions.values()]
      .filter((s) => s.status !== 'ENDED')
      .map((s) => structuredClone(s));
  }

  async countSessions(): Promise<number> {
    return this.sessions.size;
  }

  async listEndedSessions(): Promise<SessionRecord[]> {
    return [...this.sessions.values()]
      .filter((s) => s.status === 'ENDED')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((s) => structuredClone(s));
  }

  async listCustomScenarios(): Promise<CustomScenarioRecord[]> {
    return [...this.scenarios.values()].map((s) => structuredClone(s));
  }

  async saveCustomScenario(rec: Omit<CustomScenarioRecord, 'updatedAt'>): Promise<CustomScenarioRecord> {
    const saved = { ...structuredClone(rec), updatedAt: new Date() };
    this.scenarios.set(rec.id, saved);
    return structuredClone(saved);
  }

  async deleteCustomScenario(id: string): Promise<boolean> {
    return this.scenarios.delete(id);
  }

  async appendEvent(e: StoredEvent): Promise<void> {
    const list = this.events.get(e.sessionId);
    if (!list) throw new Error('unknown session');
    if (list.some((x) => x.seq === e.seq)) throw new Error(`duplicate seq ${e.seq}`);
    list.push(structuredClone(e));
  }

  async loadEvents(sessionId: string): Promise<StoredEvent[]> {
    return structuredClone(this.events.get(sessionId) ?? []).sort((a, b) => a.seq - b.seq);
  }

  async upsertPlayer(p: PlayerRecord): Promise<void> {
    this.players.get(p.sessionId)?.set(p.roleId, { ...p });
  }

  async deletePlayer(sessionId: string, roleId: RoleId): Promise<void> {
    this.players.get(sessionId)?.delete(roleId);
  }

  async loadPlayers(sessionId: string): Promise<PlayerRecord[]> {
    return [...(this.players.get(sessionId)?.values() ?? [])].map((p) => ({ ...p }));
  }

  async close(): Promise<void> {}
}
