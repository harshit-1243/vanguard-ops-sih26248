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
  /** Course / syndicate label for analytics ("" = none). */
  course: string;
  createdAt: Date;
  endedAt: Date | null;
}

export interface PlayerRecord {
  sessionId: string;
  roleId: RoleId;
  callsign: string;
  tokenHash: string;
}

export interface CustomScenarioRecord {
  id: string;
  title: string;
  scenario: unknown;
  updatedAt: Date;
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
  listEndedSessions(): Promise<SessionRecord[]>;
  listCustomScenarios(): Promise<CustomScenarioRecord[]>;
  saveCustomScenario(rec: Omit<CustomScenarioRecord, 'updatedAt'>): Promise<CustomScenarioRecord>;
  deleteCustomScenario(id: string): Promise<boolean>;
  appendEvent(e: StoredEvent): Promise<void>;
  loadEvents(sessionId: string): Promise<StoredEvent[]>;
  upsertPlayer(p: PlayerRecord): Promise<void>;
  deletePlayer(sessionId: string, roleId: RoleId): Promise<void>;
  loadPlayers(sessionId: string): Promise<PlayerRecord[]>;
  close(): Promise<void>;
}
