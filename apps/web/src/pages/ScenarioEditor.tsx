import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, Play, Plus, Save, Trash2, XCircle } from 'lucide-react';
import {
  CHANNEL_IDS,
  ROLE_IDS,
  UNIT_TYPES,
  formatT,
  type ChannelId,
  type RoleId,
  type Scenario,
  type ScenarioValidation,
  type TerrainCode,
  type UnitSpec,
} from '@vanguard/shared';
import { AdminGate, AdminNav, OpenModeNote } from '@/components/admin/AdminGate';
import { AreaField, CellField, CheckField, MultiCheck, NumField, SelectField, TextField } from '@/components/editor/fields';
import { GridEditor, TERRAIN_COLOR, TERRAIN_OPTIONS } from '@/components/editor/GridEditor';
import { MselEditor } from '@/components/editor/MselEditor';
import { PageShell } from '@/components/shell';
import { Badge, Button, Panel, SectionTitle, Textarea } from '@/components/ui/primitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/radix';
import { adminApi, saveBlob } from '@/lib/admin';
import { cn } from '@/lib/utils';

type Tool = 'terrain' | 'unit' | 'route' | 'objective' | 'forbidden' | 'sensor' | 'feature';
const BEHAVIOURS = ['scripted', 'reserve', 'defend', 'shoot-and-scoot', 'probe'] as const;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'scenario';

function setTerrain(sc: Scenario, cell: string, code: TerrainCode) {
  const col = 'ABCDEFGH'.indexOf(cell[0]!);
  const row = Number(cell[1]) - 1;
  const r = sc.terrain[row]!;
  sc.terrain[row] = r.slice(0, col) + code + r.slice(col + 1);
}

function newUnit(sc: Scenario, side: 'BLUE' | 'RED'): UnitSpec {
  let n = sc.units.length + 1;
  while (sc.units.some((u) => u.id === `${side === 'BLUE' ? 'b' : 'r'}-unit-${n}`)) n++;
  return {
    id: `${side === 'BLUE' ? 'b' : 'r'}-unit-${n}`,
    side,
    callsign: side === 'BLUE' ? `BLUE ${n}` : `HOSTILE ${n}`,
    type: side === 'BLUE' ? 'INFANTRY' : 'MECH',
    count: 3,
    strength: 100,
    decoy: false,
    behaviour: side === 'RED' ? 'defend' : 'scripted',
    waypoints: [{ atS: 0, cell: side === 'BLUE' ? 'A1' : 'H8' }],
  };
}

/** Validation + save sidebar. */
function ValidationPanel({ v, busy, dirty, onValidate, onSave, saveLabel, canSave, error }: { v: ScenarioValidation | null; busy: boolean; dirty: boolean; onValidate: () => void; onSave: () => void; saveLabel: string; canSave: boolean; error: string | null }) {
  return (
    <Panel className="sticky top-4">
      <SectionTitle right={dirty ? <Badge tone="warn">unsaved</Badge> : <Badge tone="ok">saved</Badge>}>Check &amp; save</SectionTitle>
      <div className="grid gap-3 p-3">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onValidate} disabled={busy}><Play size={13} aria-hidden /> Validate + dry run</Button>
          <Button size="sm" variant="primary" onClick={onSave} disabled={busy || !canSave}><Save size={13} aria-hidden /> {saveLabel}</Button>
        </div>
        {error && <p role="alert" className="text-xs text-bad-ink">{error}</p>}
        {!v ? (
          <p className="text-xs text-muted">Validation checks the schema, flags design problems and runs the whole exercise headlessly (all roles, adaptive enemy, every MSEL item).</p>
        ) : (
          <div className="grid gap-2 text-xs" aria-live="polite">
            <p className={cn('flex items-center gap-1.5 font-medium', v.ok ? 'text-ok' : 'text-bad-ink')}>
              {v.ok ? <CheckCircle2 size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}
              {v.ok ? 'Valid — ready to save' : `${v.issues.length} error(s) — fix before saving`}
            </p>
            {v.issues.map((i, k) => (
              <p key={`i${k}`} className="rounded border border-bad/40 bg-bad/[0.06] px-2 py-1"><span className="font-mono text-bad-ink">{i.path}</span> — {i.message}</p>
            ))}
            {v.warnings.map((w, k) => (
              <p key={`w${k}`} className="flex gap-1.5 rounded border border-warn/40 bg-warn/[0.06] px-2 py-1"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" aria-hidden /><span><span className="font-mono text-muted">{w.path}</span> — {w.message}</span></p>
            ))}
            {v.dryRun && !v.dryRun.error && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded border border-line p-2 font-mono">
                <dt className="text-muted">Simulated</dt><dd>{formatT(v.dryRun.simS * 1000)} in {v.dryRun.ms} ms</dd>
                <dt className="text-muted">MSEL fired</dt><dd>{v.dryRun.mselFired}</dd>
                <dt className="text-muted">Enemy reactions</dt><dd>{v.dryRun.opforReactions}</dd>
                <dt className="text-muted">BLUE / RED left</dt><dd>{v.dryRun.blueStrengthPct}% / {v.dryRun.redStrengthPct}%</dd>
              </dl>
            )}
            {v.dryRun && !v.dryRun.error && <p className="text-[11px] text-faint">Dry run without player decisions — shows the scripted pressure the trainees will face.</p>}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Editor({ open }: { open: boolean }) {
  const { id: editId } = useParams();
  const [search] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [isNew, setIsNew] = useState(!editId);
  const [dirty, setDirty] = useState(false);
  const [v, setV] = useState<ScenarioValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('terrain');
  const [paint, setPaint] = useState<TerrainCode>('F');
  const [unitSel, setUnitSel] = useState<string | null>(null);
  const [sensorSel, setSensorSel] = useState<string | null>(null);
  const [featureSel, setFeatureSel] = useState<string | null>(null);
  const [json, setJson] = useState('');
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [builtinIds, setBuiltinIds] = useState<string[]>([]);

  useEffect(() => {
    void adminApi.scenarios().then((l) => setBuiltinIds(l.filter((s) => !s.custom).map((s) => s.id))).catch(() => {});
    const imported = (location.state as { draft?: Scenario } | null)?.draft;
    if (imported) {
      setDraft(imported);
      setIsNew(true);
      setDirty(true);
      return;
    }
    const src = editId ?? search.get('from') ?? 'iron-bridge';
    adminApi
      .scenario(src)
      .then(({ scenario }) => {
        if (editId) return setDraft(scenario);
        const base = structuredClone(scenario);
        base.id = `${base.id}-copy`;
        base.title = `${base.title} (copy)`.slice(0, 60);
        setDraft(base);
        setDirty(true);
      })
      .catch((e: Error) => setError(e.message));
  }, [editId, search, location.state]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const update = useCallback((fn: (d: Scenario) => void) => {
    setDraft((d) => {
      if (!d) return d;
      const next = structuredClone(d);
      fn(next);
      return next;
    });
    setDirty(true);
    setV(null);
  }, []);

  const validate = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      setV(await adminApi.validate(draft));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.save(draft.id, draft);
      setV(r.validation);
      setDirty(false);
      if (isNew) {
        setIsNew(false);
        navigate(`/scenarios/edit/${draft.id}`, { replace: true });
      }
    } catch (e) {
      const data = (e as { data?: { validation?: ScenarioValidation } }).data;
      if (data?.validation) setV(data.validation);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const blueUnits = useMemo(() => draft?.units.filter((u) => u.side === 'BLUE') ?? [], [draft]);
  if (!draft) {
    return (
      <PageShell wide right={<AdminNav open={open} />}>
        {error ? <p role="alert" className="text-sm text-bad">{error}</p> : <p className="text-sm text-muted">Loading scenario…</p>}
      </PageShell>
    );
  }
  const sc = draft;
  const idTaken = isNew && builtinIds.includes(sc.id);
  const roleUnitIds = new Set(sc.roles.map((r) => r.unitId));
  const selUnit = sc.units.find((u) => u.id === unitSel) ?? null;

  const onCell = (cell: string, shift: boolean) => {
    switch (tool) {
      case 'terrain':
        return update((d) => setTerrain(d, cell, paint));
      case 'unit':
        if (!selUnit) return;
        return update((d) => { d.units.find((u) => u.id === selUnit.id)!.waypoints[0]!.cell = cell; });
      case 'route':
        if (!selUnit) return;
        return update((d) => {
          const u = d.units.find((x) => x.id === selUnit.id)!;
          if (shift) {
            if (u.waypoints.length > 1) u.waypoints.pop();
            return;
          }
          const last = u.waypoints[u.waypoints.length - 1]!;
          u.waypoints.push({ atS: Math.min(last.atS + 300, d.durationMin * 60), cell });
        });
      case 'objective':
        return update((d) => {
          if (d.intent.objectiveCells.includes(cell)) {
            if (d.intent.objectiveCells.length === 1) return;
            d.intent.objectiveCells = d.intent.objectiveCells.filter((c) => c !== cell);
            d.objectives = d.objectives.filter((o) => o.cell !== cell);
          } else {
            d.intent.objectiveCells.push(cell);
            if (!d.objectives.some((o) => o.cell === cell)) d.objectives.push({ id: `obj-${cell.toLowerCase()}`, text: `Objective ${cell}`, cell });
          }
        });
      case 'forbidden':
        return update((d) => {
          d.intent.forbiddenCells = d.intent.forbiddenCells.includes(cell) ? d.intent.forbiddenCells.filter((c) => c !== cell) : [...d.intent.forbiddenCells, cell];
        });
      case 'sensor':
        if (!sensorSel) return;
        return update((d) => { d.sensors.find((s) => s.id === sensorSel)!.cell = cell; });
      case 'feature':
        if (!featureSel) return;
        return update((d) => { d.features.find((f) => f.id === featureSel)!.cell = cell; });
    }
  };
  const hint: Record<Tool, string> = {
    terrain: `Click cells to paint ${TERRAIN_OPTIONS.find(([c]) => c === paint)?.[1]}.`,
    unit: selUnit ? `Click a cell to set where ${selUnit.callsign} starts.` : 'Choose a unit first.',
    route: selUnit ? `Click cells to add waypoints for ${selUnit.callsign} (+5 min each). Shift+click removes the last waypoint.` : 'Choose a unit first.',
    objective: 'Click to add/remove an objective (★). At least one is required.',
    forbidden: 'Click to mark/unmark cells the commander forbids (✕).',
    sensor: sensorSel ? 'Click a cell to move the sensor.' : 'Choose a sensor first.',
    feature: featureSel ? 'Click a cell to move the feature.' : 'Choose a feature first.',
  };

  return (
    <PageShell wide right={<AdminNav open={open} />}>
      <OpenModeNote open={open} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[11.5px] font-medium tracking-[0.16em] text-accent"><Link to="/scenarios" className="text-accent hover:text-ink">SCENARIOS</Link> / {isNew ? 'NEW' : 'EDIT'}</p>
          <h1 className="text-[clamp(26px,3vw,38px)] font-bold leading-tight text-head">{sc.title || 'Untitled scenario'} <span className="font-mono text-sm font-normal tracking-normal text-muted">· {sc.id}</span></h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => saveBlob(new Blob([JSON.stringify(sc, null, 2)], { type: 'application/json' }), `${sc.id}.json`)}>
          <Download size={13} aria-hidden /> Export JSON
        </Button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Tabs defaultValue="overview" onValueChange={(t) => { if (t === 'json') { setJson(JSON.stringify(sc, null, 2)); setJsonErr(null); } }}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="map">Map</TabsTrigger>
            <TabsTrigger value="forces">Forces ({sc.units.length})</TabsTrigger>
            <TabsTrigger value="roles">Roles &amp; intent</TabsTrigger>
            <TabsTrigger value="msel">MSEL ({sc.msel.length})</TabsTrigger>
            <TabsTrigger value="sensors">Sensors ({sc.sensors.length})</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="grid gap-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <TextField label="Scenario id (lowercase, a-z 0-9 -)" mono value={sc.id} max={60} onChange={(x) => isNew && update((d) => { d.id = x.toLowerCase().replace(/[^a-z0-9-]/g, ''); })} />
                {!isNew && <p className="mt-0.5 text-[10px] text-faint">Id is fixed once saved. Export + import to copy under a new id.</p>}
                {idTaken && <p role="alert" className="mt-0.5 text-[11px] text-bad-ink">That id belongs to a built-in scenario — choose another.</p>}
              </div>
              <div className="flex items-end gap-2">
                <TextField className="flex-1" label="Title" value={sc.title} max={60} onChange={(x) => update((d) => { d.title = x; })} />
                {isNew && <Button size="sm" variant="ghost" onClick={() => update((d) => { d.id = slug(d.title); })}>id from title</Button>}
              </div>
              <TextField label="Theatre" value={sc.theatre} max={80} onChange={(x) => update((d) => { d.theatre = x; })} />
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Duration (min)" value={sc.durationMin} min={5} max={180} onChange={(x) => update((d) => { d.durationMin = x ?? 30; })} />
                <NumField label="Default seed" value={sc.defaultSeed} min={0} onChange={(x) => update((d) => { d.defaultSeed = x ?? 1; })} />
              </div>
            </div>
            <AreaField label="Summary (shown when choosing a scenario)" rows={2} max={600} value={sc.summary} onChange={(x) => update((d) => { d.summary = x; })} />
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Orders (5-paragraph brief)</legend>
              {(['situation', 'mission', 'execution', 'sustainment', 'command'] as const).map((k) => (
                <AreaField key={k} label={k} rows={k === 'situation' || k === 'execution' ? 3 : 2} value={sc.brief[k]} onChange={(x) => update((d) => { d.brief[k] = x; })} />
              ))}
            </fieldset>
            <fieldset className="grid grid-cols-3 gap-3">
              <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Air support</legend>
              <NumField label="Available from (s)" value={sc.air.availableFromS} min={0} onChange={(x) => update((d) => { d.air.availableFromS = x ?? 0; })} hint={formatT(sc.air.availableFromS * 1000)} />
              <NumField label="Response (s)" value={sc.air.responseS} min={0} onChange={(x) => update((d) => { d.air.responseS = x ?? 120; })} />
              <NumField label="Sorties" value={sc.air.sorties} min={0} max={10} onChange={(x) => update((d) => { d.air.sorties = x ?? 0; })} />
            </fieldset>
          </TabsContent>

          <TabsContent value="map" className="grid gap-4 pt-4 xl:grid-cols-[1fr_220px]">
            <GridEditor sc={sc} onCell={onCell} selectedUnit={tool === 'unit' || tool === 'route' ? unitSel : null} hint={hint[tool]} />
            <div className="grid content-start gap-3">
              <fieldset>
                <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">Tool</legend>
                <div className="grid grid-cols-2 gap-1">
                  {([['terrain', 'Paint terrain'], ['unit', 'Unit start'], ['route', 'Unit route'], ['objective', 'Objective ★'], ['forbidden', 'Forbidden ✕'], ['sensor', 'Sensor'], ['feature', 'Feature']] as [Tool, string][]).map(([t, l]) => (
                    <button key={t} aria-pressed={tool === t} onClick={() => setTool(t)} className={cn('rounded border px-2 py-1 text-left text-xs', tool === t ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:text-ink')}>{l}</button>
                  ))}
                </div>
              </fieldset>
              {tool === 'terrain' && (
                <fieldset>
                  <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">Terrain</legend>
                  <div className="grid gap-1">
                    {TERRAIN_OPTIONS.map(([code, name]) => (
                      <button key={code} aria-pressed={paint === code} onClick={() => setPaint(code)} className={cn('flex items-center gap-2 rounded border px-2 py-1 text-xs', paint === code ? 'border-accent' : 'border-line')}>
                        <span className="inline-block h-4 w-6 rounded-sm border border-line" style={{ background: TERRAIN_COLOR[code] }} aria-hidden />
                        <span className="font-mono">{code}</span> {name}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {(tool === 'unit' || tool === 'route') && (
                <>
                  <SelectField label="Unit" value={unitSel ?? undefined} allowEmpty="(choose)" options={sc.units.map((u) => [u.id, `${u.side === 'BLUE' ? '🔵' : '🔴'} ${u.callsign}`] as const)} onChange={(x) => setUnitSel(x ?? null)} />
                  {selUnit && (
                    <ol className="grid gap-1 text-xs">
                      {selUnit.waypoints.map((w, k) => (
                        <li key={k} className="flex items-center gap-1">
                          <span className="w-10 font-mono text-muted">{k === 0 ? 'start' : k}</span>
                          <span className="w-8 font-mono">{w.cell}</span>
                          {k > 0 ? (
                            <input aria-label={`Waypoint ${k} time (s)`} type="number" min={0} className="h-6 w-20 rounded border border-line bg-bg px-1 font-mono" value={w.atS} onChange={(e) => update((d) => { d.units.find((u) => u.id === selUnit.id)!.waypoints[k]!.atS = Number(e.target.value) || 0; })} />
                          ) : <span className="text-faint">0 s</span>}
                          {k > 0 && <button aria-label={`Remove waypoint ${k}`} className="text-muted hover:text-bad" onClick={() => update((d) => { d.units.find((u) => u.id === selUnit.id)!.waypoints.splice(k, 1); })}><Trash2 size={12} /></button>}
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
              {tool === 'sensor' && <SelectField label="Sensor" value={sensorSel ?? undefined} allowEmpty="(choose)" options={sc.sensors.map((s) => [s.id, s.label] as const)} onChange={(x) => setSensorSel(x ?? null)} />}
              {tool === 'feature' && <SelectField label="Feature" value={featureSel ?? undefined} allowEmpty="(choose)" options={sc.features.map((f) => [f.id, `${f.kind} · ${f.label}`] as const)} onChange={(x) => setFeatureSel(x ?? null)} />}
              <p className="text-[11px] leading-relaxed text-faint">Legend: ★ objective · ✕ forbidden · ◉ sensor (dotted = range) · ◆ feature · dashed red circle = MSEL jammer · unit boxes BLUE/RED (dashed = decoy).</p>
            </div>
          </TabsContent>

          <TabsContent value="forces" className="grid gap-3 pt-4">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => update((d) => { d.units.push(newUnit(d, 'BLUE')); })}><Plus size={13} aria-hidden /> BLUE unit</Button>
              <Button size="sm" variant="outline" onClick={() => update((d) => { d.units.push(newUnit(d, 'RED')); })}><Plus size={13} aria-hidden /> Enemy unit</Button>
            </div>
            {sc.units.map((u, i) => {
              const set = (patch: Partial<UnitSpec>) => update((d) => { d.units[i] = { ...d.units[i]!, ...patch }; });
              const bound = roleUnitIds.has(u.id);
              return (
                <Panel key={`${u.id}-${i}`} className={cn('border-l-4 p-3', u.side === 'BLUE' ? 'border-l-blue' : 'border-l-red')}>
                  <div className="grid gap-3 sm:grid-cols-6">
                    <TextField className="sm:col-span-2" label="Callsign" value={u.callsign} max={40} onChange={(x) => set({ callsign: x })} />
                    <TextField label="Id" mono value={u.id} max={40} onChange={(x) => {
                      if (bound) return;
                      set({ id: x });
                    }} />
                    <SelectField label="Side" value={u.side} options={['BLUE', 'RED'] as const} onChange={(x) => x && !bound && set({ side: x })} />
                    <SelectField label="Type" value={u.type} options={UNIT_TYPES} onChange={(x) => x && set({ type: x })} />
                    <CellField label="Start" value={u.waypoints[0]!.cell} onChange={(x) => x && update((d) => { d.units[i]!.waypoints[0]!.cell = x; })} />
                    <NumField label="Count" value={u.count} min={0} max={99} onChange={(x) => set({ count: x ?? 0 })} />
                    <NumField label="Strength" value={u.strength} min={0} max={400} onChange={(x) => set({ strength: x ?? 0 })} hint="≈100 = full company" />
                    <NumField label="Speed (cells/min)" value={u.speed} min={0} max={5} step={0.1} onChange={(x) => set({ speed: x })} hint="blank = by type" />
                    <NumField label="Sight (cells)" value={u.visualRangeCells} min={0} max={4} step={0.5} onChange={(x) => set({ visualRangeCells: x })} hint="blank = default" />
                    {u.side === 'RED' ? (
                      <SelectField className="sm:col-span-2" label="Enemy behaviour (adaptive OPFOR)" value={u.behaviour} options={BEHAVIOURS} onChange={(x) => x && set({ behaviour: x })} />
                    ) : (
                      <SelectField className="sm:col-span-2" label="Owner role" value={u.ownerRole} allowEmpty="(none)" options={sc.roles.map((r) => r.id)} onChange={(x) => set({ ownerRole: x })} />
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-4">
                      <CheckField label="Decoy (zero strength, fools non-discriminating sensors)" checked={u.decoy} onChange={(x) => set({ decoy: x, ...(x ? { strength: 0 } : {}) })} />
                      <span className="text-xs text-muted">{u.waypoints.length - 1} waypoint(s) — edit on the Map tab</span>
                    </div>
                    {bound ? <Badge>played by {sc.roles.find((r) => r.unitId === u.id)!.id}</Badge> : (
                      <Button size="xs" variant="ghost" aria-label={`Delete ${u.callsign}`} onClick={() => update((d) => { d.units.splice(i, 1); })}><Trash2 size={13} /> Delete</Button>
                    )}
                  </div>
                </Panel>
              );
            })}
          </TabsContent>

          <TabsContent value="roles" className="grid gap-4 pt-4">
            <fieldset className="grid gap-3 rounded-lg border border-line p-3">
              <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Commander's intent</legend>
              <AreaField label="Intent text" rows={3} max={600} value={sc.intent.text} onChange={(x) => update((d) => { d.intent.text = x; })} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SelectField label="Priority" value={sc.intent.priority} options={['SEIZE', 'DEFEND', 'PRESERVE'] as const} onChange={(x) => x && update((d) => { d.intent.priority = x; })} />
                <NumField label="Deadline (s)" value={sc.intent.deadlineS} min={60} onChange={(x) => update((d) => { d.intent.deadlineS = x ?? 600; })} hint={formatT(sc.intent.deadlineS * 1000)} />
                <div className="col-span-2 text-xs text-muted">
                  <p>Objective cells: <span className="font-mono text-ink">{sc.intent.objectiveCells.join(', ')}</span></p>
                  <p>Forbidden: <span className="font-mono text-ink">{sc.intent.forbiddenCells.join(', ') || '—'}</span></p>
                  <p className="text-faint">Set both on the Map tab.</p>
                </div>
              </div>
              {sc.objectives.map((o, i) => (
                <div key={`${o.id}-${i}`} className="grid grid-cols-[120px_80px_1fr_auto] items-end gap-2">
                  <TextField label="Objective id" mono value={o.id} onChange={(x) => update((d) => { d.objectives[i]!.id = x; })} />
                  <CellField label="Cell" value={o.cell} onChange={(x) => x && update((d) => { d.objectives[i]!.cell = x; })} />
                  <TextField label="Text" value={o.text} onChange={(x) => update((d) => { d.objectives[i]!.text = x; })} />
                  <Button size="xs" variant="ghost" disabled={sc.objectives.length === 1} aria-label={`Delete objective ${o.id}`} onClick={() => update((d) => { d.objectives.splice(i, 1); })}><Trash2 size={13} /></Button>
                </div>
              ))}
            </fieldset>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Add role:</span>
              {ROLE_IDS.filter((r) => !sc.roles.some((x) => x.id === r)).map((r) => (
                <Button key={r} size="sm" variant="outline" disabled={sc.roles.length >= 6} onClick={() => update((d) => {
                  const u = newUnit(d, 'BLUE');
                  u.callsign = `${r} UNIT`;
                  u.ownerRole = r;
                  d.units.push(u);
                  d.roles.push({ id: r, title: r, callsign: `${r} 1`, superior: 'CDR', unitId: u.id, pace: ['CMD_NET', 'HF_NET', 'SATCOM', 'RUNNER'], optional: true, description: '' });
                })}><Plus size={13} aria-hidden /> {r}</Button>
              ))}
            </div>
            {sc.roles.map((r, i) => {
              const set = (fn: (x: Scenario['roles'][number]) => void) => update((d) => fn(d.roles[i]!));
              return (
                <Panel key={r.id} className="p-3">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="flex items-end gap-2"><Badge tone="blue" className="mb-2">{r.id}</Badge></div>
                    <TextField label="Title" value={r.title} max={60} onChange={(x) => set((y) => { y.title = x; })} />
                    <TextField label="Callsign" value={r.callsign} max={30} onChange={(x) => set((y) => { y.callsign = x; })} />
                    <SelectField label="Reports to" value={r.superior} options={['HHQ', ...sc.roles.filter((x) => x.id !== r.id).map((x) => x.id)] as const} onChange={(x) => x && set((y) => { y.superior = x as RoleId | 'HHQ'; })} />
                    <SelectField label="Unit" value={r.unitId} options={blueUnits.map((u) => [u.id, u.callsign] as const)} onChange={(x) => x && set((y) => { y.unitId = x; })} />
                    {[0, 1, 2, 3].map((k) => (
                      <SelectField key={k} label={['Primary', 'Alternate', 'Contingency', 'Emergency'][k]!} value={r.pace[k]} options={CHANNEL_IDS} onChange={(x) => x && set((y) => { y.pace[k] = x as ChannelId; })} />
                    ))}
                    <AreaField className="sm:col-span-3" label="Description" rows={2} max={400} value={r.description} onChange={(x) => set((y) => { y.description = x; })} />
                    <div className="flex flex-col justify-end gap-2">
                      <CheckField label="Optional role" checked={r.optional} onChange={(x) => set((y) => { y.optional = x; })} />
                      {r.id !== 'CDR' && (
                        <Button size="xs" variant="ghost" onClick={() => update((d) => {
                          d.roles.splice(i, 1);
                          d.probeBank = d.probeBank.filter((p) => !(p.kind === 'FRIENDLY_LOCATION' && p.role === r.id));
                        })}><Trash2 size={13} aria-hidden /> Remove role</Button>
                      )}
                    </div>
                  </div>
                </Panel>
              );
            })}
          </TabsContent>

          <TabsContent value="msel" className="pt-4">
            <p className="mb-3 text-xs text-muted">Scripted friction the DS can still switch off per exercise. Times are seconds from start; the dry run shows how many fire.</p>
            <MselEditor sc={sc} update={update} />
          </TabsContent>

          <TabsContent value="sensors" className="grid gap-3 pt-4">
            {sc.sensors.length === 0 && <p className="text-sm text-muted">No sensors. Add them in the JSON tab.</p>}
            {sc.sensors.map((s, i) => {
              const set = (fn: (x: Scenario['sensors'][number]) => void) => update((d) => fn(d.sensors[i]!));
              return (
                <Panel key={s.id} className="p-3">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <TextField label="Label" value={s.label} max={60} onChange={(x) => set((y) => { y.label = x; })} />
                    <SelectField label="Kind" value={s.kind} options={['UAV', 'GROUND_SENSOR', 'COASTAL_RADAR', 'OP'] as const} onChange={(x) => x && set((y) => { y.kind = x; })} />
                    <SelectField label="Feed channel" value={s.channel} options={CHANNEL_IDS} onChange={(x) => x && set((y) => { y.channel = x; })} />
                    <CellField label="Cell" value={s.cell} onChange={(x) => x && set((y) => { y.cell = x; })} />
                    <NumField label="Range (cells)" value={s.rangeCells} min={0.5} max={6} step={0.5} onChange={(x) => set((y) => { y.rangeCells = x ?? 1; })} />
                    <NumField label="Report every (s)" value={s.intervalS} min={10} max={600} onChange={(x) => set((y) => { y.intervalS = x ?? 60; })} />
                    <NumField label="Active from (s)" value={s.activeFromS} min={0} onChange={(x) => set((y) => { y.activeFromS = x ?? 0; })} />
                    <div className="grid content-end gap-1">
                      <CheckField label="Sees through decoys" checked={s.discriminatesDecoys} onChange={(x) => set((y) => { y.discriminatesDecoys = x; })} />
                      <CheckField label="Reports 'no contact'" checked={s.reportsNegatives} onChange={(x) => set((y) => { y.reportsNegatives = x; })} />
                    </div>
                    <MultiCheck className="sm:col-span-4" label="Delivers to" options={sc.roles.map((r) => r.id)} value={s.deliverTo} onChange={(x) => set((y) => { y.deliverTo = x as RoleId[]; })} />
                  </div>
                </Panel>
              );
            })}
            <p className="text-xs text-faint">Communication nodes, channel tuning, scripted reports and the SA probe bank ({sc.probeBank.length} questions) are edited in the JSON tab.</p>
          </TabsContent>

          <TabsContent value="json" className="grid gap-2 pt-4">
            <p className="text-xs text-muted">Full scenario — every field, including nodes, channels, scripted reports and the probe bank. Apply, then validate.</p>
            <Textarea aria-label="Scenario JSON" rows={28} spellCheck={false} className="font-mono text-[11px] leading-snug" value={json} onChange={(e) => setJson(e.target.value)} />
            {jsonErr && <p role="alert" className="text-xs text-bad-ink">{jsonErr}</p>}
            <div>
              <Button size="sm" variant="outline" onClick={() => {
                try {
                  const parsed = JSON.parse(json) as Scenario;
                  if (!isNew && parsed.id !== sc.id) throw new Error(`Id must stay "${sc.id}" when editing a saved scenario`);
                  setDraft(parsed);
                  setDirty(true);
                  setV(null);
                  setJsonErr(null);
                } catch (e) {
                  setJsonErr((e as Error).message);
                }
              }}>Apply JSON</Button>
            </div>
          </TabsContent>
        </Tabs>
        <ValidationPanel v={v} busy={busy} dirty={dirty} error={error} onValidate={validate} onSave={save} canSave={!idTaken && !!sc.id} saveLabel={isNew ? 'Save new' : 'Save'} />
      </div>
    </PageShell>
  );
}

export default function ScenarioEditor() {
  return <AdminGate>{(open) => <Editor open={open} />}</AdminGate>;
}
