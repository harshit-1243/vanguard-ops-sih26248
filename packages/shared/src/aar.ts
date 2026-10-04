import type { RoleId, Soundness } from './domain';
import type { Cell } from './grid';
import type {
  ChannelStats,
  DecisionRecord,
  MselView,
  ProbeStatusView,
} from './instructor';

export interface LatencySample {
  trigger: string;
  tMs: number;
  latencyS: number | null;
}

export interface RoleMetrics {
  role: RoleId;
  title: string;
  callsign: string;
  joined: boolean;
  decisions: number;
  latency: {
    triggers: number;
    meanS: number | null;
    medianS: number | null;
    noResponse: number;
    samples: LatencySample[];
  };
  verification: {
    contested: number;
    verified: number;
    rate: number | null;
    flags: number;
    verifications: number;
  };
  calibration: {
    n: number;
    brier: number | null;
    meanConfidence: number | null;
    meanOutcome: number | null;
    overconfidence: number | null;
  };
  intent: {
    overall: number | null;
    cutOffN: number;
    cutOff: number | null;
    selfAwareness: number | null;
  };
  sa: { perProbe: { probeId: string; index: number; accuracy: number | null }[]; mean: number | null };
  comms: {
    sent: number;
    delivered: number;
    dropped: number;
    corrupted: number;
    forwarded: number;
    paceSwitches: number;
    received: number;
    meanLatencyS: number | null;
  };
  cutOffTotalS: number;
  paceResponseS: number | null;
}

export type TimelineKind =
  | 'INJECT'
  | 'CYBER'
  | 'JAMMER'
  | 'CUTOFF'
  | 'MSG_SENT'
  | 'MSG_RECV'
  | 'MSG_DROP'
  | 'DECISION'
  | 'PROBE'
  | 'ENGAGEMENT'
  | 'STRIKE'
  | 'FEATURE'
  | 'PACE';

export interface TimelineEvent {
  tMs: number;
  endMs: number | null;
  lane: RoleId | 'ALL';
  kind: TimelineKind;
  label: string;
  ref: string | null;
  soundness: Soundness | null;
}

export interface CommsEdge {
  from: RoleId | 'HHQ';
  to: RoleId | 'HHQ';
  sent: number;
  delivered: number;
  dropped: number;
}

export interface TeamMetrics {
  decisions: number;
  brier: number | null;
  overconfidence: number | null;
  verificationRate: number | null;
  intentCutOff: number | null;
  saMean: number | null;
  divergenceMean: number | null;
  deliveryRatio: number | null;
  soundCounts: Record<Soundness, number>;
}

export interface NarrativeBlock {
  text: string;
  source: 'template' | 'ai';
  provider: string | null;
}

export interface AarReport {
  meta: {
    sessionCode: string;
    scenarioId: string;
    scenarioTitle: string;
    theatre: string;
    seed: number;
    endMs: number;
    stateHash: string;
    roles: { role: RoleId; title: string; callsign: string; joined: boolean }[];
  };
  disclaimer: string;
  exec: { objective: string; outcome: string; sustain: string[]; improve: string[] };
  q1: {
    brief: { situation: string; mission: string; execution: string; sustainment: string; command: string };
    intent: { text: string; priority: string; objectiveCells: Cell[]; deadlineS: number; finalVersion: number; finalText: string };
    objectives: { id: string; text: string; cell: Cell }[];
    msel: MselView[];
  };
  q2: {
    outcome: {
      objectives: { id: string; text: string; cell: Cell; held: boolean }[];
      friendlyStrengthPct: number;
      hostileStrengthPct: number;
      features: { id: string; label: string; intact: boolean }[];
      summary: string;
    };
    timeline: TimelineEvent[];
  };
  q3: {
    decisions: DecisionRecord[];
    roleMetrics: RoleMetrics[];
    team: TeamMetrics;
    probes: ProbeStatusView[];
    comms: { channels: ChannelStats[]; edges: CommsEdge[] };
  };
  q4: {
    sustain: string[];
    improve: string[];
    narrative: NarrativeBlock;
    rationaleFeedback: Record<string, NarrativeBlock>;
  };
}

export interface ReplayFrame {
  tMs: number;
  units: { id: string; side: 'BLUE' | 'RED'; label: string; type: string; cell: Cell; x: number; y: number; status: string; decoy?: boolean; ageMs?: number; conflict?: boolean }[];
  jammers: { cell: Cell; radius: number; active: boolean }[];
  cutOff: RoleId[];
  note: string | null;
}

export interface ReplayResponse {
  view: 'truth' | RoleId;
  stepS: number;
  endMs: number;
  terrain: string[];
  frames: ReplayFrame[];
}
