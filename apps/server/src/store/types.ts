import type { RoleId, StoredEvent } from '@vanguard/shared';

export type SessionStatus = 'LOBBY' | 'ACTIVE' | 'ENDED';

export interface SessionRecord {
  id: string;
  code: string;
  scenarioId: string;
  seed: number;
  status: SessionStatus;
  pinHash: string;
  instructorTokenHashes: string[];
  enabledRoles: RoleId[];
  scenario: unknown;
  createdAt: Date;
  endedAt: Date | null;
}

export interface PlayerRecord {
  sessionId: string;
  roleId: RoleId;
  callsign: string;
  tokenHash: string;
}

export type SessionPatch = Partial<Pick<SessionRecord, 'status' | 'endedAt' | 'instructorTokenHashes'>>;

/** Append-only event store (PRD §12). Implementations: Memory (dev/tests), Prisma (Postgres). */
export interface EventStore {
  readonly kind: 'memory' | 'postgres';
  init(): Promise<void>;
  createSession(rec: SessionRecord): Promise<void>;
  updateSession(id: string, patch: SessionPatch): Promise<void>;
  findSessionByCode(code: string): Promise<SessionRecord | null>;
  listOpenSessions(): Promise<SessionRecord[]>;
  countSessions(): Promise<number>;
  appendEvent(e: StoredEvent): Promise<void>;
  loadEvents(sessionId: string): Promise<StoredEvent[]>;
  upsertPlayer(p: PlayerRecord): Promise<void>;
  deletePlayer(sessionId: string, roleId: RoleId): Promise<void>;
  loadPlayers(sessionId: string): Promise<PlayerRecord[]>;
  close(): Promise<void>;
}
