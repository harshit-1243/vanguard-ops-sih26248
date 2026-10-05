import { z } from 'zod';
import {
  ActionSchema,
  CellSchema,
  ChannelIdSchema,
  CyberSpecSchema,
  InjectSpecSchema,
  IntentSelfSchema,
  JammerSpecSchema,
  RoleIdSchema,
  SessionSettingsSchema,
  SpeedSchema,
} from './domain';

export const CallsignSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[A-Za-z0-9 -]+$/, 'Letters, digits, space and dash only')
  .transform((s) => s.toUpperCase());

export const RationaleSchema = z.string().trim().min(15, 'Rationale must be at least 15 characters').max(600);

export const DecisionPayloadSchema = z
  .object({
    action: ActionSchema,
    targetCell: CellSchema.optional(),
    channel: ChannelIdSchema.optional(),
    confidence: z.number().int().min(0).max(100),
    rationale: RationaleSchema,
    basedOn: z.array(z.string().max(40)).max(20).default([]),
    intentSelf: IntentSelfSchema,
  })
  .superRefine((d, ctx) => {
    if (d.action === 'SWITCH_CHANNEL' && !d.channel)
      ctx.addIssue({ code: 'custom', path: ['channel'], message: 'Select a channel' });
    if (
      ['ADVANCE', 'WITHDRAW', 'REPOSITION', 'REQUEST_RECON', 'CALL_AIR', 'RELAY'].includes(
        d.action,
      ) &&
      !d.targetCell
    )
      ctx.addIssue({ code: 'custom', path: ['targetCell'], message: 'Select a target sector' });
  });
export type DecisionPayload = z.infer<typeof DecisionPayloadSchema>;

const ev = <T extends string, P extends z.ZodTypeAny>(type: T, payload: P) =>
  z.object({ type: z.literal(type), payload });
const empty = z.object({}).default({});

/** Input events: the only facts persisted. Everything else is derived by the simulation. */
export const InputEventBodySchema = z.discriminatedUnion('type', [
  ev(
    'SESSION_CREATED',
    z.object({
      scenarioId: z.string(),
      seed: z.number().int(),
      enabledRoles: z.array(RoleIdSchema),
      settings: SessionSettingsSchema.optional(),
      scenario: z.unknown().optional(),
      /** Course / syndicate label (analytics grouping; not used by the sim). */
      course: z.string().max(60).optional(),
    }),
  ),
  ev('ROLE_JOINED', z.object({ roleId: RoleIdSchema, callsign: z.string() })),
  ev('ROLE_LEFT', z.object({ roleId: RoleIdSchema })),
  ev('EXERCISE_STARTED', empty),
  ev('EXERCISE_PAUSED', empty),
  ev('EXERCISE_RESUMED', empty),
  ev('SPEED_SET', z.object({ speed: SpeedSchema })),
  ev('EXERCISE_ENDED', empty),
  ev('INTENT_SET', z.object({ text: z.string().min(10).max(600) })),
  ev('INJECT_FIRED', z.object({ injectId: z.string(), inject: InjectSpecSchema })),
  ev('MSEL_FIRED', z.object({ mselId: z.string() })),
  ev('MSEL_EDITED', z.object({ mselId: z.string(), atS: z.number().int().min(0) })),
  ev('MSEL_SKIPPED', z.object({ mselId: z.string() })),
  ev('JAMMER_PLACED', z.object({ jammer: JammerSpecSchema })),
  ev('JAMMER_MOVED', z.object({ jammerId: z.string(), cell: CellSchema })),
  ev('JAMMER_TOGGLED', z.object({ jammerId: z.string(), active: z.boolean() })),
  ev('JAMMER_REMOVED', z.object({ jammerId: z.string() })),
  ev('CYBER_TRIGGERED', z.object({ cyberId: z.string(), cyber: CyberSpecSchema })),
  ev(
    'MESSAGE_SENT',
    z.object({
      channel: ChannelIdSchema,
      to: z.array(RoleIdSchema).min(1),
      text: z.string().trim().min(1).max(400),
    }),
  ),
  ev(
    'INTEL_FORWARDED',
    z.object({ itemId: z.string(), channel: ChannelIdSchema, to: z.array(RoleIdSchema).min(1) }),
  ),
  ev('CONFLICT_FLAGGED', z.object({ itemIds: z.array(z.string()).min(1).max(10) })),
  ev('VERIFICATION_REQUESTED', z.object({ itemId: z.string() })),
  ev('PACE_SWITCHED', z.object({ channel: ChannelIdSchema })),
  ev('DECISION_MADE', DecisionPayloadSchema),
  ev('INTENT_UPDATED', z.object({ text: z.string().trim().min(10).max(600) })),
  ev('FREQ_HOP', z.object({ channel: ChannelIdSchema })),
  ev('PROBE_STARTED', z.object({ probeId: z.string() })),
  ev(
    'PROBE_ANSWERED',
    z.object({ probeId: z.string(), answers: z.record(z.string(), z.string().max(40)) }),
  ),
  ev('PROBE_ENDED', z.object({ probeId: z.string() })),
  /** Periodic marker so a restarted server resumes at (almost) the same sim time. No state change. */
  ev('CLOCK_CHECKPOINT', empty),
]);
export type InputEventBody = z.infer<typeof InputEventBodySchema>;
export type InputEventType = InputEventBody['type'];
export type PayloadOf<T extends InputEventType> = Extract<InputEventBody, { type: T }>['payload'];

export type Actor = 'DS' | 'SYSTEM' | z.infer<typeof RoleIdSchema>;

/** What the simulation consumes. */
export type SimEvent = InputEventBody & { seq: number; tSimMs: number; actor: Actor };

/** Persisted envelope (PRD §6.2). */
export type StoredEvent = SimEvent & { id: string; sessionId: string; tWall: string };
