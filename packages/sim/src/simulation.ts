import {
  cellCentre,
  formatT,
  vecToCell,
  type ChannelId,
  type CyberSpec,
  type DecisionPayload,
  type DecisionRecord,
  type InjectSpec,
  type JammerSpec,
  type MessageItem,
  type PayloadOf,
  type RoleId,
  type Scenario,
  type SessionSettings,
  type SimEvent,
  DEFAULT_SETTINGS,
} from '@vanguard/shared';
import { adjudicate, airOnStation, commsDeficit, intentScore, resolveEngagement, resolveStrike } from './adjudication';
import { hashValue } from './hash';
import {
  conflictPair,
  generateSpoofs,
  OWN_OBS_INTERVAL_MS,
  ownObservation,
  POSREP_INTERVAL_MS,
  reconReport,
  routeChannel,
  sendPosrep,
  sendScripted,
  sensorSweep,
} from './intel';
import { isCutOff, roleChannelStatus } from './links';
import { reactOpfor } from './opfor';
import { deliverDue, transmit } from './pipeline';
import { generateProbe, scoreAnswer } from './probes';
import { knowableSnapshot, truthSnapshot } from './projection';
import { randInt, uniform } from './rng';
import {
  createInitialState,
  journal,
  makeCtx,
  nextId,
  roleState,
  SimRejection,
  type Ctx,
  type MselState,
  type SimState,
} from './state';
import { clampToGrid, gpsDrift, moveUnit, roleUnit, round3, stopUnit, unitPos } from './tracks';

export const STEP_MS = 1000;
export const RECON_DELAY_MS = 90_000;
export const VERIFY_DELAY_MS = 60_000;
export const STRIKE_DELAY_MS = 60_000;
export const RELAY_SETUP_MS = 60_000;
export const HOP_DURATION_MS = 60_000;
export const HOP_COOLDOWN_MS = 180_000;

const reject = (msg: string): never => {
  throw new SimRejection(msg);
};

export class Simulation {
  readonly ctx: Ctx;

  constructor(
    readonly scenario: Scenario,
    seed: number,
    enabledRoles?: RoleId[],
    settings: SessionSettings = DEFAULT_SETTINGS,
  ) {
    this.ctx = makeCtx(scenario, createInitialState(scenario, seed, enabledRoles, settings), settings);
  }

  get state(): SimState {
    return this.ctx.s;
  }

  hash(): string {
    return hashValue(this.ctx.s);
  }

  // ------------------------------------------------------------------ apply
  /** Apply one input event. Throws SimRejection (state untouched) when invalid. */
  apply(e: SimEvent): void {
    const s = this.ctx.s;
    if (e.seq <= s.lastSeq) reject(`Event seq ${e.seq} already applied`);
    if (e.tSimMs !== s.tMs) reject(`Event time ${e.tSimMs} != sim time ${s.tMs}`);
    if (s.phase === 'ENDED' && e.type !== 'SESSION_CREATED') reject('Exercise has ended');
    this.dispatch(e);
    s.lastSeq = e.seq;
  }

  private actorRole(e: SimEvent): RoleId {
    const r = e.actor;
    if (r === 'DS' || r === 'SYSTEM') return reject('Trainee action needs a role actor');
    const rs = roleState(this.ctx.s, r);
    if (!rs.enabled) reject(`Role ${r} is not enabled`);
    return r;
  }

  private requireLive(): void {
    const p = this.ctx.s.phase;
    if (p !== 'RUNNING' && p !== 'PAUSED') reject(`Not allowed while ${p}`);
  }

  private dispatch(e: SimEvent): void {
    const ctx = this.ctx;
    const s = ctx.s;
    switch (e.type) {
      case 'SESSION_CREATED':
      case 'CLOCK_CHECKPOINT':
        return;
      case 'ROLE_JOINED': {
        const rs = roleState(s, e.payload.roleId);
        if (!rs.enabled) reject('Role not enabled');
        if (rs.joined) reject('Role already taken');
        rs.joined = true;
        rs.playerCallsign = e.payload.callsign;
        journal(s, 'JOIN', `${e.payload.callsign} joined as ${e.payload.roleId}`, e.payload.roleId);
        return;
      }
      case 'ROLE_LEFT': {
        const rs = roleState(s, e.payload.roleId);
        rs.joined = false;
        rs.playerCallsign = null;
        journal(s, 'JOIN', `${e.payload.roleId} left`, e.payload.roleId);
        return;
      }
      case 'EXERCISE_STARTED':
        if (s.phase !== 'LOBBY') reject('Exercise already started');
        s.phase = 'RUNNING';
        journal(s, 'PHASE', 'Exercise started');
        return;
      case 'EXERCISE_PAUSED':
        if (s.phase !== 'RUNNING') reject('Not running');
        s.phase = 'PAUSED';
        journal(s, 'PHASE', 'Paused');
        return;
      case 'EXERCISE_RESUMED':
        if (s.phase !== 'PAUSED') reject('Not paused');
        s.phase = 'RUNNING';
        journal(s, 'PHASE', 'Resumed');
        return;
      case 'SPEED_SET':
        s.speed = e.payload.speed;
        return;
      case 'EXERCISE_ENDED':
        for (const p of s.probes) if (p.endedAtMs === null) p.endedAtMs = s.tMs;
        for (const r of s.enabledRoles) {
          const span = s.roles[r]!.cutOffSpans.at(-1);
          if (span && span.endMs === null) span.endMs = s.tMs;
        }
        s.phase = 'ENDED';
        journal(s, 'PHASE', 'Exercise ended');
        return;
      case 'INTENT_SET': {
        s.intent = { version: s.intent.version + 1, text: e.payload.text, byCallsign: 'HHQ', atMs: s.tMs };
        for (const r of Object.values(s.roles)) {
          r!.intent = { version: s.intent.version, text: e.payload.text, receivedAtMs: s.tMs, byCallsign: 'HHQ' };
        }
        journal(s, 'INTENT', `HHQ intent v${s.intent.version} issued`);
        return;
      }
      case 'INJECT_FIRED':
        if (s.phase === 'LOBBY') reject('Start the exercise first');
        this.fireInject(e.payload.injectId, e.payload.inject, 'DS', null);
        return;
      case 'MSEL_FIRED': {
        const m = this.pendingMsel(e.payload.mselId);
        if (s.phase === 'LOBBY') reject('Start the exercise first');
        this.fireMsel(m, true);
        return;
      }
      case 'MSEL_EDITED': {
        const m = this.pendingMsel(e.payload.mselId);
        m.atS = e.payload.atS;
        s.msel.sort((a, b) => a.atS - b.atS || (a.id < b.id ? -1 : 1));
        journal(s, 'MSEL', `MSEL ${m.id} retimed to T+${m.atS}s`);
        return;
      }
      case 'MSEL_SKIPPED': {
        const m = this.pendingMsel(e.payload.mselId);
        m.status = 'SKIPPED';
        journal(s, 'MSEL', `MSEL ${m.id} skipped`);
        return;
      }
      case 'JAMMER_PLACED':
        if (s.jammers.some((j) => j.id === e.payload.jammer.id)) reject('Duplicate jammer id');
        this.placeJammer(e.payload.jammer);
        return;
      case 'JAMMER_MOVED': {
        const j = this.jammer(e.payload.jammerId);
        j.cell = e.payload.cell;
        j.pos = cellCentre(e.payload.cell);
        journal(s, 'JAMMER', `Jammer ${j.id} moved to ${j.cell}`);
        return;
      }
      case 'JAMMER_TOGGLED': {
        const j = this.jammer(e.payload.jammerId);
        j.active = e.payload.active;
        journal(s, 'JAMMER', `Jammer ${j.id} ${j.active ? 'ON' : 'OFF'}`);
        return;
      }
      case 'JAMMER_REMOVED': {
        this.jammer(e.payload.jammerId);
        s.jammers = s.jammers.filter((j) => j.id !== e.payload.jammerId);
        journal(s, 'JAMMER', `Jammer ${e.payload.jammerId} removed`);
        return;
      }
      case 'CYBER_TRIGGERED':
        if (s.phase === 'LOBBY') reject('Start the exercise first');
        this.fireCyber(e.payload.cyberId, e.payload.cyber, 'DS');
        return;
      case 'MESSAGE_SENT':
        return this.sendMessage(this.actorRole(e), e.payload);
      case 'INTEL_FORWARDED':
        return this.forward(this.actorRole(e), e.payload);
      case 'CONFLICT_FLAGGED': {
        const role = this.actorRole(e);
        this.requireLive();
        const rs = s.roles[role]!;
        for (const id of e.payload.itemIds) {
          if (!rs.intel.some((i) => i.id === id)) reject(`Unknown intel item ${id}`);
        }
        rs.flags.push({ atMs: s.tMs, itemIds: [...e.payload.itemIds] });
        journal(s, 'FLAG', `${role} flagged conflict ${e.payload.itemIds.join(' / ')}`, role);
        return;
      }
      case 'VERIFICATION_REQUESTED': {
        const role = this.actorRole(e);
        this.requireLive();
        const rs = s.roles[role]!;
        const item = rs.intel.find((i) => i.id === e.payload.itemId) ?? reject('Unknown intel item');
        if (!item.cell) reject('Item has no location to verify');
        rs.verifications.push({ atMs: s.tMs, itemId: item.id, cell: item.cell });
        s.scheduled.push({
          id: nextId(s, 'S'),
          atMs: s.tMs + VERIFY_DELAY_MS,
          kind: 'RECON_REPORT',
          role,
          cell: item.cell!,
          decisionId: null,
          label: 'VERIFICATION PATROL',
        });
        journal(s, 'VERIFY', `${role} requested verification of ${item.id} (${item.cell})`, role);
        return;
      }
      case 'PACE_SWITCHED': {
        const role = this.actorRole(e);
        this.switchChannel(role, e.payload.channel);
        return;
      }
      case 'DECISION_MADE':
        return this.decide(this.actorRole(e), e.payload);
      case 'INTENT_UPDATED': {
        const role = this.actorRole(e);
        if (role !== 'CDR') reject('Only the CDR can refine intent');
        this.requireLive();
        return this.updateIntent(e.payload.text);
      }
      case 'FREQ_HOP': {
        const role = this.actorRole(e);
        if (role !== 'EW') reject('Only the EW officer can order a frequency hop');
        this.requireLive();
        const c = e.payload.channel;
        if (c === 'RUNNER') reject('Runner has no frequency');
        const h = s.freqHops[c];
        if (h && s.tMs < h.cooldownUntilMs) reject(`${c} hop on cooldown`);
        s.freqHops[c] = { untilMs: s.tMs + HOP_DURATION_MS, cooldownUntilMs: s.tMs + HOP_COOLDOWN_MS };
        journal(s, 'FREQ_HOP', `EW ordered frequency hop on ${c}`, role);
        return;
      }
      case 'PROBE_STARTED': {
        if (s.phase !== 'RUNNING' && s.phase !== 'PAUSED') reject('Probe needs a live exercise');
        if (s.probes.some((p) => p.endedAtMs === null)) reject('A probe is already open');
        const index = s.probes.length;
        s.probes.push({
          id: e.payload.probeId,
          index,
          startedAtMs: s.tMs,
          endedAtMs: null,
          phaseBefore: s.phase as "RUNNING" | "PAUSED",
          questions: generateProbe(ctx, e.payload.probeId, index),
          answers: {},
          scores: {},
        });
        s.phase = 'PROBE';
        journal(s, 'PROBE', `SAGAT freeze #${index + 1}`);
        return;
      }
      case 'PROBE_ANSWERED': {
        const role = this.actorRole(e);
        const p = s.probes.find((x) => x.id === e.payload.probeId && x.endedAtMs === null) ?? reject('No open probe');
        const qs = p.questions[role] ?? reject('No questions for role');
        if (p.answers[role]) reject('Already answered');
        const answers: Record<string, string> = {};
        const scores: Record<string, number> = {};
        for (const q of qs) {
          const a = (e.payload.answers[q.id] ?? 'UNKNOWN').trim().toUpperCase().slice(0, 20);
          answers[q.id] = a;
          scores[q.id] = scoreAnswer(q, a);
        }
        p.answers[role] = answers;
        p.scores[role] = scores;
        journal(s, 'PROBE', `${role} submitted probe answers`, role);
        return;
      }
      case 'PROBE_ENDED': {
        const p = s.probes.find((x) => x.id === e.payload.probeId && x.endedAtMs === null) ?? reject('No open probe');
        p.endedAtMs = s.tMs;
        s.phase = p.phaseBefore;
        journal(s, 'PROBE', `SAGAT probe #${p.index + 1} closed`);
        return;
      }
    }
  }

  private pendingMsel(id: string): MselState {
    const m = this.ctx.s.msel.find((x) => x.id === id) ?? reject(`Unknown MSEL ${id}`);
    if (m.status !== 'PENDING') reject(`MSEL ${id} is ${m.status}`);
    return m;
  }

  private jammer(id: string) {
    return this.ctx.s.jammers.find((j) => j.id === id) ?? reject(`Unknown jammer ${id}`);
  }

  // ------------------------------------------------------------- effects
  private affectedRoles(channels: ChannelId[], roles: RoleId[]): RoleId[] {
    const s = this.ctx.s;
    if (roles.length > 0) return roles.filter((r) => s.enabledRoles.includes(r));
    return s.enabledRoles.filter(
      (r) =>
        channels.some((c) => this.ctx.ch[c].members.includes(r)) ||
        this.ctx.sc.sensors.some((x) => channels.includes(x.channel) && x.deliverTo.includes(r)),
    );
  }

  private trigger(roles: RoleId[], label: string): void {
    for (const role of roles) this.ctx.s.triggers.push({ tMs: this.ctx.s.tMs, role, label });
  }

  fireInject(id: string, spec: InjectSpec, source: 'DS' | 'MSEL', mselId: string | null): void {
    const s = this.ctx.s;
    s.injects.push({
      id,
      spec,
      startMs: s.tMs,
      endMs: s.tMs + spec.durationS * 1000,
      source,
      mselId,
      lastSpoofMs: -1_000_000_000,
      expired: false,
    });
    const label = spec.label ?? `${spec.type} on ${spec.channels.join('/')}`;
    journal(s, 'INJECT', `${source} inject ${id}: ${label}${spec.roles.length ? ` → ${spec.roles.join(',')}` : ''} (${spec.durationS}s)`, null, id);
    this.trigger(this.affectedRoles(spec.channels, spec.roles), `Inject ${spec.type}`);
    if (spec.type === 'CONFLICT' && spec.params.targetCell) {
      conflictPair(this.ctx, spec.channels, spec.roles, spec.params.targetCell, spec.params.reportTexts);
    }
  }

  placeJammer(j: JammerSpec): void {
    const s = this.ctx.s;
    s.jammers.push({
      ...j,
      bands: [...j.bands],
      pos: cellCentre(j.cell),
      dfOffset: { dx: randInt(s, -1, 1), dy: randInt(s, -1, 1) },
      placedAtMs: s.tMs,
    });
    journal(s, 'JAMMER', `Jammer ${j.id} active at ${j.cell} r=${j.radius} [${j.bands.join(',')}] p=${j.power}`, null, j.id);
  }

  fireCyber(id: string, spec: CyberSpec, source: 'DS' | 'MSEL'): void {
    const s = this.ctx.s;
    let drift = null;
    if (spec.kind === 'GPS_SPOOF') {
      const rs = roleState(s, spec.role!);
      const a = uniform(s, 0, Math.PI * 2);
      const mag = spec.driftCells ?? 1.5;
      drift = { x: round3(Math.cos(a) * mag), y: round3(Math.sin(a) * mag) };
      rs.gps = { dx: drift.x, dy: drift.y, startMs: s.tMs, endMs: s.tMs + spec.durationS * 1000 };
    }
    s.cyber.push({ id, spec, startMs: s.tMs, endMs: s.tMs + spec.durationS * 1000, drift, lastSpoofMs: -1_000_000_000, source, expired: false });
    journal(s, 'CYBER', `${source} cyber ${spec.kind}${spec.role ? ` on ${spec.role}` : ''} for ${spec.durationS}s`, spec.role ?? null, id);
    const roles =
      spec.kind === 'GPS_SPOOF'
        ? [spec.role!]
        : spec.kind === 'C2_OUTAGE'
          ? [...s.enabledRoles]
          : this.affectedRoles(['ISR_DATALINK'], []);
    this.trigger(roles.filter((r) => s.enabledRoles.includes(r)), `Cyber ${spec.kind}`);
  }

  private fireMsel(m: MselState, manual: boolean): void {
    const s = this.ctx.s;
    m.status = 'FIRED';
    m.firedAtMs = s.tMs;
    journal(s, 'MSEL', `MSEL ${m.id} ${manual ? 'fired by DS' : 'auto-fired'}: ${m.title}`, null, m.id);
    const a = m.action;
    switch (a.kind) {
      case 'INJECT':
        this.fireInject(nextId(s, 'INJ'), a.inject, 'MSEL', m.id);
        break;
      case 'JAMMER':
        if (s.jammers.some((j) => j.id === a.jammer.id)) {
          const j = this.jammer(a.jammer.id);
          j.active = true;
        } else this.placeJammer(a.jammer);
        break;
      case 'JAMMER_TOGGLE': {
        const j = s.jammers.find((x) => x.id === a.jammerId);
        if (j) j.active = a.active;
        break;
      }
      case 'CYBER':
        this.fireCyber(nextId(s, 'CY'), a.cyber, 'MSEL');
        break;
      case 'REPORT':
        sendScripted(this.ctx, a.report);
        break;
    }
  }

  // ---------------------------------------------------------- trainee acts
  private sendMessage(role: RoleId, p: PayloadOf<'MESSAGE_SENT'>): void {
    const ctx = this.ctx;
    const s = ctx.s;
    this.requireLive();
    const ch = ctx.ch[p.channel];
    if (!ch.messaging || !ch.members.includes(role)) reject(`${role} is not on ${p.channel}`);
    const to = p.to.filter((r) => r !== role && ch.members.includes(r) && s.enabledRoles.includes(r));
    if (to.length === 0) reject('No valid recipients on that net');
    const id = nextId(s, 'M');
    const callsign = ctx.roleSpec[role]!.callsign;
    transmit(ctx, {
      channel: p.channel,
      from: role,
      fromRole: role,
      to,
      playerTraffic: true,
      build: () => ({
        kind: 'MESSAGE',
        item: {
          id,
          kind: 'MESSAGE',
          fromRole: role,
          fromCallsign: callsign,
          channel: p.channel,
          text: p.text,
          sentAtMs: s.tMs,
          deliveredAtMs: 0,
          corrupted: false,
        } satisfies MessageItem,
        intent: null,
      }),
    });
    s.roles[role]!.sent.push({ id, channel: p.channel, to, text: p.text, sentAtMs: s.tMs, kind: 'MESSAGE' });
    journal(s, 'MSG_SENT', `${role} → ${to.join(',')} on ${p.channel}: "${p.text.slice(0, 50)}"`, role, id);
  }

  private forward(role: RoleId, p: PayloadOf<'INTEL_FORWARDED'>): void {
    const ctx = this.ctx;
    const s = ctx.s;
    this.requireLive();
    const rs = s.roles[role]!;
    const item = rs.intel.find((i) => i.id === p.itemId) ?? reject('Unknown intel item');
    const ch = ctx.ch[p.channel];
    if (!ch.messaging || !ch.members.includes(role)) reject(`${role} is not on ${p.channel}`);
    const to = p.to.filter((r) => r !== role && ch.members.includes(r) && s.enabledRoles.includes(r));
    if (to.length === 0) reject('No valid recipients on that net');
    const callsign = ctx.roleSpec[role]!.callsign;
    const meta = s.reportMeta[item.id];
    const outcomes = transmit(ctx, {
      channel: p.channel,
      from: role,
      fromRole: role,
      to,
      playerTraffic: true,
      build: () => ({
        kind: 'INTEL',
        item: { ...item, id: nextId(s, 'I'), channel: p.channel, forwardedBy: callsign, deliveredAtMs: 0 },
      }),
      meta: () => (meta ? { ...meta } : null),
    });
    void outcomes;
    const st = (s.stats.roles[role] ??= { sent: 0, delivered: 0, dropped: 0, corrupted: 0, forwarded: 0, received: 0, latencySumMs: 0, latencyN: 0 });
    st.forwarded++;
    rs.sent.push({ id: nextId(s, 'M'), channel: p.channel, to, text: `FWD ${item.text}`.slice(0, 200), sentAtMs: s.tMs, kind: 'FORWARD' });
    journal(s, 'MSG_SENT', `${role} forwarded ${item.id} → ${to.join(',')} on ${p.channel}`, role, item.id);
  }

  private switchChannel(role: RoleId, channel: ChannelId): void {
    const ctx = this.ctx;
    const s = ctx.s;
    this.requireLive();
    const ch = ctx.ch[channel];
    if (!ch.messaging || !ch.members.includes(role)) reject(`${role} is not on ${channel}`);
    const rs = s.roles[role]!;
    if (rs.activeChannel === channel) return;
    rs.paceSwitches.push({ tMs: s.tMs, from: rs.activeChannel, to: channel });
    journal(s, 'PACE', `${role} switched ${rs.activeChannel} → ${channel}`, role);
    rs.activeChannel = channel;
    rs.lastActiveLevel = roleChannelStatus(ctx, role, channel).level;
  }

  private updateIntent(text: string): void {
    const ctx = this.ctx;
    const s = ctx.s;
    const callsign = ctx.roleSpec.CDR!.callsign;
    s.intent = { version: s.intent.version + 1, text, byCallsign: callsign, atMs: s.tMs };
    const cdr = s.roles.CDR!;
    cdr.intent = { version: s.intent.version, text, receivedAtMs: s.tMs, byCallsign: callsign };
    const id = nextId(s, 'M');
    const recipients = s.enabledRoles.filter((r) => r !== 'CDR');
    const byChannel = new Map<ChannelId, RoleId[]>();
    for (const r of recipients) {
      const c = routeChannel(ctx, 'CDR', r, cdr.activeChannel);
      byChannel.set(c, [...(byChannel.get(c) ?? []), r]);
    }
    for (const [channel, to] of [...byChannel.entries()].sort()) {
      transmit(ctx, {
        channel,
        from: 'CDR',
        fromRole: 'CDR',
        to,
        playerTraffic: true,
        build: () => ({
          kind: 'MESSAGE',
          item: { id, kind: 'INTENT', fromRole: 'CDR', fromCallsign: callsign, channel, text, sentAtMs: s.tMs, deliveredAtMs: 0, corrupted: false },
          intent: { version: s.intent.version, text },
        }),
      });
    }
    cdr.sent.push({ id, channel: cdr.activeChannel, to: recipients, text, sentAtMs: s.tMs, kind: 'INTENT' });
    journal(s, 'INTENT', `CDR issued intent v${s.intent.version}`, 'CDR', id);
  }

  private decide(role: RoleId, d: DecisionPayload): void {
    const ctx = this.ctx;
    const s = ctx.s;
    this.requireLive();
    const rs = s.roles[role]!;
    if (!rs.joined) reject('Join the exercise first');
    if (d.action === 'SWITCH_CHANNEL') {
      const ch = ctx.ch[d.channel!];
      if (!ch.messaging || !ch.members.includes(role)) reject(`${role} is not on ${d.channel}`);
    }
    const unit = roleUnit(ctx, role);
    const id = nextId(s, 'D');
    const basedOn = d.basedOn.filter((x) => rs.intel.some((i) => i.id === x));
    const knowable = knowableSnapshot(ctx, role, basedOn);
    const truth = truthSnapshot(ctx, role, d.targetCell ?? null);
    const relayProbe = d.action === 'RELAY' ? () => this.relayProbe(role, d.targetCell!) : undefined;
    const adjudication = adjudicate(ctx, role, d, relayProbe);
    const record: DecisionRecord = {
      id,
      role,
      callsign: ctx.roleSpec[role]!.callsign,
      tMs: s.tMs,
      action: d.action,
      targetCell: d.targetCell ?? null,
      channel: d.channel ?? null,
      confidence: d.confidence,
      rationale: d.rationale,
      basedOn,
      intentSelf: d.intentSelf,
      cutOff: rs.cutOff,
      knowable,
      truth,
      adjudication,
      intentScore: intentScore(ctx, role, d),
      effects: [],
    };
    s.decisions.push(record);
    journal(s, 'DECISION', `${role} ${d.action}${d.targetCell ? ` ${d.targetCell}` : ''}${d.channel ? ` ${d.channel}` : ''} (${d.confidence}%) → ${adjudication.soundness}`, role, id);

    const effect = (t: string) => record.effects.push(t);
    switch (d.action) {
      case 'ADVANCE':
      case 'REPOSITION':
      case 'WITHDRAW': {
        if (unit.status !== 'ACTIVE') {
          effect('Unit not combat-effective — no movement');
          break;
        }
        const drift = gpsDrift(rs, s.tMs);
        const c = cellCentre(d.targetCell!);
        const truePos = clampToGrid({ x: c.x - drift.x, y: c.y - drift.y });
        const arrive = moveUnit(unit, truePos, s.tMs);
        unit.orderedCell = d.targetCell!;
        const actualCell = vecToCell(truePos);
        unit.engage = d.action === 'WITHDRAW' ? null : { decisionId: id, atMs: arrive, cell: actualCell, pos: truePos };
        effect(`Moving to ${actualCell}${actualCell !== d.targetCell ? ` (GPS error: intended ${d.targetCell})` : ''}, ETA ${formatT(arrive)}`);
        break;
      }
      case 'HOLD':
        stopUnit(unit, s.tMs);
        unit.engage = null;
        unit.orderedCell = null;
        effect('Holding position');
        break;
      case 'REQUEST_RECON': {
        const sensor = ctx.sc.sensors.find((x) => x.ownerRole === role && (x.kind === 'UAV' || x.kind === 'COASTAL_RADAR'));
        if (sensor) {
          const st = s.sensors.find((x) => x.id === sensor.id)!;
          st.pos = cellCentre(d.targetCell!);
          st.taskedBy = role;
          st.nextSweepMs = s.tMs + 20_000;
          effect(`${sensor.label} retasked to ${d.targetCell}`);
        } else {
          s.scheduled.push({ id: nextId(s, 'S'), atMs: s.tMs + RECON_DELAY_MS, kind: 'RECON_REPORT', role, cell: d.targetCell!, decisionId: id, label: 'RECON PATROL' });
          effect(`Recon patrol to ${d.targetCell}, report due in ${RECON_DELAY_MS / 1000}s`);
        }
        break;
      }
      case 'CALL_AIR': {
        if (role === 'ALO' && s.air.onStationAtMs === null) {
          s.air.onStationAtMs = Math.max(ctx.sc.air.availableFromS * 1000, s.tMs + ctx.sc.air.responseS * 1000);
          s.air.requestedBy = 'ALO';
          journal(s, 'AIR', `ALO requested air — on station ${formatT(s.air.onStationAtMs)}`, role);
          effect(`Air requested; on station at ${formatT(s.air.onStationAtMs)}`);
        }
        const canStrike = airOnStation(ctx) || (role === 'ALO' && s.air.onStationAtMs !== null);
        if (canStrike && s.air.sortiesLeft > 0) {
          const at = Math.max(s.air.onStationAtMs ?? s.tMs, s.tMs) + STRIKE_DELAY_MS;
          s.scheduled.push({ id: nextId(s, 'S'), atMs: at, kind: 'STRIKE', role, cell: d.targetCell!, decisionId: id, label: 'AIR STRIKE' });
          effect(`Strike on ${d.targetCell} scheduled ${formatT(at)}`);
        } else {
          effect('No air cover — no strike');
        }
        break;
      }
      case 'RELAY':
        this.applyRelay(role, d.targetCell!, false);
        effect(role === 'EW' ? `Rebro relocating to ${d.targetCell} (live in ${RELAY_SETUP_MS / 1000}s)` : `${record.callsign} acting as relay`);
        break;
      case 'SWITCH_CHANNEL':
        this.switchChannel(role, d.channel!);
        effect(`Active channel → ${d.channel}`);
        break;
    }
  }

  private applyRelay(role: RoleId, cell: string, immediate: boolean): void {
    const s = this.ctx.s;
    if (role === 'EW') {
      const pos = cellCentre(cell);
      const activeFromMs = immediate ? s.tMs : s.tMs + RELAY_SETUP_MS;
      if (s.relays.length === 0) s.relays.push({ id: 'RELAY-EW', label: 'EW rebro', pos, activeFromMs });
      else s.relays[0] = { ...s.relays[0]!, pos, activeFromMs };
      journal(s, 'RELAY', `EW rebro relocating to ${cell}`, role);
    } else {
      s.roles[role]!.actingRelay = true;
      journal(s, 'RELAY', `${role} acting as relay`, role);
    }
  }

  /** Evaluate R7 by applying the relay hypothetically and restoring state. */
  private relayProbe(role: RoleId, cell: string): { before: number; after: number } {
    const s = this.ctx.s;
    const before = commsDeficit(this.ctx);
    const savedRelays = s.relays.map((r) => ({ ...r }));
    const savedActing = s.roles[role]!.actingRelay;
    const savedJournal = s.journal.length;
    this.applyRelay(role, cell, true);
    const after = commsDeficit(this.ctx);
    s.relays = savedRelays;
    s.roles[role]!.actingRelay = savedActing;
    s.journal.length = savedJournal;
    return { before, after };
  }

  // ------------------------------------------------------------------ step
  /** Advance the sim clock by exactly one fixed step (1000 ms). Call only while RUNNING. */
  step(): void {
    const ctx = this.ctx;
    const s = ctx.s;
    if (s.phase !== 'RUNNING') throw new Error(`step() while ${s.phase}`);
    s.tMs += STEP_MS;
    const t = s.tMs;

    for (const m of s.msel) if (m.status === 'PENDING' && m.atS * 1000 <= t) this.fireMsel(m, false);
    for (const r of ctx.sc.scriptedReports) if (r.atS * 1000 === t) sendScripted(ctx, r);

    for (const i of s.injects) {
      if (!i.expired && t >= i.endMs) {
        i.expired = true;
        journal(s, 'INJECT_END', `Inject ${i.id} (${i.spec.type}) ended`, null, i.id);
      }
    }
    for (const c of s.cyber) {
      if (!c.expired && t >= c.endMs) {
        c.expired = true;
        if (c.spec.kind === 'GPS_SPOOF') s.roles[c.spec.role!]!.gps = null;
        journal(s, 'CYBER_END', `Cyber ${c.spec.kind} ended`, c.spec.role ?? null, c.id);
      }
    }

    for (const f of ctx.sc.features) {
      if (f.destroyAtS === undefined || f.destroyAtS * 1000 !== t) continue;
      const fs = s.features.find((x) => x.id === f.id)!;
      const held = s.units.some((u) => u.side === 'BLUE' && u.status === 'ACTIVE' && f.unlessBlueIn.includes(vecToCell(unitPos(u, t))));
      if (fs.intact && !held) {
        fs.intact = false;
        journal(s, 'FEATURE', `${fs.label} at ${fs.cell} destroyed by hostile engineers`, null, fs.id);
      } else if (held) {
        journal(s, 'FEATURE', `${fs.label} secured — demolition prevented`, null, fs.id);
      }
    }

    const due = s.scheduled.filter((a) => a.atMs <= t).sort((a, b) => a.atMs - b.atMs || (a.id < b.id ? -1 : 1));
    s.scheduled = s.scheduled.filter((a) => a.atMs > t);
    for (const a of due) {
      if (a.kind === 'RECON_REPORT') reconReport(ctx, a.role, a.cell, a.label);
      else {
        const text = resolveStrike(ctx, a.cell, a.role);
        s.decisions.find((d) => d.id === a.decisionId)?.effects.push(text);
      }
    }

    for (const u of s.units) {
      if (u.engage && t >= u.engage.atMs) {
        const eng = u.engage;
        u.engage = null;
        if (u.status !== 'ACTIVE') continue;
        const text = resolveEngagement(ctx, u, eng.cell);
        s.decisions.find((d) => d.id === eng.decisionId)?.effects.push(text);
      }
    }

    reactOpfor(ctx);
    generateSpoofs(ctx);

    for (const st of s.sensors) {
      if (t >= st.nextSweepMs) {
        sensorSweep(ctx, st.id);
        st.nextSweepMs = t + ctx.sensorSpec[st.id]!.intervalS * 1000;
      }
    }
    for (const role of s.enabledRoles) {
      const rs = s.roles[role]!;
      if (t >= rs.nextOwnObsMs) {
        ownObservation(ctx, role);
        rs.nextOwnObsMs = t + OWN_OBS_INTERVAL_MS;
      }
      if (t >= rs.nextPosrepMs) {
        sendPosrep(ctx, role);
        rs.nextPosrepMs = t + POSREP_INTERVAL_MS;
      }
    }

    deliverDue(ctx);
    this.evaluateLinks();
  }

  /** Journal link degradation on the active channel and cut-off transitions. */
  private evaluateLinks(): void {
    const ctx = this.ctx;
    const s = ctx.s;
    for (const role of s.enabledRoles) {
      const rs = s.roles[role]!;
      const lvl = roleChannelStatus(ctx, role, rs.activeChannel).level;
      if (lvl > rs.lastActiveLevel) {
        journal(s, 'LINK_CHANGE', `${role} ${rs.activeChannel} ${lvl === 2 ? 'DENIED' : 'DEGRADED'}`, role);
        s.triggers.push({ tMs: s.tMs, role, label: `${rs.activeChannel} ${lvl === 2 ? 'denied' : 'degraded'}` });
      } else if (lvl < rs.lastActiveLevel) {
        journal(s, 'LINK_CHANGE', `${role} ${rs.activeChannel} ${lvl === 0 ? 'CLEAR' : 'DEGRADED'}`, role);
      }
      rs.lastActiveLevel = lvl;
      const cut = isCutOff(ctx, role);
      if (cut && !rs.cutOff) {
        rs.cutOff = true;
        rs.cutOffSinceMs = s.tMs;
        rs.cutOffSpans.push({ startMs: s.tMs, endMs: null });
        journal(s, 'CUTOFF_START', `${role} CUT OFF from ${ctx.roleSpec[role]!.superior}`, role);
        s.triggers.push({ tMs: s.tMs, role, label: 'Cut off' });
      } else if (!cut && rs.cutOff) {
        rs.cutOff = false;
        rs.cutOffSinceMs = null;
        const span = rs.cutOffSpans.at(-1);
        if (span) span.endMs = s.tMs;
        journal(s, 'CUTOFF_END', `${role} back in contact`, role);
      }
    }
  }
}


