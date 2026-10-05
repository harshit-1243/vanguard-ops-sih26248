/** Truth-side DTOs. Sent ONLY to the DS room and AAR consumers — never to trainee sockets. */
import type {
  Action,
  Band,
  ChannelId,
  CyberKind,
  InjectType,
  IntentSelf,
  LinkLevelName,
  Phase,
  ProbeKind,
  RoleId,
  Side,
  Soundness,
  Speed,
  UnitType,
} from './domain';
import type { Cell, Vec } from './grid';
import type { ConflictView, FriendlyView, IntelItem, LinkHint } from './picture';

export interface KnowableSnapshot {
  ownCell: Cell;
  activeChannel: ChannelId;
  cutOff: boolean;
  intentVersion: number;
  intentText: string;
  intel: (IntelItem & { ageMs: number })[];
  openConflicts: ConflictView[];
  outages: { channel: ChannelId; level: LinkLevelName; hint: LinkHint }[];
  friendlies: (FriendlyView & { ageMs: number })[];
}

export interface TruthUnitBrief {
  callsign: string;
  type: UnitType;
  count: number;
  strength: number;
  decoy: boolean;
  cell: Cell;
}

export interface TruthSnapshot {
  ownCell: Cell;
  ownStrength: number;
  targetCell: Cell | null;
  hostilesInTarget: TruthUnitBrief[];
  hostilesAdjacent: TruthUnitBrief[];
  friendliesInTarget: string[];
  rho: number | null;
  airOnStation: boolean;
  features: { id: string; label: string; intact: boolean }[];
}

export interface Adjudication {
  soundness: Soundness;
  rule: string;
  reason: string;
  /** Outcome value for calibration: SOUND 1, RISKY 0.5, UNSOUND 0. */
  outcome: number;
}

export interface DecisionRecord {
  id: string;
  role: RoleId;
  callsign: string;
  tMs: number;
  action: Action;
  targetCell: Cell | null;
  channel: ChannelId | null;
  confidence: number;
  rationale: string;
  basedOn: string[];
  intentSelf: IntentSelf;
  cutOff: boolean;
  knowable: KnowableSnapshot;
  truth: TruthSnapshot;
  adjudication: Adjudication;
  intentScore: number;
  effects: string[];
}

export interface TruthUnitView {
  id: string;
  side: Side;
  callsign: string;
  type: UnitType;
  count: number;
  strength: number;
  strengthPct: number;
  decoy: boolean;
  pos: Vec;
  cell: Cell;
  status: 'ACTIVE' | 'DESTROYED' | 'WITHDRAWN';
  ownerRole: RoleId | null;
  behaviour: string;
  destination: Cell | null;
}

export interface TruthJammerView {
  id: string;
  label: string;
  cell: Cell;
  radius: number;
  effectiveRadius: number;
  bands: Band[];
  power: number;
  active: boolean;
}

export interface TruthLinkView {
  channel: ChannelId;
  a: RoleId;
  b: RoleId | 'HHQ';
  level: LinkLevelName;
  causes: string[];
  viaRelay: boolean;
}

export interface ActiveEffectView {
  id: string;
  kind: 'INJECT' | 'CYBER';
  type: InjectType | CyberKind;
  label: string;
  channels: ChannelId[];
  roles: RoleId[];
  startMs: number;
  endMs: number;
}

export interface MselView {
  id: string;
  atS: number;
  title: string;
  kind: string;
  summary: string;
  status: 'PENDING' | 'FIRED' | 'SKIPPED';
  firedAtMs: number | null;
}

export interface RoleStatusView {
  role: RoleId;
  title: string;
  callsign: string;
  enabled: boolean;
  joined: boolean;
  connected: boolean;
  cutOff: boolean;
  activeChannel: ChannelId;
  decisions: number;
  lastDecisionMs: number | null;
  perceivedCell: Cell;
  trueCell: Cell;
}

export interface ChannelStats {
  channel: ChannelId;
  sent: number;
  delivered: number;
  dropped: number;
  corrupted: number;
  clearLinks: number;
  degradedLinks: number;
  deniedLinks: number;
}

export interface ProbeQuestionTruth {
  id: string;
  kind: ProbeKind;
  text: string;
  input: 'number' | 'cell' | 'choice';
  options: string[];
  truth: string;
  common: boolean;
}

export interface ProbeRoleResult {
  role: RoleId;
  submitted: boolean;
  answers: Record<string, string>;
  scores: Record<string, number>;
  accuracy: number | null;
}

export interface ProbeStatusView {
  id: string;
  index: number;
  startedAtMs: number;
  endedAtMs: number | null;
  questions: Record<string, ProbeQuestionTruth[]>;
  results: ProbeRoleResult[];
  divergence: { roles: RoleId[]; matrix: (number | null)[][]; team: number | null };
}

export interface JournalView {
  tMs: number;
  kind: string;
  role: RoleId | null;
  text: string;
}

export interface InstructorState {
  kind: 'truth';
  sessionCode: string;
  scenarioId: string;
  scenarioTitle: string;
  phase: Phase;
  tMs: number;
  speed: Speed;
  durationMin: number;
  terrain: string[];
  features: { id: string; label: string; kind: string; cell: Cell; intact: boolean }[];
  objectives: { id: string; text: string; cell: Cell }[];
  intent: { version: number; text: string; byCallsign: string };
  units: TruthUnitView[];
  jammers: TruthJammerView[];
  relays: { id: string; label: string; cell: Cell; pos: Vec; active: boolean }[];
  links: TruthLinkView[];
  effects: ActiveEffectView[];
  msel: MselView[];
  decisions: DecisionRecord[];
  roles: RoleStatusView[];
  comms: ChannelStats[];
  probes: ProbeStatusView[];
  air: { onStationAtMs: number | null; sortiesLeft: number; requestedBy: RoleId | null };
  journal: JournalView[];
}

export type DecisionFeedItem = Pick<
  DecisionRecord,
  'id' | 'role' | 'callsign' | 'tMs' | 'action' | 'targetCell' | 'confidence' | 'rationale' | 'cutOff'
> & { soundness: Soundness };
