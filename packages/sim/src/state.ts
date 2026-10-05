import {
  DEFAULT_CHANNELS,
  cellCentre,
  type ChannelDef,
  type ChannelId,
  type Cell,
  type CyberSpec,
  type DecisionRecord,
  type InjectSpec,
  type IntelItem,
  type IntentView,
  type JammerSpec,
  type MessageItem,
  type MselAction,
  type Phase,
  type ProbeQuestionTruth,
  type RoleId,
  type RoleSpec,
  type Scenario,
  type SensorSpec,
  type SentMessageView,
  type Side,
  type Speed,
  type UnitType,
  type Vec,
  CHANNEL_IDS,
  DEFAULT_SETTINGS,
  type SessionSettings,
} from '@vanguard/shared';
import { seedRng } from './rng';

export interface Keyframe {
  tMs: number;
  x: number;
  y: number;
}

export interface UnitState {
  id: string;
  side: Side;
  callsign: string;
  type: UnitType;
  count: number;
  strength: number;
  maxStrength: number;
  ownerRole: RoleId | null;
  decoy: boolean;
  speed: number;
  visualRange: number;
  track: Keyframe[];
  status: 'ACTIVE' | 'DESTROYED' | 'WITHDRAWN';
  /** Cell the owning trainee ordered the unit to (perceived intent; truth may differ under GPS spoof). */
  orderedCell: Cell | null;
  engage: { decisionId: string; atMs: number; cell: Cell; pos: Vec } | null;
  /** OPFOR behaviour (scenario-defined) and reaction bookkeeping — truth only. */
  behaviour: 'scripted' | 'reserve' | 'defend' | 'shoot-and-scoot' | 'probe';
  committed: boolean;
  lastSpottedMs: number;
  lastMovedMs: number;
  nextReactMs: number;
  /** Counter-attack in progress (resolved on arrival). */
  assault: { atMs: number; cell: Cell } | null;
}

export interface JammerState extends JammerSpec {
  pos: Vec;
  /** Deterministic error applied to the EW officer's DF estimate. */
  dfOffset: { dx: number; dy: number };
  placedAtMs: number;
}

export interface RelayState {
  id: string;
  label: string;
  pos: Vec;
  activeFromMs: number;
}

export interface ActiveInject {
  id: string;
  spec: InjectSpec;
  startMs: number;
  endMs: number;
  source: 'DS' | 'MSEL';
  mselId: string | null;
  lastSpoofMs: number;
  expired: boolean;
}

export interface ActiveCyber {
  id: string;
  spec: CyberSpec;
  startMs: number;
  endMs: number;
  drift: Vec | null;
  lastSpoofMs: number;
  source: 'DS' | 'MSEL';
  expired: boolean;
}

export interface MselState {
  id: string;
  atS: number;
  title: string;
  action: MselAction;
  status: 'PENDING' | 'FIRED' | 'SKIPPED';
  firedAtMs: number | null;
}

export interface SensorState {
  id: string;
  pos: Vec;
  taskedBy: RoleId | null;
  nextSweepMs: number;
  sweepCount: number;
  lastSig: Record<string, string>;
}

export type DeliveryPayload =
  | { kind: 'INTEL'; item: IntelItem }
  | { kind: 'MESSAGE'; item: MessageItem; intent: { version: number; text: string } | null };

export interface PendingDelivery {
  id: string;
  seq: number;
  deliverAtMs: number;
  to: RoleId;
  from: string;
  channel: ChannelId;
  sentAtMs: number;
  playerTraffic: boolean;
  payload: DeliveryPayload;
}

export interface ReportMeta {
  truthUnitIds: string[];
  spoofed: boolean;
  decoyOnly: boolean;
  twin: boolean;
  stale: boolean;
}

export interface RoleState {
  id: RoleId;
  enabled: boolean;
  joined: boolean;
  /** Personal callsign typed by the trainee (e.g. "VIPER"). */
  playerCallsign: string | null;
  unitId: string;
  activeChannel: ChannelId;
  intel: IntelItem[];
  messages: MessageItem[];
  sent: SentMessageView[];
  intent: IntentView;
  flags: { atMs: number; itemIds: string[] }[];
  verifications: { atMs: number; itemId: string; cell: Cell | null }[];
  cutOff: boolean;
  cutOffSinceMs: number | null;
  cutOffSpans: { startMs: number; endMs: number | null }[];
  lastActiveLevel: number;
  ownObsSig: Record<string, string>;
  nextOwnObsMs: number;
  nextPosrepMs: number;
  actingRelay: boolean;
  gps: { dx: number; dy: number; startMs: number; endMs: number } | null;
  paceSwitches: { tMs: number; from: ChannelId; to: ChannelId }[];
}

export interface ProbeState {
  id: string;
  index: number;
  startedAtMs: number;
  endedAtMs: number | null;
  phaseBefore: 'RUNNING' | 'PAUSED';
  questions: Partial<Record<RoleId, ProbeQuestionTruth[]>>;
  answers: Partial<Record<RoleId, Record<string, string>>>;
  scores: Partial<Record<RoleId, Record<string, number>>>;
}

export interface ScheduledAction {
  id: string;
  atMs: number;
  kind: 'RECON_REPORT' | 'STRIKE';
  role: RoleId;
  cell: Cell;
  decisionId: string | null;
  label: string;
}

export type JournalKind =
  | 'PHASE'
  | 'JOIN'
  | 'INJECT'
  | 'INJECT_END'
  | 'CYBER'
  | 'CYBER_END'
  | 'JAMMER'
  | 'MSEL'
  | 'REPORT'
  | 'MSG_SENT'
  | 'MSG_DELIVERED'
  | 'MSG_DROPPED'
  | 'LINK_CHANGE'
  | 'CUTOFF_START'
  | 'CUTOFF_END'
  | 'PACE'
  | 'FREQ_HOP'
  | 'RELAY'
  | 'DECISION'
  | 'ENGAGEMENT'
  | 'STRIKE'
  | 'AIR'
  | 'FEATURE'
  | 'PROBE'
  | 'INTENT'
  | 'FLAG'
  | 'VERIFY'
  | 'OPFOR';

export interface JournalEntry {
  tMs: number;
  kind: JournalKind;
  role: RoleId | null;
  text: string;
  ref: string | null;
}

export interface TrafficCounters {
  sent: number;
  delivered: number;
  dropped: number;
  corrupted: number;
}

export interface SimState {
  scenarioId: string;
  seed: number;
  rng: number;
  tMs: number;
  phase: Phase;
  speed: Speed;
  enabledRoles: RoleId[];
  units: UnitState[];
  features: { id: string; label: string; kind: string; cell: Cell; intact: boolean }[];
  jammers: JammerState[];
  relays: RelayState[];
  injects: ActiveInject[];
  cyber: ActiveCyber[];
  freqHops: Partial<Record<ChannelId, { untilMs: number; cooldownUntilMs: number }>>;
  msel: MselState[];
  sensors: SensorState[];
  air: { onStationAtMs: number | null; sortiesLeft: number; requestedBy: RoleId | null };
  pending: PendingDelivery[];
  reportMeta: Record<string, ReportMeta>;
  roles: Partial<Record<RoleId, RoleState>>;
  intent: { version: number; text: string; byCallsign: string; atMs: number };
  decisions: DecisionRecord[];
  probes: ProbeState[];
  scheduled: ScheduledAction[];
  journal: JournalEntry[];
  triggers: { tMs: number; role: RoleId; label: string }[];
  stats: {
    channels: Partial<Record<ChannelId, TrafficCounters>>;
    edges: Record<string, TrafficCounters>;
    roles: Partial<
      Record<
        RoleId,
        TrafficCounters & { forwarded: number; received: number; latencySumMs: number; latencyN: number }
      >
    >;
  };
  counters: Record<string, number>;
  lastSeq: number;
}

/** Immutable world context passed to every sim function. */
export interface Ctx {
  sc: Scenario;
  settings: SessionSettings;
  ch: Record<ChannelId, ChannelDef>;
  roleSpec: Partial<Record<RoleId, RoleSpec>>;
  sensorSpec: Record<string, SensorSpec>;
  s: SimState;
}

export const DEFAULT_SPEED: Partial<Record<UnitType, number>> = {
  ARMOUR: 1.0,
  MECH: 1.0,
  RECCE: 1.2,
  INFANTRY: 0.5,
  HQ: 0.6,
  EW_DET: 0.6,
  TACP: 0.6,
  ENGINEER: 0.5,
  CONVOY: 0.8,
  SHIP: 0.6,
};

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Channel table = defaults → scenario overrides → session difficulty settings. */
export function resolveChannels(sc: Scenario, settings: SessionSettings = DEFAULT_SETTINGS): Record<ChannelId, ChannelDef> {
  const out = {} as Record<ChannelId, ChannelDef>;
  for (const id of CHANNEL_IDS) {
    const base = DEFAULT_CHANNELS[id];
    const o = sc.channels[id] ?? {};
    const ch: ChannelDef = { ...base, ...o, members: o.members ?? [...base.members] };
    if (id !== 'RUNNER') {
      if (!ch.messaging) {
        if (settings.sensorReliability === 'high') Object.assign(ch, { baseDrop: r4(ch.baseDrop * 0.5), baseCorrupt: r4(ch.baseCorrupt * 0.5) });
        if (settings.sensorReliability === 'low') Object.assign(ch, { baseDrop: r4(ch.baseDrop + 0.1), baseCorrupt: r4(ch.baseCorrupt + 0.08) });
      } else {
        if (settings.commsQuality === 'good') Object.assign(ch, { baseLatencyS: r4(ch.baseLatencyS * 0.7), baseDrop: r4(ch.baseDrop * 0.5) });
        if (settings.commsQuality === 'poor') Object.assign(ch, { baseLatencyS: r4(ch.baseLatencyS * 1.5), baseDrop: r4(ch.baseDrop + 0.06), baseCorrupt: r4(ch.baseCorrupt + 0.04) });
      }
    }
    out[id] = ch;
  }
  return out;
}

/** Jammer effective-radius multiplier for the session's EW intensity. */
export const EW_MULT: Record<SessionSettings['ewIntensity'], number> = { low: 0.75, normal: 1, high: 1.3 };

export function makeCtx(sc: Scenario, s: SimState, settings: SessionSettings = DEFAULT_SETTINGS): Ctx {
  const roleSpec: Partial<Record<RoleId, RoleSpec>> = {};
  for (const r of sc.roles) roleSpec[r.id] = r;
  const sensorSpec: Record<string, SensorSpec> = {};
  for (const x of sc.sensors) sensorSpec[x.id] = x;
  return { sc, settings, ch: resolveChannels(sc, settings), roleSpec, sensorSpec, s };
}

function waypointTrack(waypoints: { atS: number; cell: Cell }[]): Keyframe[] {
  return [...waypoints]
    .sort((a, b) => a.atS - b.atS)
    .map((w) => ({ tMs: w.atS * 1000, ...cellCentre(w.cell) }));
}

export function createInitialState(
  sc: Scenario,
  seed: number,
  enabledRoles?: RoleId[],
  settings: SessionSettings = DEFAULT_SETTINGS,
): SimState {
  const roleIds = sc.roles.map((r) => r.id);
  const enabled = (enabledRoles ?? sc.roles.filter((r) => !r.optional).map((r) => r.id))
    .filter((r) => roleIds.includes(r))
    .sort();
  if (!enabled.includes('CDR')) throw new Error('CDR must be enabled');
  if (enabled.length < 2) throw new Error('At least two roles must be enabled');

  const units: UnitState[] = sc.units
    .map((u) => ({
      id: u.id,
      side: u.side,
      callsign: u.callsign,
      type: u.type,
      count: u.count,
      strength: u.strength,
      maxStrength: Math.max(u.strength, 1),
      ownerRole: u.ownerRole ?? null,
      decoy: u.decoy,
      speed: u.speed ?? DEFAULT_SPEED[u.type] ?? 0.6,
      visualRange: u.visualRangeCells ?? (u.type === 'RECCE' ? 2 : 1),
      track: waypointTrack(u.waypoints),
      status: 'ACTIVE' as const,
      orderedCell: null,
      engage: null,
      behaviour: u.behaviour,
      committed: false,
      lastSpottedMs: -1,
      lastMovedMs: -1_000_000,
      nextReactMs: 30_000,
      assault: null,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const roles: Partial<Record<RoleId, RoleState>> = {};
  sc.roles.forEach((r, idx) => {
    roles[r.id] = {
      id: r.id,
      enabled: enabled.includes(r.id),
      joined: false,
      playerCallsign: null,
      unitId: r.unitId,
      activeChannel: r.pace[0],
      intel: [],
      messages: [],
      sent: [],
      intent: { version: 1, text: sc.intent.text, receivedAtMs: 0, byCallsign: 'HHQ' },
      flags: [],
      verifications: [],
      cutOff: false,
      cutOffSinceMs: null,
      cutOffSpans: [],
      lastActiveLevel: 0,
      ownObsSig: {},
      nextOwnObsMs: 10_000 + idx * 2_000,
      nextPosrepMs: 20_000 + idx * 5_000,
      actingRelay: false,
      gps: null,
      paceSwitches: [],
    };
  });

  return {
    scenarioId: sc.id,
    seed,
    rng: seedRng(seed),
    tMs: 0,
    phase: 'LOBBY',
    speed: 1,
    enabledRoles: enabled,
    units,
    features: sc.features.map((f) => ({
      id: f.id,
      label: f.label,
      kind: f.kind,
      cell: f.cell,
      intact: true,
    })),
    jammers: [],
    relays: sc.nodes
      .filter((n) => n.relay)
      .map((n) => ({
        id: n.id,
        label: n.label,
        pos: n.pos ?? cellCentre(n.cell!),
        activeFromMs: 0,
      })),
    injects: [],
    cyber: [],
    freqHops: {},
    msel: sc.msel
      .map((m) => ({
        id: m.id,
        atS: m.atS,
        title: m.title,
        action: m.action,
        status: (settings.disabledMsel.includes(m.id) ? 'SKIPPED' : 'PENDING') as 'PENDING' | 'SKIPPED',
        firedAtMs: null,
      }))
      .sort((a, b) => a.atS - b.atS || (a.id < b.id ? -1 : 1)),
    sensors: [...sc.sensors]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((x, i) => ({
        id: x.id,
        pos: cellCentre(x.cell),
        taskedBy: null,
        nextSweepMs: Math.max(x.activeFromS * 1000, 5_000 + i * 3_000),
        sweepCount: 0,
        lastSig: {},
      })),
    air: { onStationAtMs: null, sortiesLeft: sc.air.sorties, requestedBy: null },
    pending: [],
    reportMeta: {},
    roles,
    intent: { version: 1, text: sc.intent.text, byCallsign: 'HHQ', atMs: 0 },
    decisions: [],
    probes: [],
    scheduled: [],
    journal: [],
    triggers: [],
    stats: { channels: {}, edges: {}, roles: {} },
    counters: {},
    lastSeq: 0,
  };
}

/** Sequential id with a prefix — deterministic, opaque, never derived from truth ids. */
export function nextId(s: SimState, prefix: string): string {
  const n = (s.counters[prefix] ?? 0) + 1;
  s.counters[prefix] = n;
  return `${prefix}${n}`;
}

export function journal(
  s: SimState,
  kind: JournalKind,
  text: string,
  role: RoleId | null = null,
  ref: string | null = null,
): void {
  s.journal.push({ tMs: s.tMs, kind, role, text, ref });
}

export function roleState(s: SimState, role: RoleId): RoleState {
  const r = s.roles[role];
  if (!r) throw new SimRejection(`Unknown role ${role}`);
  return r;
}

export function unitById(s: SimState, id: string): UnitState | undefined {
  return s.units.find((u) => u.id === id);
}

/** Thrown when an input event is invalid for the current state. State is left untouched. */
export class SimRejection extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimRejection';
  }
}
