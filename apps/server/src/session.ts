import { randomUUID } from 'node:crypto';
import {
  type Actor,
  type DsCommand,
  type InputEventBody,
  type InstructorState,
  type LobbyInfo,
  type PerceivedPicture,
  type RoleId,
  type Scenario,
  type StoredEvent,
  type TraineeCommand,
} from '@vanguard/shared';
import { project, projectTruth, replay, SimRejection, Simulation } from '@vanguard/sim';
import { hashSecret, newPin, newToken, sameHash } from './auth';
import type { EventStore, SessionRecord } from './store/types';

export type SessionActor = 'DS' | RoleId;

export interface CommandResult {
  ok: boolean;
  error?: string;
}

export interface SessionOptions {
  tickHz: number;
  onChange?: (s: LiveSession) => void;
  onError?: (err: unknown) => void;
}

/** One live exercise: owns the Simulation, the input log, identities and the tick clock. */
export class LiveSession {
  readonly events: StoredEvent[] = [];
  readonly players = new Map<RoleId, { callsign: string; tokenHash: string }>();
  /** Connected socket count per actor (server-side presence; not part of the sim). */
  readonly presence = new Map<SessionActor, number>();
  onChange: (s: LiveSession) => void;
  private timer: NodeJS.Timeout | null = null;
  private timerSpeed = 0;
  private persistChain: Promise<void> = Promise.resolve();
  private readonly instructorHashes: Set<string>;

  private constructor(
    readonly record: SessionRecord,
    readonly scenario: Scenario,
    readonly sim: Simulation,
    private readonly store: EventStore,
    private readonly opts: SessionOptions,
  ) {
    this.instructorHashes = new Set(record.instructorTokenHashes);
    this.onChange = opts.onChange ?? (() => {});
  }

  get id(): string {
    return this.record.id;
  }
  get code(): string {
    return this.record.code;
  }
  get phase() {
    return this.sim.state.phase;
  }

  // ------------------------------------------------------------ lifecycle
  static async create(
    store: EventStore,
    scenario: Scenario,
    code: string,
    seed: number,
    enabledRoles: RoleId[] | undefined,
    opts: SessionOptions,
  ): Promise<{ session: LiveSession; pin: string; instructorToken: string }> {
    const sim = new Simulation(scenario, seed, enabledRoles);
    const pin = newPin();
    const instructorToken = newToken();
    const record: SessionRecord = {
      id: randomUUID(),
      code,
      scenarioId: scenario.id,
      seed,
      status: 'LOBBY',
      pinHash: hashSecret(`${code}:${pin}`),
      instructorTokenHashes: [hashSecret(instructorToken)],
      enabledRoles: [...sim.state.enabledRoles],
      scenario,
      createdAt: new Date(),
      endedAt: null,
    };
    await store.createSession(record);
    const session = new LiveSession(record, scenario, sim, store, opts);
    session.emit('SYSTEM', {
      type: 'SESSION_CREATED',
      payload: { scenarioId: scenario.id, seed, enabledRoles: record.enabledRoles },
    });
    await session.flush();
    return { session, pin, instructorToken };
  }

  /** Rebuild a session from its persisted log (server restart). Running sessions come back paused. */
  static async rehydrate(store: EventStore, record: SessionRecord, scenario: Scenario, opts: SessionOptions): Promise<LiveSession> {
    const events = await store.loadEvents(record.id);
    const sim = replay(scenario, events);
    const session = new LiveSession(record, scenario, sim, store, opts);
    session.events.push(...events);
    for (const p of await store.loadPlayers(record.id)) {
      session.players.set(p.roleId, { callsign: p.callsign, tokenHash: p.tokenHash });
    }
    if (sim.state.phase === 'RUNNING') session.emit('SYSTEM', { type: 'EXERCISE_PAUSED', payload: {} });
    if (sim.state.phase === 'PROBE') {
      const open = sim.state.probes.find((p) => p.endedAtMs === null);
      if (open) session.emit('SYSTEM', { type: 'PROBE_ENDED', payload: { probeId: open.id } });
      if ((sim.state.phase as string) === 'RUNNING') session.emit('SYSTEM', { type: 'EXERCISE_PAUSED', payload: {} });
    }
    return session;
  }

  // ------------------------------------------------------------ identity
  resolveToken(token: unknown): SessionActor | null {
    if (typeof token !== 'string' || token.length < 20) return null;
    const h = hashSecret(token);
    for (const x of this.instructorHashes) if (sameHash(x, h)) return 'DS';
    for (const [role, p] of this.players) if (sameHash(p.tokenHash, h)) return role;
    return null;
  }

  async instructorLogin(pin: string): Promise<string | null> {
    if (!sameHash(this.record.pinHash, hashSecret(`${this.code}:${pin}`))) return null;
    const token = newToken();
    this.instructorHashes.add(hashSecret(token));
    await this.store.updateSession(this.id, { instructorTokenHashes: [...this.instructorHashes] });
    return token;
  }

  /** Join a free role (or reclaim your own role by callsign when its seat is not connected). */
  async join(roleId: RoleId, callsign: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
    const rs = this.sim.state.roles[roleId];
    if (!rs || !rs.enabled) return { ok: false, error: 'Role not available in this exercise' };
    if (this.phase === 'ENDED') return { ok: false, error: 'Exercise has ended' };
    const existing = this.players.get(roleId);
    if (existing) {
      const reclaim = existing.callsign === callsign && (this.presence.get(roleId) ?? 0) === 0;
      if (!reclaim) return { ok: false, error: 'Role already taken' };
    } else {
      const r = this.command('SYSTEM', { type: 'ROLE_JOINED', payload: { roleId, callsign } });
      if (!r.ok) return { ok: false, error: r.error ?? 'Join failed' };
    }
    const token = newToken();
    const rec = { callsign, tokenHash: hashSecret(token) };
    this.players.set(roleId, rec);
    await this.store.upsertPlayer({ sessionId: this.id, roleId, ...rec });
    this.onChange(this);
    return { ok: true, token };
  }

  // ------------------------------------------------------------ commands
  /** Apply an input event: validate in the sim, then append to the log (persisted in order). */
  private emit(actor: Actor, body: InputEventBody): StoredEvent {
    const event = {
      ...body,
      id: randomUUID(),
      sessionId: this.id,
      seq: this.events.length + 1,
      tSimMs: this.sim.state.tMs,
      tWall: new Date().toISOString(),
      actor,
    } as StoredEvent;
    this.sim.apply(event);
    this.events.push(event);
    this.persistChain = this.persistChain
      .then(() => this.store.appendEvent(event))
      .catch((err) => this.opts.onError?.(err));
    return event;
  }

  command(actor: Actor, body: InputEventBody): CommandResult {
    try {
      this.emit(actor, body);
    } catch (err) {
      if (err instanceof SimRejection) return { ok: false, error: err.message };
      throw err;
    }
    this.afterChange();
    return { ok: true };
  }

  private afterChange(): void {
    this.syncClock();
    const status: SessionRecord['status'] = this.phase === 'ENDED' ? 'ENDED' : this.phase === 'LOBBY' ? 'LOBBY' : 'ACTIVE';
    if (status !== this.record.status) {
      this.record.status = status;
      this.record.endedAt = status === 'ENDED' ? new Date() : null;
      const patch = { status, endedAt: this.record.endedAt };
      this.persistChain = this.persistChain
        .then(() => this.store.updateSession(this.id, patch))
        .catch((err) => this.opts.onError?.(err));
    }
    this.onChange(this);
  }

  /** Map a DS socket command to input events. VIEW_AS is handled by the gateway. */
  dsCommand(cmd: DsCommand): CommandResult {
    const n = this.events.length + 1;
    switch (cmd.type) {
      case 'START':
        return this.command('DS', { type: 'EXERCISE_STARTED', payload: {} });
      case 'PAUSE':
        return this.command('DS', { type: 'EXERCISE_PAUSED', payload: {} });
      case 'RESUME':
        return this.command('DS', { type: 'EXERCISE_RESUMED', payload: {} });
      case 'SET_SPEED':
        return this.command('DS', { type: 'SPEED_SET', payload: { speed: cmd.speed } });
      case 'END':
        return this.command('DS', { type: 'EXERCISE_ENDED', payload: {} });
      case 'SET_INTENT':
        return this.command('DS', { type: 'INTENT_SET', payload: { text: cmd.text } });
      case 'FIRE_INJECT':
        return this.command('DS', { type: 'INJECT_FIRED', payload: { injectId: `DS-INJ-${n}`, inject: cmd.inject } });
      case 'MSEL_FIRE_NOW':
        return this.command('DS', { type: 'MSEL_FIRED', payload: { mselId: cmd.mselId } });
      case 'MSEL_SKIP':
        return this.command('DS', { type: 'MSEL_SKIPPED', payload: { mselId: cmd.mselId } });
      case 'MSEL_EDIT':
        return this.command('DS', { type: 'MSEL_EDITED', payload: { mselId: cmd.mselId, atS: cmd.atS } });
      case 'PLACE_JAMMER':
        return this.command('DS', {
          type: 'JAMMER_PLACED',
          payload: { jammer: { ...cmd.jammer, id: `DS-J${n}`, label: cmd.jammer.label ?? `DS jammer ${n}` } },
        });
      case 'MOVE_JAMMER':
        return this.command('DS', { type: 'JAMMER_MOVED', payload: { jammerId: cmd.jammerId, cell: cmd.cell } });
      case 'TOGGLE_JAMMER':
        return this.command('DS', { type: 'JAMMER_TOGGLED', payload: { jammerId: cmd.jammerId, active: cmd.active } });
      case 'REMOVE_JAMMER':
        return this.command('DS', { type: 'JAMMER_REMOVED', payload: { jammerId: cmd.jammerId } });
      case 'TRIGGER_CYBER':
        return this.command('DS', { type: 'CYBER_TRIGGERED', payload: { cyberId: `DS-CY-${n}`, cyber: cmd.cyber } });
      case 'START_PROBE':
        return this.command('DS', { type: 'PROBE_STARTED', payload: { probeId: `P${this.sim.state.probes.length + 1}` } });
      case 'END_PROBE': {
        const open = this.sim.state.probes.find((p) => p.endedAtMs === null);
        if (!open) return { ok: false, error: 'No open probe' };
        return this.command('DS', { type: 'PROBE_ENDED', payload: { probeId: open.id } });
      }
      case 'RELEASE_ROLE': {
        if (!this.players.has(cmd.role)) return { ok: false, error: 'Role is free' };
        const r = this.command('DS', { type: 'ROLE_LEFT', payload: { roleId: cmd.role } });
        if (r.ok) {
          this.players.delete(cmd.role);
          this.persistChain = this.persistChain
            .then(() => this.store.deletePlayer(this.id, cmd.role))
            .catch((err) => this.opts.onError?.(err));
          this.onChange(this);
        }
        return r;
      }
      case 'VIEW_AS':
        return { ok: true };
    }
  }

  /** Map a trainee socket command to input events (role bound server-side). */
  traineeCommand(role: RoleId, cmd: TraineeCommand): CommandResult {
    switch (cmd.type) {
      case 'SEND_MESSAGE':
        return this.command(role, { type: 'MESSAGE_SENT', payload: { channel: cmd.channel, to: cmd.to, text: cmd.text } });
      case 'FORWARD_INTEL':
        return this.command(role, { type: 'INTEL_FORWARDED', payload: { itemId: cmd.itemId, channel: cmd.channel, to: cmd.to } });
      case 'FLAG_CONFLICT':
        return this.command(role, { type: 'CONFLICT_FLAGGED', payload: { itemIds: cmd.itemIds } });
      case 'REQUEST_VERIFICATION':
        return this.command(role, { type: 'VERIFICATION_REQUESTED', payload: { itemId: cmd.itemId } });
      case 'SWITCH_PACE':
        return this.command(role, { type: 'PACE_SWITCHED', payload: { channel: cmd.channel } });
      case 'MAKE_DECISION':
        return this.command(role, { type: 'DECISION_MADE', payload: cmd.decision });
      case 'UPDATE_INTENT':
        return this.command(role, { type: 'INTENT_UPDATED', payload: { text: cmd.text } });
      case 'FREQ_HOP':
        return this.command(role, { type: 'FREQ_HOP', payload: { channel: cmd.channel } });
      case 'ANSWER_PROBE':
        return this.command(role, { type: 'PROBE_ANSWERED', payload: { probeId: cmd.probeId, answers: cmd.answers } });
    }
  }

  // ------------------------------------------------------------ clock
  /** One fixed sim step (1000 ms) + broadcast. */
  tick(): void {
    if (this.phase !== 'RUNNING') return;
    this.sim.step();
    this.onChange(this);
  }

  /** Run n steps synchronously (tests / demo seeding). */
  advance(steps: number): void {
    for (let i = 0; i < steps && this.phase === 'RUNNING'; i++) this.sim.step();
    this.onChange(this);
  }

  private syncClock(): void {
    const running = this.phase === 'RUNNING';
    const speed = this.sim.state.speed;
    if (!running) return this.stopClock();
    if (this.timer && this.timerSpeed === speed) return;
    this.stopClock();
    this.timerSpeed = speed;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        this.opts.onError?.(err);
      }
    }, 1000 / (this.opts.tickHz * speed));
  }

  stopClock(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.timerSpeed = 0;
  }

  /** Wait until all appended events are persisted. */
  flush(): Promise<void> {
    return this.persistChain;
  }

  // ------------------------------------------------------------ views
  picture(role: RoleId): PerceivedPicture {
    return project(this.sim.ctx, role, this.code);
  }

  truth(): InstructorState {
    const connected = new Set(
      [...this.presence.entries()].filter(([a, n]) => a !== 'DS' && n > 0).map(([a]) => a as RoleId),
    );
    return projectTruth(this.sim.ctx, this.code, connected);
  }

  lobby(): LobbyInfo {
    const s = this.sim.state;
    return {
      code: this.code,
      scenarioId: this.scenario.id,
      title: this.scenario.title,
      theatre: this.scenario.theatre,
      phase: s.phase,
      roles: this.scenario.roles
        .filter((r) => s.enabledRoles.includes(r.id))
        .map((r) => {
          const p = this.players.get(r.id);
          return {
            id: r.id,
            title: r.title,
            callsign: r.callsign,
            description: r.description,
            taken: !!p,
            takenBy: p?.callsign ?? null,
            connected: (this.presence.get(r.id) ?? 0) > 0,
          };
        }),
    };
  }

  setPresence(actor: SessionActor, delta: 1 | -1): void {
    this.presence.set(actor, Math.max(0, (this.presence.get(actor) ?? 0) + delta));
    this.onChange(this);
  }

  dispose(): void {
    this.stopClock();
  }
}
