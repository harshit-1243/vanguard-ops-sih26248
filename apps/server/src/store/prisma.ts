import { PrismaClient, type Prisma } from '@prisma/client';
import type { RoleId, StoredEvent } from '@vanguard/shared';
import type { EventStore, PlayerRecord, SessionPatch, SessionRecord, SessionStatus } from './types';

type SessionRow = Prisma.SessionGetPayload<object>;

function toRecord(r: SessionRow): SessionRecord {
  return {
    id: r.id,
    code: r.code,
    scenarioId: r.scenarioId,
    seed: r.seed,
    status: r.status as SessionStatus,
    pinHash: r.pinHash,
    instructorTokenHashes: r.instructorTokenHashes,
    enabledRoles: r.enabledRoles as RoleId[],
    scenario: r.scenario,
    createdAt: r.createdAt,
    endedAt: r.endedAt,
  };
}

/** PostgreSQL event store via Prisma (Docker / production / CI). */
export class PrismaEventStore implements EventStore {
  readonly kind = 'postgres' as const;
  readonly db: PrismaClient;

  constructor(url: string) {
    this.db = new PrismaClient({ datasources: { db: { url } } });
  }

  async init(): Promise<void> {
    await this.db.$connect();
  }

  async createSession(rec: SessionRecord): Promise<void> {
    await this.db.session.create({
      data: {
        id: rec.id,
        code: rec.code,
        scenarioId: rec.scenarioId,
        seed: rec.seed,
        status: rec.status,
        pinHash: rec.pinHash,
        instructorTokenHashes: rec.instructorTokenHashes,
        enabledRoles: rec.enabledRoles,
        scenario: rec.scenario as Prisma.InputJsonValue,
        createdAt: rec.createdAt,
        endedAt: rec.endedAt,
      },
    });
  }

  async updateSession(id: string, patch: SessionPatch): Promise<void> {
    await this.db.session.update({ where: { id }, data: patch });
  }

  async findSessionByCode(code: string): Promise<SessionRecord | null> {
    const r = await this.db.session.findUnique({ where: { code } });
    return r ? toRecord(r) : null;
  }

  async listOpenSessions(): Promise<SessionRecord[]> {
    const rows = await this.db.session.findMany({
      where: { status: { not: 'ENDED' } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  }

  async countSessions(): Promise<number> {
    return this.db.session.count();
  }

  async appendEvent(e: StoredEvent): Promise<void> {
    await this.db.event.create({
      data: {
        id: e.id,
        sessionId: e.sessionId,
        seq: e.seq,
        tSimMs: e.tSimMs,
        tWall: new Date(e.tWall),
        type: e.type,
        actor: e.actor,
        payload: e.payload as Prisma.InputJsonValue,
      },
    });
  }

  async loadEvents(sessionId: string): Promise<StoredEvent[]> {
    const rows = await this.db.event.findMany({ where: { sessionId }, orderBy: { seq: 'asc' } });
    return rows.map(
      (r) =>
        ({
          id: r.id,
          sessionId: r.sessionId,
          seq: r.seq,
          tSimMs: r.tSimMs,
          tWall: r.tWall.toISOString(),
          type: r.type,
          actor: r.actor,
          payload: r.payload,
        }) as StoredEvent,
    );
  }

  async upsertPlayer(p: PlayerRecord): Promise<void> {
    await this.db.player.upsert({
      where: { sessionId_roleId: { sessionId: p.sessionId, roleId: p.roleId } },
      create: { ...p },
      update: { callsign: p.callsign, tokenHash: p.tokenHash },
    });
  }

  async deletePlayer(sessionId: string, roleId: RoleId): Promise<void> {
    await this.db.player.deleteMany({ where: { sessionId, roleId } });
  }

  async loadPlayers(sessionId: string): Promise<PlayerRecord[]> {
    const rows = await this.db.player.findMany({ where: { sessionId } });
    return rows.map((r) => ({
      sessionId: r.sessionId,
      roleId: r.roleId as RoleId,
      callsign: r.callsign,
      tokenHash: r.tokenHash,
    }));
  }

  async close(): Promise<void> {
    await this.db.$disconnect();
  }
}
