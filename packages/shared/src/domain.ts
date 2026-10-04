import { z } from 'zod';
import { CELL_RE } from './grid';

export const CellSchema = z.string().regex(CELL_RE, 'Expected a grid cell A1–H8');
export const VecSchema = z.object({ x: z.number(), y: z.number() });

export const ROLE_IDS = ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW', 'NLO'] as const;
export const RoleIdSchema = z.enum(ROLE_IDS);
export type RoleId = z.infer<typeof RoleIdSchema>;
export const HHQ = 'HHQ' as const;
export type SuperiorId = RoleId | typeof HHQ;

export const CHANNEL_IDS = [
  'CMD_NET',
  'PL_NET_A',
  'PL_NET_B',
  'HF_NET',
  'SATCOM',
  'ISR_DATALINK',
  'GROUND_SENSOR',
  'RUNNER',
] as const;
export const ChannelIdSchema = z.enum(CHANNEL_IDS);
export type ChannelId = z.infer<typeof ChannelIdSchema>;

export const BANDS = ['VHF', 'UHF', 'L', 'SHF', 'HF', 'NONE'] as const;
export const BandSchema = z.enum(BANDS);
export type Band = z.infer<typeof BandSchema>;

export const SideSchema = z.enum(['BLUE', 'RED']);
export type Side = z.infer<typeof SideSchema>;

export const UNIT_TYPES = [
  'HQ',
  'INFANTRY',
  'MECH',
  'ARMOUR',
  'RECCE',
  'ARTILLERY',
  'ENGINEER',
  'EW_DET',
  'TACP',
  'UAV',
  'AIR',
  'SHIP',
  'CONVOY',
  'SENSOR',
  'UNKNOWN',
  'DECOY',
] as const;
export const UnitTypeSchema = z.enum(UNIT_TYPES);
export type UnitType = z.infer<typeof UnitTypeSchema>;

export const LINK_LEVELS = ['CLEAR', 'DEGRADED', 'DENIED'] as const;
export type LinkLevelName = (typeof LINK_LEVELS)[number];
/** Numeric link level: 0 CLEAR, 1 DEGRADED, 2 DENIED. */
export type LinkLevel = 0 | 1 | 2;

export const INJECT_TYPES = [
  'DELAY',
  'DROPOUT',
  'INTERMITTENT',
  'CONFLICT',
  'SPOOF',
  'MISSING',
  'STALE',
] as const;
export const InjectTypeSchema = z.enum(INJECT_TYPES);
export type InjectType = z.infer<typeof InjectTypeSchema>;

export const InjectSpecSchema = z.object({
  type: InjectTypeSchema,
  channels: z.array(ChannelIdSchema).min(1),
  roles: z.array(RoleIdSchema).default([]),
  durationS: z.number().int().min(5).max(7200),
  params: z
    .object({
      delayS: z.number().min(1).max(1800).optional(),
      periodS: z.number().min(4).max(600).optional(),
      staleS: z.number().min(30).max(3600).optional(),
      targetCell: CellSchema.optional(),
    })
    .default({}),
  label: z.string().max(120).optional(),
});
export type InjectSpec = z.infer<typeof InjectSpecSchema>;

export const JammerSpecSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().max(60).optional(),
  cell: CellSchema,
  radius: z.number().min(0.5).max(4),
  bands: z.array(BandSchema.exclude(['NONE'])).min(1),
  power: z.number().min(0.5).max(1.5).default(1),
  active: z.boolean().default(true),
});
export type JammerSpec = z.infer<typeof JammerSpecSchema>;

export const CYBER_KINDS = ['C2_OUTAGE', 'DATALINK_COMPROMISE', 'GPS_SPOOF'] as const;
export const CyberKindSchema = z.enum(CYBER_KINDS);
export type CyberKind = z.infer<typeof CyberKindSchema>;
export const CyberSpecSchema = z
  .object({
    kind: CyberKindSchema,
    durationS: z.number().int().min(10).max(3600),
    role: RoleIdSchema.optional(),
    driftCells: z.number().min(0.5).max(3).optional(),
  })
  .refine((c) => c.kind !== 'GPS_SPOOF' || c.role !== undefined, {
    message: 'GPS_SPOOF requires a role',
    path: ['role'],
  });
export type CyberSpec = z.infer<typeof CyberSpecSchema>;

export const ACTIONS = [
  'ADVANCE',
  'HOLD',
  'WITHDRAW',
  'REPOSITION',
  'REQUEST_RECON',
  'CALL_AIR',
  'RELAY',
  'SWITCH_CHANNEL',
] as const;
export const ActionSchema = z.enum(ACTIONS);
export type Action = z.infer<typeof ActionSchema>;
/** Actions that need a target cell. */
export const CELL_ACTIONS: readonly Action[] = [
  'ADVANCE',
  'WITHDRAW',
  'REPOSITION',
  'REQUEST_RECON',
  'CALL_AIR',
  'RELAY',
];

export const IntentSelfSchema = z.enum(['YES', 'NO', 'UNSURE']);
export type IntentSelf = z.infer<typeof IntentSelfSchema>;

export const SOUNDNESS = ['SOUND', 'RISKY', 'UNSOUND'] as const;
export type Soundness = (typeof SOUNDNESS)[number];

export const PHASES = ['LOBBY', 'RUNNING', 'PAUSED', 'PROBE', 'ENDED'] as const;
export type Phase = (typeof PHASES)[number];

export const SpeedSchema = z.union([z.literal(1), z.literal(2), z.literal(4)]);
export type Speed = z.infer<typeof SpeedSchema>;

export type Confidence = 'H' | 'M' | 'L';
export const INTEL_KINDS = ['CONTACT', 'NEGATIVE', 'POSREP', 'INFO', 'RECON'] as const;
export type IntelKind = (typeof INTEL_KINDS)[number];

export const PROBE_KINDS = [
  'HOSTILE_COUNT',
  'FRIENDLY_LOCATION',
  'FEATURE_STATUS',
  'DECOY_ASSESS',
  'HOSTILE_LOCATION',
  'LINK_STATUS',
] as const;
export type ProbeKind = (typeof PROBE_KINDS)[number];
