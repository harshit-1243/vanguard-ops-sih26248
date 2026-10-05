import { z } from 'zod';
import type { RoleId, Soundness } from './domain';
import type { ScenarioSummary } from './scenario';

/** Course-director area: scenario editor + cross-course analytics (PRD addendum v1.2). */
export const AdminLoginBodySchema = z.object({ key: z.string().min(1).max(200) });

export interface AdminStatus {
  /** False when the server runs without ADMIN_KEY (closed LAN / local dev). */
  required: boolean;
}

/** Course / syndicate label chosen when an exercise is created; groups exercises in analytics. */
export const CourseLabelSchema = z.string().trim().max(60);

export interface ScenarioListItem extends ScenarioSummary {
  custom: boolean;
  updatedAt: string | null;
}

export interface ScenarioIssue {
  path: string;
  message: string;
}

export interface ScenarioValidation {
  ok: boolean;
  /** Schema errors: the scenario cannot be saved. */
  issues: ScenarioIssue[];
  /** Design warnings: saveable, but probably not what the author meant. */
  warnings: ScenarioIssue[];
  /** Headless run of the full duration with adaptive OPFOR and the MSEL (null when invalid). */
  dryRun: {
    simS: number;
    ms: number;
    mselFired: number;
    opforReactions: number;
    blueStrengthPct: number;
    redStrengthPct: number;
    error: string | null;
  } | null;
}

export const SaveScenarioBodySchema = z.object({ scenario: z.unknown() });

// ---------------------------------------------------------------- analytics

/** PRD §8 adjudication rules, in words (for analytics and exports). */
export const ADJUDICATION_RULE_LABEL: Record<string, string> = {
  R1: 'Advance into force ratio',
  R2: 'Reposition into force ratio',
  R3: 'Hold under threat / missed opportunity',
  R4: 'Withdrawal without superior threat',
  R5: 'Air strike target / timing',
  R6: 'Reconnaissance request',
  R7: 'Relay that does not help',
  R8: 'Switch to a worse channel',
};

/** Means of the team-level AAR metrics (null = no data). */
export interface MetricSet {
  brier: number | null;
  verificationRate: number | null;
  intentCutOff: number | null;
  saMean: number | null;
  divergenceMean: number | null;
  deliveryRatio: number | null;
  /** Share of adjudicated decisions rated SOUND. */
  soundRate: number | null;
  latencyMeanS: number | null;
}

export interface AnalyticsExercise {
  code: string;
  course: string;
  scenarioId: string;
  scenarioTitle: string;
  createdAt: string;
  endedAt: string | null;
  durationS: number;
  roles: number;
  decisions: number;
  soundCounts: Record<Soundness, number>;
  objectivesHeld: number;
  objectivesTotal: number;
  friendlyStrengthPct: number;
  hostileStrengthPct: number;
  settings: { ewIntensity: string; sensorReliability: string; commsQuality: string; opfor: string };
  metrics: MetricSet;
}

export interface AnalyticsGroup {
  key: string;
  label: string;
  exercises: number;
  decisions: number;
  metrics: MetricSet;
}

export interface AnalyticsParticipant {
  callsign: string;
  role: RoleId;
  course: string;
  exercises: number;
  decisions: number;
  metrics: MetricSet;
}

export interface AnalyticsResponse {
  generatedAt: string;
  filters: { course: string | null; scenarioId: string | null };
  options: { courses: string[]; scenarios: { id: string; title: string }[] };
  totals: { exercises: number; decisions: number; participants: number; metrics: MetricSet };
  exercises: AnalyticsExercise[];
  byCourse: AnalyticsGroup[];
  byScenario: AnalyticsGroup[];
  byRole: AnalyticsGroup[];
  byDifficulty: AnalyticsGroup[];
  participants: AnalyticsParticipant[];
  /** Most frequent reasons decisions were rated RISKY/UNSOUND. */
  pitfalls: { rule: string; label: string; count: number; example: string }[];
  insights: string[];
  /** Exercises that could not be analysed (corrupt log etc.). */
  skipped: { code: string; error: string }[];
}
