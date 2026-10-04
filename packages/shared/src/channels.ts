import type { Band, ChannelId } from './domain';

export interface ChannelDef {
  id: ChannelId;
  label: string;
  band: Band;
  /** Digital channels are denied by C2_OUTAGE. */
  digital: boolean;
  /** Line-of-sight sensitive (blocked by ridge cells unless relayed). */
  losSensitive: boolean;
  /** Player-to-player text traffic allowed (false = sensor feed only). */
  messaging: boolean;
  /** Node ids (role ids, 'HHQ', sensor ids) that are members of the net. */
  members: string[];
  baseLatencyS: number;
  jitterS: number;
  baseDrop: number;
  baseCorrupt: number;
}

/** Runner: 120 s + 45 s per cell of distance. */
export const RUNNER_BASE_S = 120;
export const RUNNER_PER_CELL_S = 45;

export const DEFAULT_CHANNELS: Record<ChannelId, ChannelDef> = {
  CMD_NET: {
    id: 'CMD_NET',
    label: 'Command net (VHF)',
    band: 'VHF',
    digital: false,
    losSensitive: true,
    messaging: true,
    members: ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW', 'NLO'],
    baseLatencyS: 3,
    jitterS: 2,
    baseDrop: 0.02,
    baseCorrupt: 0.02,
  },
  PL_NET_A: {
    id: 'PL_NET_A',
    label: 'Platoon net A (VHF)',
    band: 'VHF',
    digital: false,
    losSensitive: true,
    messaging: true,
    members: ['CDR', 'PL_A', 'EW'],
    baseLatencyS: 2,
    jitterS: 1,
    baseDrop: 0.02,
    baseCorrupt: 0.02,
  },
  PL_NET_B: {
    id: 'PL_NET_B',
    label: 'Platoon net B (VHF)',
    band: 'VHF',
    digital: false,
    losSensitive: true,
    messaging: true,
    members: ['CDR', 'PL_B', 'EW'],
    baseLatencyS: 2,
    jitterS: 1,
    baseDrop: 0.02,
    baseCorrupt: 0.02,
  },
  HF_NET: {
    id: 'HF_NET',
    label: 'HF net',
    band: 'HF',
    digital: false,
    losSensitive: false,
    messaging: true,
    members: ['HHQ', 'CDR', 'PL_A', 'PL_B', 'ALO', 'EW', 'NLO'],
    baseLatencyS: 10,
    jitterS: 4,
    baseDrop: 0.08,
    baseCorrupt: 0.08,
  },
  SATCOM: {
    id: 'SATCOM',
    label: 'SATCOM (SHF)',
    band: 'SHF',
    digital: true,
    losSensitive: false,
    messaging: true,
    members: ['HHQ', 'CDR', 'ALO', 'EW', 'NLO'],
    baseLatencyS: 20,
    jitterS: 5,
    baseDrop: 0.01,
    baseCorrupt: 0.01,
  },
  ISR_DATALINK: {
    id: 'ISR_DATALINK',
    label: 'ISR datalink (L-band)',
    band: 'L',
    digital: true,
    losSensitive: false,
    messaging: false,
    members: ['ALO', 'CDR'],
    baseLatencyS: 5,
    jitterS: 2,
    baseDrop: 0.03,
    baseCorrupt: 0.02,
  },
  GROUND_SENSOR: {
    id: 'GROUND_SENSOR',
    label: 'Ground sensor link (UHF)',
    band: 'UHF',
    digital: true,
    losSensitive: true,
    messaging: false,
    members: ['CDR', 'PL_A', 'PL_B'],
    baseLatencyS: 8,
    jitterS: 3,
    baseDrop: 0.03,
    baseCorrupt: 0.03,
  },
  RUNNER: {
    id: 'RUNNER',
    label: 'Runner (physical)',
    band: 'NONE',
    digital: false,
    losSensitive: false,
    messaging: true,
    members: ['HHQ', 'CDR', 'PL_A', 'PL_B', 'ALO', 'EW', 'NLO'],
    baseLatencyS: RUNNER_BASE_S,
    jitterS: 10,
    baseDrop: 0,
    baseCorrupt: 0,
  },
};

/** Short human source label used for spoofed/injected traffic on a channel. */
export const CHANNEL_SOURCE_LABEL: Record<ChannelId, string> = {
  CMD_NET: 'CMD NET (voice)',
  PL_NET_A: 'PL NET A (voice)',
  PL_NET_B: 'PL NET B (voice)',
  HF_NET: 'HF NET (voice)',
  SATCOM: 'HHQ INT (SATCOM)',
  ISR_DATALINK: 'ISR FEED',
  GROUND_SENSOR: 'GROUND SENSOR',
  RUNNER: 'RUNNER',
};
