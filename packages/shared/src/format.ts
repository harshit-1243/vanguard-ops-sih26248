import type { UnitType } from './domain';

const pad = (n: number) => String(n).padStart(2, '0');

/** Sim time as T+MM:SS (T+H:MM:SS past one hour). */
export function formatT(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `T+${h}:${pad(m)}:${pad(s)}` : `T+${pad(m)}:${pad(s)}`;
}

/** Compact age: 45s, 4m, 1h05m. */
export function formatAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${pad(m % 60)}m`;
}

export const STALE_AFTER_MS = 300_000;

export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  HQ: 'HQ',
  INFANTRY: 'infantry',
  MECH: 'mech infantry',
  ARMOUR: 'armour',
  RECCE: 'recce',
  ARTILLERY: 'artillery',
  ENGINEER: 'engineers',
  EW_DET: 'EW detachment',
  TACP: 'air liaison team',
  UAV: 'UAV',
  AIR: 'aircraft',
  SHIP: 'surface vessel',
  CONVOY: 'supply convoy',
  SENSOR: 'sensor',
  UNKNOWN: 'unidentified',
  DECOY: 'possible decoys',
};

export interface ReportTextInput {
  kind: 'CONTACT' | 'NEGATIVE' | 'RECON' | 'POSREP' | 'INFO';
  cell: string | null;
  unitType: string | null;
  count: number | null;
  observedAtMs: number;
  callsign?: string;
}

/** Military-format one-liner (contact report / SALUTE-style). Deterministic template. */
export function reportText(r: ReportTextInput): string {
  const t = formatT(r.observedAtMs);
  const where = r.cell ?? 'UNKNOWN GRID';
  const what = r.unitType ? (UNIT_TYPE_LABEL[r.unitType as UnitType] ?? r.unitType) : 'unknown';
  const n = r.count === null ? '?' : String(r.count);
  switch (r.kind) {
    case 'CONTACT':
      return `CONTACT. ${n}x ${what.toUpperCase()} at GRID ${where}. Time ${t}.`;
    case 'RECON':
      return `RECON REPORT. GRID ${where}: ${n}x ${what.toUpperCase()}. Time ${t}. Confidence HIGH.`;
    case 'NEGATIVE':
      return `NEGATIVE. No heavy-vehicle signature at GRID ${where}. Time ${t}.`;
    case 'POSREP':
      return `POSREP. ${r.callsign ?? 'Unit'} at GRID ${where}. Time ${t}.`;
    default:
      return `INFO. GRID ${where}. Time ${t}.`;
  }
}

/** SALUTE breakdown (Size, Activity, Location, Unit, Time, Equipment). */
export function saluteLines(r: ReportTextInput): Record<'S' | 'A' | 'L' | 'U' | 'T' | 'E', string> {
  const what = r.unitType ? (UNIT_TYPE_LABEL[r.unitType as UnitType] ?? r.unitType) : 'unknown';
  return {
    S: r.count === null ? 'unknown' : `${r.count} vehicles/sections`,
    A: r.kind === 'NEGATIVE' ? 'no activity detected' : 'observed',
    L: r.cell ?? 'unknown',
    U: what,
    T: formatT(r.observedAtMs),
    E: r.unitType === 'ARMOUR' || r.unitType === 'MECH' ? 'tracked vehicles' : 'not determined',
  };
}

export const DISCLAIMER =
  'Training simulation — synthetic data. All units, callsigns, terrain and events are fictional.';
