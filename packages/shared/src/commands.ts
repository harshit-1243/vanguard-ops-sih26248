import { z } from 'zod';
import {
  CellSchema,
  ChannelIdSchema,
  CyberSpecSchema,
  InjectSpecSchema,
  JammerSpecSchema,
  RoleIdSchema,
  SpeedSchema,
} from './domain';
import { CallsignSchema, DecisionPayloadSchema } from './events';

const c = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ type: z.literal(type), ...shape });

/** Commands the Directing Staff socket may send. */
export const DsCommandSchema = z.discriminatedUnion('type', [
  c('START', {}),
  c('PAUSE', {}),
  c('RESUME', {}),
  c('SET_SPEED', { speed: SpeedSchema }),
  c('END', {}),
  c('SET_INTENT', { text: z.string().trim().min(10).max(600) }),
  c('FIRE_INJECT', { inject: InjectSpecSchema }),
  c('MSEL_FIRE_NOW', { mselId: z.string() }),
  c('MSEL_SKIP', { mselId: z.string() }),
  c('MSEL_EDIT', { mselId: z.string(), atS: z.number().int().min(0) }),
  c('PLACE_JAMMER', { jammer: JammerSpecSchema.omit({ id: true }) }),
  c('MOVE_JAMMER', { jammerId: z.string(), cell: CellSchema }),
  c('TOGGLE_JAMMER', { jammerId: z.string(), active: z.boolean() }),
  c('REMOVE_JAMMER', { jammerId: z.string() }),
  c('TRIGGER_CYBER', { cyber: CyberSpecSchema }),
  c('START_PROBE', {}),
  c('END_PROBE', {}),
  c('VIEW_AS', { role: RoleIdSchema.nullable() }),
  c('RELEASE_ROLE', { role: RoleIdSchema }),
]);
export type DsCommand = z.infer<typeof DsCommandSchema>;

/** Commands a trainee socket may send (role is bound server-side from the token). */
export const TraineeCommandSchema = z.discriminatedUnion('type', [
  c('SEND_MESSAGE', {
    channel: ChannelIdSchema,
    to: z.array(RoleIdSchema).min(1).max(6),
    text: z.string().trim().min(1).max(400),
  }),
  c('FORWARD_INTEL', {
    itemId: z.string().max(40),
    channel: ChannelIdSchema,
    to: z.array(RoleIdSchema).min(1).max(6),
  }),
  c('FLAG_CONFLICT', { itemIds: z.array(z.string().max(40)).min(1).max(10) }),
  c('REQUEST_VERIFICATION', { itemId: z.string().max(40) }),
  c('SWITCH_PACE', { channel: ChannelIdSchema }),
  c('MAKE_DECISION', { decision: DecisionPayloadSchema }),
  c('UPDATE_INTENT', { text: z.string().trim().min(10).max(600) }),
  c('FREQ_HOP', { channel: ChannelIdSchema }),
  c('ANSWER_PROBE', {
    probeId: z.string(),
    answers: z.record(z.string(), z.string().max(40)),
  }),
]);
export type TraineeCommand = z.infer<typeof TraineeCommandSchema>;

export interface CommandAck {
  ok: boolean;
  error?: string;
}

// ---- REST bodies ----
export const CreateSessionBodySchema = z.object({
  scenarioId: z.string().regex(/^[a-z0-9-]+$/),
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
  enabledRoles: z.array(RoleIdSchema).min(2).max(6).optional(),
});
export type CreateSessionBody = z.infer<typeof CreateSessionBodySchema>;

export const JoinBodySchema = z.object({ roleId: RoleIdSchema, callsign: CallsignSchema });
export type JoinBody = z.infer<typeof JoinBodySchema>;

export const InstructorLoginBodySchema = z.object({ pin: z.string().regex(/^\d{6}$/) });

export const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SessionCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/, 'Invalid session code'));

export interface CreateSessionResponse {
  code: string;
  pin: string;
  instructorToken: string;
}
export interface JoinResponse {
  playerToken: string;
  roleId: z.infer<typeof RoleIdSchema>;
  callsign: string;
}
export interface LobbyRole {
  id: z.infer<typeof RoleIdSchema>;
  title: string;
  callsign: string;
  description: string;
  taken: boolean;
  takenBy: string | null;
  connected: boolean;
}
export interface LobbyInfo {
  code: string;
  scenarioId: string;
  title: string;
  theatre: string;
  phase: string;
  roles: LobbyRole[];
}
