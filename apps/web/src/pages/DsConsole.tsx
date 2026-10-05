import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Activity, Crosshair, Eye, FileBarChart, Gauge, ListChecks, MousePointer2, Pause, Play, Radio, ScrollText, Square, Users, Zap } from 'lucide-react';
import { formatT, type Band, type InstructorState, type RoleId } from '@vanguard/shared';
import { Brand, Toast } from '@/components/shell';
import { ConnDot } from '@/components/status';
import { MapLegend } from '@/components/map/TacticalMap';
import { MapView } from '@/components/map/MapView';
import { truthLayers } from '@/components/map/adapters';
import { ActiveEffects, CyberControls, InjectComposer } from '@/components/ds/InjectComposer';
import { AiAdvisor, AiChip } from '@/components/ds/AiAdvisor';
import { DecisionFeed, JammerList, JournalPanel, MselPanel, RosterPanel, SaCommsPanel } from '@/components/ds/Panels';
import { RoleWorkspace } from '@/components/trainee/RoleWorkspace';
import { Badge, Button, Disclaimer, Input, Label, Panel, SectionTitle, Textarea } from '@/components/ui/primitives';
import { Dialog, Slider, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/radix';
import { loadIdentity } from '@/lib/identity';
import { sendCmd } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { useSession } from '@/store/session';

type Tool = { kind: 'select' } | { kind: 'place' } | { kind: 'move'; jammerId: string };

function Header({ t, code, pin }: { t: InstructorState; code: string; pin?: string }) {
  const { cmd, connected } = useSession();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const probeOpen = t.probes.some((p) => p.endedAtMs === null);
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
      <Brand compact />
      <Badge tone="accent">DS console</Badge>
      <span className="font-mono text-xs text-muted">code <span className="text-ink" data-testid="ds-code">{code}</span>{pin ? ` · PIN ${pin}` : ''}</span>
      <span className="hidden text-xs text-muted xl:inline">{t.scenarioTitle}</span>
      <div className="ml-auto flex items-center gap-2">
        <span className="font-mono text-lg tabular" aria-label={`Exercise time ${formatT(t.tMs)}`}>{formatT(t.tMs)}</span>
        <span className="font-mono text-[10px] text-faint">/ {t.durationMin}:00</span>
        <Badge tone={t.phase === 'RUNNING' ? 'ok' : t.phase === 'PROBE' ? 'accent' : t.phase === 'PAUSED' ? 'warn' : 'neutral'}>{t.phase}</Badge>
        {t.phase === 'LOBBY' && (
          <Button size="sm" variant="primary" onClick={() => cmd({ type: 'START' }, 'Exercise started')}><Play size={13} /> Start exercise</Button>
        )}
        {t.phase === 'RUNNING' && <Button size="sm" onClick={() => cmd({ type: 'PAUSE' })}><Pause size={13} /> Pause</Button>}
        {t.phase === 'PAUSED' && <Button size="sm" onClick={() => cmd({ type: 'RESUME' })}><Play size={13} /> Resume</Button>}
        {(t.phase === 'RUNNING' || t.phase === 'PAUSED') && (
          <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="Sim speed">
            {([1, 2, 4] as const).map((s) => (
              <button key={s} aria-pressed={t.speed === s} onClick={() => cmd({ type: 'SET_SPEED', speed: s })} className={cn('px-2 py-1 font-mono text-xs', t.speed === s ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink')}>
                ×{s}
              </button>
            ))}
          </div>
        )}
        {(t.phase === 'RUNNING' || t.phase === 'PAUSED') && (
          <Button size="sm" variant="outline" onClick={() => cmd({ type: 'START_PROBE' }, 'Freeze — SA probe sent to all roles')}><Eye size={13} /> Freeze &amp; probe</Button>
        )}
        {probeOpen && <Button size="sm" variant="primary" onClick={() => cmd({ type: 'END_PROBE' }, 'Probe scored — exercise resumed')}><Gauge size={13} /> Score &amp; resume</Button>}
        {t.phase !== 'ENDED' && t.phase !== 'LOBBY' && (
          <Button size="sm" variant="danger" onClick={() => setConfirmEnd(true)}><Square size={12} /> End</Button>
        )}
        {t.phase === 'ENDED' && (
          <Link to={`/aar/${code}`} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-accent-ink"><FileBarChart size={13} /> Open AAR</Link>
        )}
        <ConnDot connected={connected} />
      </div>
      <Dialog open={confirmEnd} onOpenChange={setConfirmEnd} title="End the exercise?" description="All trainees are frozen and the after-action review is generated. This cannot be undone.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmEnd(false)}>Cancel</Button>
          <Button variant="danger" onClick={async () => { await cmd({ type: 'END' }, 'Exercise ended — AAR ready'); setConfirmEnd(false); }}>End exercise</Button>
        </div>
      </Dialog>
    </header>
  );
}

function JammerDialog({ cell, onClose }: { cell: string | null; onClose: () => void }) {
  const { cmd } = useSession();
  const [radius, setRadius] = useState(2);
  const [power, setPower] = useState(1);
  const [bands, setBands] = useState<Band[]>(['VHF', 'HF']);
  const [label, setLabel] = useState('');
  return (
    <Dialog open={!!cell} onOpenChange={(o) => !o && onClose()} title={`Place jammer at ${cell ?? ''}`} description="Link degradation is computed from geometry: inner 50% of the effective radius denies, outer 50% degrades (heavy delay + 40% drop).">
      <div className="grid gap-4">
        <div>
          <Label>Radius {radius.toFixed(1)} cells (effective {(radius * power).toFixed(1)})</Label>
          <Slider value={radius * 10} min={5} max={40} step={5} onChange={(v) => setRadius(v / 10)} label="Radius" />
        </div>
        <div>
          <Label>Power ×{power.toFixed(1)}</Label>
          <Slider value={power * 10} min={5} max={15} step={1} onChange={(v) => setPower(v / 10)} label="Power" />
        </div>
        <fieldset>
          <legend className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">Bands</legend>
          <div className="flex gap-3 text-sm">
            {(['VHF', 'UHF', 'HF', 'L', 'SHF'] as Band[]).map((b) => (
              <label key={b} className="flex items-center gap-1">
                <input type="checkbox" className="accent-[var(--color-accent)]" checked={bands.includes(b)} onChange={() => setBands((x) => (x.includes(b) ? x.filter((y) => y !== b) : [...x, b]))} />
                {b}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-faint">VHF: command/platoon nets · HF: HF net · UHF: ground sensors · L: UAV datalink · SHF: SATCOM</p>
        </fieldset>
        <div><Label htmlFor="jam-label">Label</Label><Input id="jam-label" maxLength={60} placeholder="e.g. Hostile jammer north" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
        <Button
          variant="primary"
          disabled={bands.length === 0}
          onClick={async () => {
            const r = await cmd({ type: 'PLACE_JAMMER', jammer: { cell, radius, power, bands, active: true, label: label || undefined } }, `Jammer active at ${cell}`);
            if (r.ok) onClose();
          }}
        >
          <Zap size={14} /> Activate jammer
        </Button>
      </div>
    </Dialog>
  );
}

function LobbyPanel({ t }: { t: InstructorState }) {
  const { cmd, lobby } = useSession();
  const [intent, setIntent] = useState(t.intent.text);
  return (
    <div className="grid gap-4 p-4">
      <Panel>
        <SectionTitle>Lobby — share the session code</SectionTitle>
        <ul className="divide-y divide-line/70 text-sm">
          {(lobby?.roles ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between px-3 py-2">
              <span>{r.title} <span className="font-mono text-xs text-muted">{r.callsign}</span></span>
              {r.taken ? <Badge tone={r.connected ? 'ok' : 'neutral'}>{r.takenBy}{r.connected ? ' · online' : ' · away'}</Badge> : <Badge>waiting</Badge>}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="p-3">
        <Label htmlFor="intent">Commander&apos;s intent (scenario level)</Label>
        <Textarea id="intent" rows={4} value={intent} onChange={(e) => setIntent(e.target.value)} />
        <Button size="sm" className="mt-2" disabled={intent.trim().length < 10 || intent === t.intent.text} onClick={() => cmd({ type: 'SET_INTENT', text: intent }, 'Intent issued to all roles')}>Issue intent</Button>
      </Panel>
    </div>
  );
}

export default function DsConsole() {
  const { code: rawCode = '' } = useParams();
  const code = rawCode.toUpperCase();
  const id = loadIdentity(code);
  const { connect, truth, viewAs, cmd, authError, connected, socket } = useSession();
  const [tool, setTool] = useState<Tool>({ kind: 'select' });
  const [placeCell, setPlaceCell] = useState<string | null>(null);
  const [view, setView] = useState<'truth' | RoleId>('truth');
  const [tab, setTab] = useState('injects');

  useEffect(() => {
    if (id?.actor === 'DS') connect(code, id.token);
  }, [code, id?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // View-as is per-socket server state: (re)send whenever the view or the connection changes.
  useEffect(() => {
    if (connected) void sendCmd(socket, { type: 'VIEW_AS', role: view === 'truth' ? null : view });
  }, [view, connected, socket]);

  const layers = useMemo(() => (truth ? truthLayers(truth) : null), [truth]);

  if (!id || id.actor !== 'DS') return <Navigate to="/ds-login" replace />;
  if (authError) return <div className="p-10 text-center text-sm text-bad">{authError} <Link className="underline" to="/ds-login">Log in with PIN</Link></div>;
  if (!truth || !layers) return <div className="flex h-full items-center justify-center text-sm text-muted" role="status">Connecting to exercise {code}…</div>;

  const onCell = (cell: string) => {
    if (tool.kind === 'place') setPlaceCell(cell);
    if (tool.kind === 'move') {
      void cmd({ type: 'MOVE_JAMMER', jammerId: tool.jammerId, cell }, `Jammer moved to ${cell}`);
      setTool({ kind: 'select' });
    }
  };

  const roles = truth.roles.filter((r) => r.enabled);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header t={truth} code={code} pin={id.pin} />
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel2 px-4 py-1.5 text-xs">
        <span className="text-muted">View:</span>
        <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="View as">
          <button aria-pressed={view === 'truth'} onClick={() => setView('truth')} className={cn('px-2.5 py-1', view === 'truth' ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink')}>Ground truth</button>
          {roles.map((r) => (
            <button key={r.role} aria-pressed={view === r.role} onClick={() => setView(r.role)} className={cn('px-2.5 py-1 font-mono', view === r.role ? 'bg-blue text-bg' : 'text-muted hover:text-ink')}>
              {r.role}{r.cutOff ? ' ✕' : ''}
            </button>
          ))}
        </div>
        {view === 'truth' && (
          <>
            <span className="ml-4 text-muted">Map tool:</span>
            <Button size="xs" variant={tool.kind === 'select' ? 'outline' : 'ghost'} onClick={() => setTool({ kind: 'select' })}><MousePointer2 size={12} /> select</Button>
            <Button size="xs" variant={tool.kind === 'place' ? 'outline' : 'ghost'} onClick={() => setTool({ kind: 'place' })} disabled={truth.phase === 'ENDED'}><Crosshair size={12} /> place jammer</Button>
            {tool.kind === 'move' && <Badge tone="accent">click a cell to move {tool.jammerId}</Badge>}
            {tool.kind === 'place' && <Badge tone="accent">click a cell to place</Badge>}
          </>
        )}
        {view !== 'truth' && <span className="ml-2 text-blue">Showing exactly what {view} sees right now (read-only).</span>}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(400px,36%)]">
        {view === 'truth' ? (
          <section className="flex min-h-[420px] flex-col border-r border-line p-3" aria-label="Ground-truth map">
            <div className="min-h-0 flex-1">
              <MapView
                animMs={Math.round(900 / truth.speed)}
                describeCell={(cell) => truth.links.filter((l) => l.level !== 'CLEAR' && truth.roles.find((r) => r.role === l.a)?.trueCell === cell).map((l) => `${l.a}→${l.b} ${l.channel}: ${l.level}${l.causes.length ? ` (${l.causes.join(', ')})` : ''}`)}
                terrain={truth.terrain}
                features={truth.features}
                objectives={truth.objectives}
                markers={layers.markers}
                jammers={layers.jammers}
                links={layers.links}
                relays={layers.relays}
                pickMode={tool.kind === 'select' ? null : tool.kind}
                onCellClick={onCell}
                ariaLabel="Ground truth map. Arrow keys move between sectors; Enter applies the current map tool."
              />
            </div>
            <div className="mt-2"><MapLegend truth /></div>
          </section>
        ) : viewAs && viewAs.role === view ? (
          <div className="flex min-h-0 flex-col lg:col-span-2">
            <RoleWorkspace p={viewAs} cmd={cmd} readOnly />
          </div>
        ) : (
          <div className="flex items-center justify-center text-sm text-muted lg:col-span-2">Loading {view} picture…</div>
        )}
        <aside hidden={view !== 'truth'} className="flex min-h-0 min-w-0 flex-col bg-panel" aria-label="DS panels">
          {truth.phase === 'LOBBY' ? (
            <LobbyPanel t={truth} />
          ) : (
            <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
              <TabsList>
                <TabsTrigger value="injects"><Zap size={13} aria-hidden /> Injects</TabsTrigger>
                <TabsTrigger value="msel"><ListChecks size={13} aria-hidden /> MSEL</TabsTrigger>
                <TabsTrigger value="decisions"><Activity size={13} aria-hidden /> Decisions{truth.decisions.length > 0 && <span className="font-mono text-[10px] text-muted">{truth.decisions.length}</span>}</TabsTrigger>
                <TabsTrigger value="sa"><Radio size={13} aria-hidden /> SA &amp; comms</TabsTrigger>
                <TabsTrigger value="roster"><Users size={13} aria-hidden /> Roster</TabsTrigger>
                <TabsTrigger value="log"><ScrollText size={13} aria-hidden /> Log</TabsTrigger>
              </TabsList>
              <TabsContent value="injects">
                <SectionTitle right={<AiChip />}>AI inject advisor</SectionTitle>
                <AiAdvisor code={code} live={truth.phase === 'RUNNING' || truth.phase === 'PAUSED'} cmd={cmd} />
                <SectionTitle className="border-t">Live inject composer</SectionTitle>
                <InjectComposer t={truth} cmd={cmd} />
                <SectionTitle className="border-t">Cyber events</SectionTitle>
                <CyberControls t={truth} cmd={cmd} />
                <JammerList t={truth} cmd={cmd} onMove={(jammerId) => { setView('truth'); setTool({ kind: 'move', jammerId }); }} />
                <ActiveEffects t={truth} />
              </TabsContent>
              <TabsContent value="msel"><MselPanel t={truth} cmd={cmd} /></TabsContent>
              <TabsContent value="decisions"><DecisionFeed t={truth} /></TabsContent>
              <TabsContent value="sa"><SaCommsPanel t={truth} /></TabsContent>
              <TabsContent value="roster"><RosterPanel t={truth} cmd={cmd} /></TabsContent>
              <TabsContent value="log"><JournalPanel t={truth} /></TabsContent>
            </Tabs>
          )}
        </aside>
      </div>
      <footer className="shrink-0 border-t border-line px-4 py-1.5"><Disclaimer /></footer>
      <JammerDialog cell={placeCell} onClose={() => { setPlaceCell(null); setTool({ kind: 'select' }); }} />
      <Toast />
    </div>
  );
}
