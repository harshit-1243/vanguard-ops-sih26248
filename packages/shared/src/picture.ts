/**
 * PerceivedPicture — the ONLY payload a trainee socket ever receives.
 * Every field here must be something the role could legitimately know.
 * Do not add ground-truth fields (decoy flags, true strengths, real unit ids, MSEL…).
 */
import type {
  Action,
  ChannelId,
  Confidence,
  IntelKind,
  IntentSelf,
  LinkLevelName,
  Phase,
  ProbeKind,
  RoleId,
  Side,
  Speed,
  UnitType,
} from './domain';
import type { Cell, Vec } from './grid';

export interface IntelItem {
  id: string;
  kind: IntelKind;
  sourceLabel: string;
  channel: ChannelId | 'OWN';
  observedAtMs: number;
  deliveredAtMs: number;
  cell: Cell | null;
  cellUncertain: boolean;
  side: Side | null;
  unitType: UnitType | null;
  count: number | null;
  confidence: Confidence;
  text: string;
  corrupted: boolean;
  forwardedBy: string | null;
  /** For POSREPs: the friendly role the report is about. */
  subjectRole: RoleId | null;
}

export interface MessageItem {
  id: string;
  kind: 'MESSAGE' | 'INTENT';
  fromRole: RoleId | 'HHQ';
  fromCallsign: string;
  channel: ChannelId;
  text: string;
  sentAtMs: number;
  deliveredAtMs: number;
  corrupted: boolean;
}

export interface SentMessageView {
  id: string;
  channel: ChannelId;
  to: RoleId[];
  text: string;
  sentAtMs: number;
  kind: 'MESSAGE' | 'INTENT' | 'FORWARD';
}

export interface ConflictView {
  id: string;
  itemIds: [string, string];
  cell: Cell;
  reason: string;
  flagged: boolean;
}

export type LinkHint = 'OK' | 'JAMMING' | 'NO_SIGNAL';

export interface LinkPeerView {
  peer: RoleId | 'HHQ';
  peerLabel: string;
  level: LinkLevelName;
  hint: LinkHint;
}

export interface ChannelView {
  channel: ChannelId;
  label: string;
  paceSlot: 'P' | 'A' | 'C' | 'E' | null;
  /** Link to the role's superior if the superior is on this net, else best peer. */
  level: LinkLevelName;
  hint: LinkHint;
  peers: LinkPeerView[];
  isActive: boolean;
  messaging: boolean;
  hopActiveUntilMs: number | null;
  hopCooldownUntilMs: number | null;
}

export interface OwnUnitView {
  callsign: string;
  type: UnitType;
  /** Perceived position (GPS-derived; may be spoofed). */
  pos: Vec;
  cell: Cell;
  strengthPct: number;
  status: 'ACTIVE' | 'DESTROYED' | 'WITHDRAWN';
  moving: boolean;
  destination: Cell | null;
  actingRelay: boolean;
}

export interface FriendlyView {
  role: RoleId;
  callsign: string;
  cell: Cell | null;
  pos: Vec | null;
  observedAtMs: number;
  sourceLabel: string;
}

export interface ContactView {
  itemId: string;
  kind: 'CONTACT' | 'NEGATIVE' | 'RECON';
  cell: Cell;
  cellUncertain: boolean;
  unitType: UnitType | null;
  count: number | null;
  observedAtMs: number;
  confidence: Confidence;
  sourceLabel: string;
  inConflict: boolean;
}

export interface IntentView {
  version: number;
  text: string;
  receivedAtMs: number;
  byCallsign: string;
}

export interface OwnDecisionView {
  id: string;
  tMs: number;
  action: Action;
  targetCell: Cell | null;
  channel: ChannelId | null;
  confidence: number;
  rationale: string;
  intentSelf: IntentSelf;
  cutOff: boolean;
}

export interface ProbeQuestionView {
  id: string;
  kind: ProbeKind;
  text: string;
  input: 'number' | 'cell' | 'choice';
  options: string[];
}

export interface ProbeView {
  id: string;
  startedAtMs: number;
  questions: ProbeQuestionView[];
  submitted: boolean;
}

export interface SpectrumDetection {
  /** Opaque emitter label (never the real jammer id). */
  label: string;
  bands: string[];
  approxCell: Cell;
  signal: 'LOW' | 'MED' | 'HIGH';
}

export interface AirStatusView {
  requested: boolean;
  onStationAtMs: number | null;
  sortiesLeft: number;
  isrTasking: { label: string; cell: Cell }[];
}

export interface RosterEntry {
  role: RoleId;
  title: string;
  callsign: string;
  joined: boolean;
}

export interface PerceivedPicture {
  kind: 'perceived';
  sessionCode: string;
  scenarioTitle: string;
  role: RoleId;
  roleTitle: string;
  callsign: string;
  phase: Phase;
  tMs: number;
  speed: Speed;
  terrain: string[];
  features: { id: string; label: string; kind: string; cell: Cell }[];
  objectives: { id: string; text: string; cell: Cell }[];
  superior: { id: RoleId | 'HHQ'; label: string };
  ownUnit: OwnUnitView;
  friendlies: FriendlyView[];
  contacts: ContactView[];
  conflicts: ConflictView[];
  intel: IntelItem[];
  messages: MessageItem[];
  sent: SentMessageView[];
  channels: ChannelView[];
  activeChannel: ChannelId;
  netMembers: Partial<Record<ChannelId, RoleId[]>>;
  cutOff: boolean;
  cutOffSinceMs: number | null;
  intent: IntentView;
  flaggedItemIds: string[];
  verificationItemIds: string[];
  decisions: OwnDecisionView[];
  probe: ProbeView | null;
  spectrum: SpectrumDetection[] | null;
  air: AirStatusView | null;
  roster: RosterEntry[];
}
