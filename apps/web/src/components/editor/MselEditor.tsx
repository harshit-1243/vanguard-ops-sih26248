import { Copy, Plus, Trash2 } from 'lucide-react';
import {
  BANDS,
  CHANNEL_IDS,
  CYBER_KINDS,
  INJECT_TYPES,
  UNIT_TYPES,
  formatT,
  type MselAction,
  type MselItem,
  type RoleId,
  type Scenario,
} from '@vanguard/shared';
import { Badge, Button, Panel } from '@/components/ui/primitives';
import { AreaField, CellField, CheckField, MultiCheck, NumField, SelectField, TextField } from './fields';

type Kind = MselAction['kind'];

export function defaultAction(kind: Kind, sc: Scenario): MselAction {
  const cell = sc.intent.objectiveCells[0] ?? 'D4';
  switch (kind) {
    case 'INJECT':
      return { kind, inject: { type: 'DELAY', channels: ['CMD_NET'], roles: [], durationS: 120, params: { delayS: 60 } } };
    case 'JAMMER':
      return { kind, jammer: { id: `jam-${Date.now().toString(36).slice(-4)}`, label: 'Hostile jammer', cell, radius: 1.5, bands: ['VHF'], power: 1, active: true } };
    case 'JAMMER_TOGGLE':
      return { kind, jammerId: jammerIds(sc)[0] ?? '', active: false };
    case 'CYBER':
      return { kind, cyber: { kind: 'C2_OUTAGE', durationS: 120 } };
    case 'REPORT': {
      const from = sc.nodes[0]?.id ?? sc.sensors[0]?.id ?? '';
      return { kind, report: { from, fromLabel: 'HHQ', channel: 'CMD_NET', to: ['CDR'], kind: 'CONTACT', cell, unitType: 'ARMOUR', count: 3, confidence: 'M', text: `CONTACT. Hostile armour at GRID ${cell}.` } };
    }
  }
}

const jammerIds = (sc: Scenario) => sc.msel.flatMap((m) => (m.action.kind === 'JAMMER' ? [m.action.jammer.id] : []));

function ActionForm({ a, set, sc }: { a: MselAction; set: (a: MselAction) => void; sc: Scenario }) {
  const roles = sc.roles.map((r) => r.id);
  switch (a.kind) {
    case 'INJECT': {
      const i = a.inject;
      const up = (patch: Partial<typeof i>) => set({ ...a, inject: { ...i, ...patch } });
      const p = i.params;
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Inject type" value={i.type} options={INJECT_TYPES} onChange={(v) => v && up({ type: v })} />
          <NumField label="Duration (s)" value={i.durationS} min={5} max={7200} onChange={(v) => up({ durationS: v ?? 60 })} />
          <TextField label="Label" value={i.label ?? ''} max={120} onChange={(v) => up({ label: v || undefined })} />
          <MultiCheck className="sm:col-span-3" label="Channels" options={CHANNEL_IDS} value={i.channels} onChange={(v) => up({ channels: v })} />
          <MultiCheck className="sm:col-span-3" label="Roles affected (none = all on those channels)" options={roles} value={i.roles} onChange={(v) => up({ roles: v as RoleId[] })} />
          {i.type === 'DELAY' && <NumField label="Delay (s)" value={p.delayS} min={1} max={1800} onChange={(v) => up({ params: { ...p, delayS: v } })} />}
          {i.type === 'INTERMITTENT' && <NumField label="Period (s)" value={p.periodS} min={4} max={600} onChange={(v) => up({ params: { ...p, periodS: v } })} />}
          {i.type === 'STALE' && <NumField label="Staleness (s)" value={p.staleS} min={30} max={3600} onChange={(v) => up({ params: { ...p, staleS: v } })} />}
          {(i.type === 'CONFLICT' || i.type === 'SPOOF') && <CellField label="Target cell" value={p.targetCell} allowEmpty="(auto)" onChange={(v) => up({ params: { ...p, targetCell: v } })} />}
        </div>
      );
    }
    case 'JAMMER': {
      const j = a.jammer;
      const up = (patch: Partial<typeof j>) => set({ ...a, jammer: { ...j, ...patch } });
      return (
        <div className="grid gap-3 sm:grid-cols-4">
          <TextField label="Jammer id" mono value={j.id} max={40} onChange={(v) => up({ id: v })} />
          <TextField label="Label" value={j.label ?? ''} max={60} onChange={(v) => up({ label: v || undefined })} />
          <CellField label="Cell" value={j.cell} onChange={(v) => v && up({ cell: v })} />
          <NumField label="Radius (cells)" value={j.radius} min={0.5} max={4} step={0.25} onChange={(v) => up({ radius: v ?? 1 })} />
          <NumField label="Power" value={j.power} min={0.5} max={1.5} step={0.1} onChange={(v) => up({ power: v ?? 1 })} />
          <MultiCheck className="sm:col-span-2" label="Bands" options={BANDS.filter((b) => b !== 'NONE')} value={j.bands} onChange={(v) => up({ bands: v as typeof j.bands })} />
          <CheckField label="Active when placed" checked={j.active} onChange={(v) => up({ active: v })} />
        </div>
      );
    }
    case 'JAMMER_TOGGLE':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Jammer" value={a.jammerId} options={jammerIds(sc)} allowEmpty="(choose)" onChange={(v) => set({ ...a, jammerId: v ?? '' })} />
          <CheckField label="Switch on (unchecked = off)" checked={a.active} onChange={(v) => set({ ...a, active: v })} />
        </div>
      );
    case 'CYBER': {
      const c = a.cyber;
      const up = (patch: Partial<typeof c>) => set({ ...a, cyber: { ...c, ...patch } });
      return (
        <div className="grid gap-3 sm:grid-cols-4">
          <SelectField label="Effect" value={c.kind} options={CYBER_KINDS} onChange={(v) => v && up({ kind: v })} />
          <NumField label="Duration (s)" value={c.durationS} min={10} max={3600} onChange={(v) => up({ durationS: v ?? 60 })} />
          <SelectField label="Role (GPS spoof)" value={c.role} options={roles} allowEmpty="(none)" onChange={(v) => up({ role: v })} />
          {c.kind === 'GPS_SPOOF' && <NumField label="Drift (cells)" value={c.driftCells} min={0.5} max={3} step={0.5} onChange={(v) => up({ driftCells: v })} />}
        </div>
      );
    }
    case 'REPORT': {
      const r = a.report;
      const up = (patch: Partial<typeof r>) => set({ ...a, report: { ...r, ...patch } });
      const sources = [...sc.nodes.map((n) => n.id), ...sc.sensors.map((s) => s.id)];
      return (
        <div className="grid gap-3 sm:grid-cols-4">
          <SelectField label="From (node / sensor)" value={r.from} options={sources} onChange={(v) => v && up({ from: v })} />
          <TextField label="From label" value={r.fromLabel} max={60} onChange={(v) => up({ fromLabel: v })} />
          <SelectField label="Channel" value={r.channel} options={CHANNEL_IDS} onChange={(v) => v && up({ channel: v })} />
          <SelectField label="Kind" value={r.kind} options={['CONTACT', 'NEGATIVE', 'INFO'] as const} onChange={(v) => v && up({ kind: v })} />
          <CellField label="Cell" value={r.cell} allowEmpty="(none)" onChange={(v) => up({ cell: v })} />
          <SelectField label="Unit type" value={r.unitType} options={UNIT_TYPES} allowEmpty="(none)" onChange={(v) => up({ unitType: v })} />
          <NumField label="Count" value={r.count} min={0} max={99} onChange={(v) => up({ count: v })} />
          <SelectField label="Confidence" value={r.confidence} options={['H', 'M', 'L'] as const} onChange={(v) => v && up({ confidence: v })} />
          <MultiCheck className="sm:col-span-4" label="Deliver to" options={roles} value={r.to} onChange={(v) => up({ to: v as RoleId[] })} />
          <AreaField className="sm:col-span-4" label="Report text" rows={2} max={400} value={r.text} onChange={(v) => up({ text: v })} />
        </div>
      );
    }
  }
}

/** MSEL (master scenario events list) timeline editor. */
export function MselEditor({ sc, update }: { sc: Scenario; update: (fn: (d: Scenario) => void) => void }) {
  const items = sc.msel.map((m, i) => ({ m, i })).sort((a, b) => a.m.atS - b.m.atS);
  const nextId = () => {
    for (let n = sc.msel.length + 1; ; n++) if (!sc.msel.some((m) => m.id === `M${n}`)) return `M${n}`;
  };
  const add = (kind: Kind) =>
    update((d) => {
      const last = Math.max(0, ...d.msel.map((m) => m.atS));
      d.msel.push({ id: nextId(), atS: Math.min(last + 120, d.durationMin * 60), title: `New ${kind.toLowerCase().replace('_', ' ')}`, action: defaultAction(kind, d) });
    });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Add:</span>
        {(['INJECT', 'JAMMER', 'JAMMER_TOGGLE', 'CYBER', 'REPORT'] as Kind[]).map((k) => (
          <Button key={k} size="sm" variant="outline" onClick={() => add(k)}><Plus size={13} aria-hidden /> {k.replace('_', ' ')}</Button>
        ))}
      </div>
      {items.length === 0 && <p className="text-sm text-muted">No scripted events yet.</p>}
      {items.map(({ m, i }) => {
        const set = (patch: Partial<MselItem>) => update((d) => { d.msel[i] = { ...d.msel[i]!, ...patch }; });
        return (
          <Panel key={`${m.id}-${i}`} className="p-3">
            <div className="grid gap-3 sm:grid-cols-[90px_110px_1fr_auto] sm:items-end">
              <TextField label="Id" mono value={m.id} max={20} onChange={(v) => set({ id: v })} />
              <NumField label={`At (s) · ${formatT(m.atS * 1000)}`} value={m.atS} min={0} onChange={(v) => set({ atS: v ?? 0 })} />
              <TextField label="Title" value={m.title} max={120} onChange={(v) => set({ title: v })} />
              <div className="flex items-center gap-1">
                <Badge tone="accent">{m.action.kind.replace('_', ' ')}</Badge>
                <Button size="xs" variant="ghost" aria-label={`Duplicate ${m.id}`} onClick={() => update((d) => { d.msel.push({ ...structuredClone(m), id: nextId(), atS: m.atS + 60 }); })}><Copy size={13} /></Button>
                <Button size="xs" variant="ghost" aria-label={`Delete ${m.id}`} onClick={() => update((d) => { d.msel.splice(i, 1); })}><Trash2 size={13} /></Button>
              </div>
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <ActionForm a={m.action} sc={sc} set={(a) => set({ action: a })} />
            </div>
            <div className="mt-3">
              <TextField label="DS note (optional)" value={m.note ?? ''} max={400} onChange={(v) => set({ note: v || undefined })} />
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
