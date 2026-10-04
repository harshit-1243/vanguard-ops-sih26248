import { z } from 'zod';
import {
  CellSchema,
  ChannelIdSchema,
  CyberSpecSchema,
  InjectSpecSchema,
  JammerSpecSchema,
  RoleIdSchema,
  SideSchema,
  UnitTypeSchema,
  VecSchema,
  type RoleId,
} from './domain';
import { TERRAIN_RE } from './grid';

export const ScriptedReportSchema = z.object({
  from: z.string().min(1),
  fromLabel: z.string().min(1).max(60),
  channel: ChannelIdSchema,
  to: z.array(RoleIdSchema).min(1),
  kind: z.enum(['CONTACT', 'NEGATIVE', 'INFO']),
  cell: CellSchema.optional(),
  unitType: UnitTypeSchema.optional(),
  count: z.number().int().min(0).max(99).optional(),
  confidence: z.enum(['H', 'M', 'L']).default('M'),
  text: z.string().min(1).max(400),
});
export type ScriptedReport = z.infer<typeof ScriptedReportSchema>;

export const MselActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('INJECT'), inject: InjectSpecSchema }),
  z.object({ kind: z.literal('JAMMER'), jammer: JammerSpecSchema }),
  z.object({ kind: z.literal('JAMMER_TOGGLE'), jammerId: z.string(), active: z.boolean() }),
  z.object({ kind: z.literal('CYBER'), cyber: CyberSpecSchema }),
  z.object({ kind: z.literal('REPORT'), report: ScriptedReportSchema }),
]);
export type MselAction = z.infer<typeof MselActionSchema>;

export const MselItemSchema = z.object({
  id: z.string().min(1).max(20),
  atS: z.number().int().min(0),
  title: z.string().min(1).max(120),
  note: z.string().max(400).optional(),
  action: MselActionSchema,
});
export type MselItem = z.infer<typeof MselItemSchema>;

export const UnitSpecSchema = z.object({
  id: z.string().min(1).max(40),
  side: SideSchema,
  callsign: z.string().min(1).max(40),
  type: UnitTypeSchema,
  /** Vehicles / sections shown in reports. */
  count: z.number().int().min(0).max(99),
  /** Combat power points (0 for decoys). Full-strength company ≈ 100. */
  strength: z.number().min(0).max(400),
  ownerRole: RoleIdSchema.optional(),
  decoy: z.boolean().default(false),
  /** Cells per minute. Defaults by type when omitted. */
  speed: z.number().min(0).max(5).optional(),
  visualRangeCells: z.number().min(0).max(4).optional(),
  waypoints: z.array(z.object({ atS: z.number().min(0), cell: CellSchema })).min(1),
});
export type UnitSpec = z.infer<typeof UnitSpecSchema>;

export const SensorSpecSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['UAV', 'GROUND_SENSOR', 'COASTAL_RADAR', 'OP']),
  label: z.string().min(1).max(60),
  channel: ChannelIdSchema,
  cell: CellSchema,
  rangeCells: z.number().min(0.5).max(6),
  intervalS: z.number().int().min(10).max(600),
  deliverTo: z.array(RoleIdSchema).min(1),
  discriminatesDecoys: z.boolean().default(false),
  reportsNegatives: z.boolean().default(false),
  /** Restrict detections to these unit types (e.g. coastal radar → SHIP). */
  detects: z.array(UnitTypeSchema).optional(),
  ownerRole: RoleIdSchema.optional(),
  activeFromS: z.number().min(0).default(0),
});
export type SensorSpec = z.infer<typeof SensorSpecSchema>;

export const RoleSpecSchema = z.object({
  id: RoleIdSchema,
  title: z.string().min(1).max(60),
  callsign: z.string().min(1).max(30),
  superior: z.union([RoleIdSchema, z.literal('HHQ')]),
  unitId: z.string().min(1),
  pace: z.tuple([ChannelIdSchema, ChannelIdSchema, ChannelIdSchema, ChannelIdSchema]),
  optional: z.boolean().default(false),
  description: z.string().max(400).default(''),
});
export type RoleSpec = z.infer<typeof RoleSpecSchema>;

export const NodeSpecSchema = z
  .object({
    id: z.string().min(1).max(40),
    label: z.string().min(1).max(60),
    cell: CellSchema.optional(),
    pos: VecSchema.optional(),
    relay: z.boolean().default(false),
  })
  .refine((n) => n.cell !== undefined || n.pos !== undefined, 'node needs cell or pos');
export type NodeSpec = z.infer<typeof NodeSpecSchema>;

export const FeatureSpecSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['BRIDGE', 'DEPOT', 'LANDING_ZONE']),
  label: z.string().min(1).max(60),
  cell: CellSchema,
  destroyAtS: z.number().int().min(0).optional(),
  unlessBlueIn: z.array(CellSchema).default([]),
});
export type FeatureSpec = z.infer<typeof FeatureSpecSchema>;

export const IntentSchema = z.object({
  text: z.string().min(10).max(600),
  objectiveCells: z.array(CellSchema).min(1),
  forbiddenCells: z.array(CellSchema).default([]),
  priority: z.enum(['SEIZE', 'DEFEND', 'PRESERVE']),
  deadlineS: z.number().int().min(60),
});
export type Intent = z.infer<typeof IntentSchema>;

export const ProbeTemplateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('HOSTILE_COUNT'), cell: CellSchema }),
  z.object({ kind: z.literal('FRIENDLY_LOCATION'), role: RoleIdSchema }),
  z.object({ kind: z.literal('FEATURE_STATUS'), featureId: z.string() }),
  z.object({ kind: z.literal('DECOY_ASSESS'), cell: CellSchema }),
  z.object({ kind: z.literal('HOSTILE_LOCATION'), unitId: z.string(), label: z.string() }),
]);
export type ProbeTemplate = z.infer<typeof ProbeTemplateSchema>;

const ChannelOverrideSchema = z
  .object({
    baseLatencyS: z.number().min(0).max(600),
    jitterS: z.number().min(0).max(120),
    baseDrop: z.number().min(0).max(0.9),
    baseCorrupt: z.number().min(0).max(0.9),
    members: z.array(z.string()),
  })
  .partial();

export const ScenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1).max(60),
    theatre: z.string().min(1).max(80),
    summary: z.string().min(1).max(600),
    durationMin: z.number().int().min(5).max(180),
    defaultSeed: z.number().int().min(0),
    brief: z.object({
      situation: z.string().min(1),
      mission: z.string().min(1),
      execution: z.string().min(1),
      sustainment: z.string().default(''),
      command: z.string().default(''),
    }),
    terrain: z.array(z.string().regex(TERRAIN_RE, '8 terrain chars per row')).length(8),
    features: z.array(FeatureSpecSchema).default([]),
    intent: IntentSchema,
    objectives: z.array(z.object({ id: z.string(), text: z.string(), cell: CellSchema })).min(1),
    roles: z.array(RoleSpecSchema).min(2).max(6),
    nodes: z.array(NodeSpecSchema).default([]),
    units: z.array(UnitSpecSchema).min(2),
    sensors: z.array(SensorSpecSchema).default([]),
    channels: z.record(ChannelIdSchema, ChannelOverrideSchema).default({}),
    air: z.object({
      availableFromS: z.number().int().min(0),
      responseS: z.number().int().min(0).default(120),
      sorties: z.number().int().min(0).max(10).default(2),
    }),
    scriptedReports: z
      .array(ScriptedReportSchema.extend({ atS: z.number().int().min(0) }))
      .default([]),
    msel: z.array(MselItemSchema).default([]),
    probeBank: z.array(ProbeTemplateSchema).min(2),
  })
  .superRefine((s, ctx) => {
    const unitIds = new Set<string>();
    s.units.forEach((u, i) => {
      if (unitIds.has(u.id))
        ctx.addIssue({ code: 'custom', path: ['units', i, 'id'], message: 'duplicate unit id' });
      unitIds.add(u.id);
    });
    const roleIds = new Set<RoleId>(s.roles.map((r) => r.id));
    if (!roleIds.has('CDR'))
      ctx.addIssue({ code: 'custom', path: ['roles'], message: 'CDR role is required' });
    s.roles.forEach((r, i) => {
      const u = s.units.find((x) => x.id === r.unitId);
      if (!u || u.side !== 'BLUE')
        ctx.addIssue({ code: 'custom', path: ['roles', i, 'unitId'], message: 'unknown BLUE unit' });
      if (r.superior !== 'HHQ' && !roleIds.has(r.superior))
        ctx.addIssue({ code: 'custom', path: ['roles', i, 'superior'], message: 'unknown role' });
    });
    const nodeIds = new Set(s.nodes.map((n) => n.id));
    s.scriptedReports.forEach((r, i) => {
      if (!nodeIds.has(r.from) && !s.sensors.some((x) => x.id === r.from))
        ctx.addIssue({
          code: 'custom',
          path: ['scriptedReports', i, 'from'],
          message: 'unknown node',
        });
    });
    const mselIds = new Set<string>();
    s.msel.forEach((m, i) => {
      if (mselIds.has(m.id))
        ctx.addIssue({ code: 'custom', path: ['msel', i, 'id'], message: 'duplicate MSEL id' });
      mselIds.add(m.id);
    });
    s.probeBank.forEach((p, i) => {
      if (p.kind === 'FEATURE_STATUS' && !s.features.some((f) => f.id === p.featureId))
        ctx.addIssue({ code: 'custom', path: ['probeBank', i], message: 'unknown feature' });
      if (p.kind === 'HOSTILE_LOCATION' && !unitIds.has(p.unitId))
        ctx.addIssue({ code: 'custom', path: ['probeBank', i], message: 'unknown unit' });
      if (p.kind === 'FRIENDLY_LOCATION' && !roleIds.has(p.role))
        ctx.addIssue({ code: 'custom', path: ['probeBank', i], message: 'unknown role' });
    });
  });
export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioInput = z.input<typeof ScenarioSchema>;

export interface ScenarioSummary {
  id: string;
  title: string;
  theatre: string;
  summary: string;
  durationMin: number;
  defaultSeed: number;
  roles: { id: RoleId; title: string; callsign: string; optional: boolean; description: string }[];
  mselCount: number;
}

export function summarizeScenario(s: Scenario): ScenarioSummary {
  return {
    id: s.id,
    title: s.title,
    theatre: s.theatre,
    summary: s.summary,
    durationMin: s.durationMin,
    defaultSeed: s.defaultSeed,
    roles: s.roles.map((r) => ({
      id: r.id,
      title: r.title,
      callsign: r.callsign,
      optional: r.optional,
      description: r.description,
    })),
    mselCount: s.msel.length,
  };
}
