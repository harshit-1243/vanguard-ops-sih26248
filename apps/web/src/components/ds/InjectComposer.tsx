import { useState } from 'react';
import { Bug, Zap } from 'lucide-react';
import {
  CHANNEL_IDS,
  INJECT_TYPES,
  allCells,
  formatT,
  type ChannelId,
  type InjectType,
  type InstructorState,
  type RoleId,
} from '@vanguard/shared';
import { Badge, Button, Empty, Input, Label, SectionTitle, Select } from '@/components/ui/primitives';
import type { Cmd } from '@/components/trainee/parts';
import { cn } from '@/lib/utils';

export const INJECT_HELP: Record<InjectType, string> = {
  DELAY: 'Traffic on the channel(s) arrives late by the given seconds.',
  DROPOUT: 'Link visibly DOWN — affected stations see the channel denied.',
  INTERMITTENT: 'Link flaps: up for half of each period, down for the other half.',
  CONFLICT: 'Contacts spawn a contradictory twin; with a target cell, an immediate contact/no-contact pair.',
  SPOOF: 'False contacts every 30 s (deceptive source label).',
  MISSING: 'Silent loss — link looks CLEAR but traffic vanishes.',
  STALE: 'Reports arrive describing the situation N seconds ago (age shows it).',
};

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn('rounded border px-1.5 py-0.5 font-mono text-[10px]', on ? 'border-accent bg-accent/15 text-ink' : 'border-line text-muted hover:text-ink')}>
      {children}
    </button>
  );
}

export function InjectComposer({ t, cmd }: { t: InstructorState; cmd: Cmd }) {
  const roles = t.roles.filter((r) => r.enabled).map((r) => r.role);
  const [type, setType] = useState<InjectType>('DELAY');
  const [channels, setChannels] = useState<ChannelId[]>(['CMD_NET']);
  const [targetRoles, setTargetRoles] = useState<RoleId[]>([]);
  const [durationS, setDurationS] = useState(120);
  const [delayS, setDelayS] = useState(60);
  const [periodS, setPeriodS] = useState(20);
  const [staleS, setStaleS] = useState(300);
  const [targetCell, setTargetCell] = useState('');
  const [label, setLabel] = useState('');
  const live = t.phase === 'RUNNING' || t.phase === 'PAUSED';
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const params: Record<string, unknown> = {};
  if (type === 'DELAY') params.delayS = delayS;
  if (type === 'INTERMITTENT') params.periodS = periodS;
  if (type === 'STALE') params.staleS = staleS;
  if ((type === 'CONFLICT' || type === 'SPOOF') && targetCell) params.targetCell = targetCell;

  const preview = `${type}${type === 'DELAY' ? ` +${delayS}s` : type === 'INTERMITTENT' ? ` period ${periodS}s` : type === 'STALE' ? ` ${staleS}s old` : ''} on ${channels.join(', ') || '—'} → ${targetRoles.length ? targetRoles.join(', ') : 'all stations'} for ${durationS}s${params.targetCell ? ` @ ${String(params.targetCell)}` : ''}. ${INJECT_HELP[type]}`;

  return (
    <div className="grid gap-3 p-3">
      <div>
        <Label htmlFor="inj-type">Inject type</Label>
        <Select id="inj-type" value={type} onChange={(e) => setType(e.target.value as InjectType)}>
          {INJECT_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
        </Select>
      </div>
      <div>
        <Label>Channels</Label>
        <div className="flex flex-wrap gap-1">
          {CHANNEL_IDS.filter((c) => c !== 'RUNNER').map((c) => (
            <Chip key={c} on={channels.includes(c)} onClick={() => setChannels((x) => toggle(x, c))}>{c}</Chip>
          ))}
        </div>
      </div>
      <div>
        <Label>Affected roles (none = all)</Label>
        <div className="flex flex-wrap gap-1">
          {roles.map((r) => <Chip key={r} on={targetRoles.includes(r)} onClick={() => setTargetRoles((x) => toggle(x, r))}>{r}</Chip>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="inj-dur">Duration (s)</Label>
          <Input id="inj-dur" type="number" min={5} max={7200} value={durationS} onChange={(e) => setDurationS(Number(e.target.value))} />
        </div>
        {type === 'DELAY' && (
          <div><Label htmlFor="inj-delay">Delay (s)</Label><Input id="inj-delay" type="number" min={1} max={1800} value={delayS} onChange={(e) => setDelayS(Number(e.target.value))} /></div>
        )}
        {type === 'INTERMITTENT' && (
          <div><Label htmlFor="inj-period">Period (s)</Label><Input id="inj-period" type="number" min={4} max={600} value={periodS} onChange={(e) => setPeriodS(Number(e.target.value))} /></div>
        )}
        {type === 'STALE' && (
          <div><Label htmlFor="inj-stale">Staleness (s)</Label><Input id="inj-stale" type="number" min={30} max={3600} value={staleS} onChange={(e) => setStaleS(Number(e.target.value))} /></div>
        )}
        {(type === 'CONFLICT' || type === 'SPOOF') && (
          <div>
            <Label htmlFor="inj-cell">Target cell (optional)</Label>
            <Select id="inj-cell" value={targetCell} onChange={(e) => setTargetCell(e.target.value)}>
              <option value="">—</option>
              {allCells().map((c) => <option key={c}>{c}</option>)}
            </Select>
          </div>
        )}
      </div>
      <div>
        <Label htmlFor="inj-label">Label (DS only)</Label>
        <Input id="inj-label" maxLength={120} placeholder="e.g. Hostile jamming of PL net" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <p className="rounded border border-line bg-bg p-2 text-[11px] leading-relaxed text-muted" aria-live="polite">
        <span className="font-semibold text-ink">Preview:</span> {preview}
      </p>
      <Button
        variant="primary"
        disabled={!live || channels.length === 0}
        onClick={() => cmd({ type: 'FIRE_INJECT', inject: { type, channels, roles: targetRoles, durationS, params, label: label || undefined } }, `${type} inject fired at ${formatT(t.tMs)}`)}
      >
        <Zap size={14} /> Inject now
      </Button>
    </div>
  );
}

export function CyberControls({ t, cmd }: { t: InstructorState; cmd: Cmd }) {
  const roles = t.roles.filter((r) => r.enabled).map((r) => r.role);
  const [dur, setDur] = useState(120);
  const [gpsRole, setGpsRole] = useState<RoleId>(roles.includes('PL_A') ? 'PL_A' : roles[0]!);
  const [drift, setDrift] = useState(1.5);
  const live = t.phase === 'RUNNING' || t.phase === 'PAUSED';
  return (
    <div className="grid gap-2 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="cy-dur">Duration (s)</Label><Input id="cy-dur" type="number" min={10} max={3600} value={dur} onChange={(e) => setDur(Number(e.target.value))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="danger" size="sm" disabled={!live} onClick={() => cmd({ type: 'TRIGGER_CYBER', cyber: { kind: 'C2_OUTAGE', durationS: dur } }, 'C2 outage triggered')}>
          <Bug size={12} /> C2 outage
        </Button>
        <Button variant="danger" size="sm" disabled={!live} onClick={() => cmd({ type: 'TRIGGER_CYBER', cyber: { kind: 'DATALINK_COMPROMISE', durationS: dur } }, 'Datalink compromised')}>
          <Bug size={12} /> Datalink compromise
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_80px_auto] items-end gap-2">
        <div>
          <Label htmlFor="gps-role">GPS spoof role</Label>
          <Select id="gps-role" value={gpsRole} onChange={(e) => setGpsRole(e.target.value as RoleId)}>
            {roles.map((r) => <option key={r}>{r}</option>)}
          </Select>
        </div>
        <div><Label htmlFor="gps-drift">Drift</Label><Input id="gps-drift" type="number" step={0.5} min={0.5} max={3} value={drift} onChange={(e) => setDrift(Number(e.target.value))} /></div>
        <Button variant="danger" size="sm" disabled={!live} onClick={() => cmd({ type: 'TRIGGER_CYBER', cyber: { kind: 'GPS_SPOOF', role: gpsRole, driftCells: drift, durationS: dur } }, `GPS spoof on ${gpsRole}`)}>
          <Bug size={12} /> Spoof
        </Button>
      </div>
    </div>
  );
}

export function ActiveEffects({ t }: { t: InstructorState }) {
  return (
    <div>
      <SectionTitle>Active effects</SectionTitle>
      {t.effects.length === 0 && <Empty>No injects or cyber effects active.</Empty>}
      <ul className="divide-y divide-line/70">
        {t.effects.map((e) => (
          <li key={e.id} className="px-3 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <Badge tone={e.kind === 'CYBER' ? 'bad' : 'warn'}>{e.type}</Badge>
              <span className="truncate">{e.label}</span>
              <span className="ml-auto font-mono text-muted">until {formatT(e.endMs)}</span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-faint">{e.channels.join(' ')} {e.roles.length ? `→ ${e.roles.join(',')}` : '→ all'}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
