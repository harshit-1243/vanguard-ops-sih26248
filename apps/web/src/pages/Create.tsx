import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { DEFAULT_SETTINGS, formatT, type CreateSessionResponse, type RoleId, type ScenarioListItem, type SessionSettings } from '@vanguard/shared';
import { PageHeader, PageShell } from '@/components/shell';
import { Badge, Button, Input, Label, Panel, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { saveIdentity } from '@/lib/identity';
import { cn } from '@/lib/utils';

function CopyField({ label, value, testId }: { label: string; value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-stretch gap-2">
        <output data-testid={testId} className="flex-1 border border-accent/50 bg-bg px-5 py-4 font-mono text-[34px] font-medium leading-none tracking-[0.32em] text-accent">
          {value}
        </output>
        <Button
          variant="outline"
          className="h-auto px-4"
          aria-label={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => setCopied(true));
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </Button>
      </div>
    </div>
  );
}

export default function Create() {
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [selected, setSelected] = useState<ScenarioListItem | null>(null);
  const [roles, setRoles] = useState<RoleId[]>([]);
  const [seed, setSeed] = useState('');
  const [course, setCourse] = useState(() => {
    try {
      return localStorage.getItem('vg-course') ?? '';
    } catch {
      return '';
    }
  });
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateSessionResponse | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.scenarios().then(setScenarios).catch((e: Error) => setError(e.message));
  }, []);

  const pick = (s: ScenarioListItem) => {
    setSelected(s);
    setRoles(s.roles.filter((r) => !r.optional).map((r) => r.id));
    setSeed(String(s.defaultSeed));
    setSettings(DEFAULT_SETTINGS);
  };

  const create = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      try {
        localStorage.setItem('vg-course', course.trim());
      } catch {
        /* per-browser convenience only */
      }
      const r = await api.create(selected.id, roles, seed ? Number(seed) : undefined, settings, course);
      saveIdentity(r.code, { token: r.instructorToken, actor: 'DS', pin: r.pin });
      setCreated(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <PageShell>
        <PageHeader kicker="DS · TABLE SET" title="Exercise created." sub="Give trainees the session code. Keep the PIN to open the DS console on another machine." />
        <Panel className="mx-auto max-w-xl p-6">
          <div className="grid gap-5">
            <CopyField label="Session code" value={created.code} testId="session-code" />
            <CopyField label="Instructor PIN" value={created.pin} testId="instructor-pin" />
          </div>
          <Button variant="primary" size="lg" className="mt-6 w-full" onClick={() => navigate(`/ds/${created.code}`)}>
            Open DS console
          </Button>
        </Panel>
      </PageShell>
    );
  }

  return (
    <PageShell wide>
      <PageHeader
        kicker="DS · SET THE TABLE"
        title="Create exercise."
        sub="Pick a scenario, seat the roles, set how thick the fog is — then share the code. All content is synthetic."
        right={<Link to="/scenarios" className="text-sm text-accent underline underline-offset-4">Scenario library →</Link>}
      />
      {error && <p role="alert" className="mb-4 text-sm text-bad">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <ul className="grid content-start gap-3" aria-label="Scenarios">
          <li className="font-mono text-[11.5px] font-medium tracking-[0.16em] text-accent">1. SCENARIO</li>
          {scenarios.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => pick(s)}
                aria-pressed={selected?.id === s.id}
                className={cn('w-full border p-4 text-left transition-colors', selected?.id === s.id ? 'border-accent bg-accent/[0.06] shadow-[inset_3px_0_0_var(--color-accent)]' : 'border-line bg-panel hover:border-muted')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-baseline gap-3">
                    <span className="font-mono text-[10px] tracking-[0.1em] text-faint" aria-hidden>{'ABCDEFGH'[i % 8]}{Math.floor(i / 8) + 1}</span>
                    <span className="font-display text-[19px] font-bold text-head">{s.title}</span>
                  </span>
                  <span className="flex gap-1">{s.custom && <Badge tone="accent">custom</Badge>}<Badge>{s.durationMin} min</Badge></span>
                </div>
                <p className="mt-1 text-xs text-muted">{s.theatre}</p>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted">{s.summary}</p>
                <p className="mt-2 font-mono text-[11px] text-faint">{s.roles.length} roles · {s.mselCount} MSEL injects</p>
              </button>
            </li>
          ))}
        </ul>
        <Panel className="p-5">
          {!selected ? (
            <div className="flex min-h-64 flex-col items-start justify-end gap-2 border border-dashed border-line bg-[repeating-linear-gradient(135deg,var(--color-panel2)_0_8px,var(--color-panel)_8px_16px)] p-5">
              <p className="font-mono text-[11px] tracking-[0.14em] text-faint">2. ROLES · 3. VARIABLES</p>
              <p className="text-sm text-muted">Select a scenario to seat the roles and set the fog.</p>
            </div>
          ) : (
            <div className="grid gap-5">
              <div>
                <h2 className="font-display text-2xl font-bold text-head">{selected.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{selected.summary}</p>
              </div>
              <fieldset>
                <legend className="mb-2 font-mono text-[11.5px] font-medium tracking-[0.16em] text-accent">2. ROLES <span className="text-muted">· {roles.length}/6 in play, min 2</span></legend>
                <div className="grid gap-2">
                  {selected.roles.map((r) => {
                    const on = roles.includes(r.id);
                    const locked = r.id === 'CDR';
                    return (
                      <label key={r.id} className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-3', on ? 'border-line bg-panel2' : 'border-dashed border-line')}>
                        <input
                          type="checkbox"
                          className="mt-1 accent-[var(--color-accent)]"
                          checked={on}
                          disabled={locked}
                          onChange={() => setRoles((prev) => (on ? prev.filter((x) => x !== r.id) : [...prev, r.id]))}
                        />
                        <span>
                          <span className="block text-sm font-medium">
                            {r.title} <span className="font-mono text-xs text-muted">· {r.callsign}</span>
                            {r.optional && <Badge className="ml-2">optional</Badge>}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted">{r.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="grid gap-3">
                <legend className="mb-1 font-mono text-[11.5px] font-medium tracking-[0.16em] text-accent">3. VARIABLES <span className="text-muted">· how thick the fog is</span></legend>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ['ewIntensity', 'EW intensity', [['low', 'Low (×0.75 jammer radius)'], ['normal', 'Normal'], ['high', 'High (×1.3 jammer radius)']]],
                      ['sensorReliability', 'Sensor reliability', [['high', 'High'], ['normal', 'Normal'], ['low', 'Low (more loss & garble)']]],
                      ['commsQuality', 'Comms quality', [['good', 'Good'], ['normal', 'Normal'], ['poor', 'Poor (slower, lossier)']]],
                      ['opfor', 'Enemy (OPFOR)', [['adaptive', 'Adaptive — reacts to you'], ['scripted', 'Scripted only']]],
                    ] as const
                  ).map(([key, label, opts]) => (
                    <div key={key}>
                      <Label htmlFor={`set-${key}`}>{label}</Label>
                      <Select id={`set-${key}`} value={settings[key]} onChange={(e) => setSettings((x) => ({ ...x, [key]: e.target.value }))}>
                        {opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                      </Select>
                    </div>
                  ))}
                </div>
                <details className="rounded-md border border-line p-2">
                  <summary className="cursor-pointer text-xs text-muted">Scripted injects (MSEL) — {selected.msel.length - settings.disabledMsel.length}/{selected.msel.length} on</summary>
                  <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto text-xs">
                    {selected.msel.map((m) => (
                      <li key={m.id}>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" className="accent-[var(--color-accent)]" checked={!settings.disabledMsel.includes(m.id)} onChange={(e) => setSettings((x) => ({ ...x, disabledMsel: e.target.checked ? x.disabledMsel.filter((y) => y !== m.id) : [...x.disabledMsel, m.id] }))} />
                          <span className="font-mono text-muted">{formatT(m.atS * 1000)}</span>
                          <span>{m.title}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </details>
              </fieldset>
              <div className="grid grid-cols-[1fr_10rem] gap-3">
                <div>
                  <Label htmlFor="course">Course / syndicate (for analytics)</Label>
                  <Input id="course" maxLength={60} placeholder="e.g. DSSC-81 Syndicate 4" value={course} onChange={(e) => setCourse(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="seed">Seed (replayable)</Label>
                  <Input id="seed" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>
              <Button variant="primary" size="lg" disabled={busy || roles.length < 2} onClick={create}>
                {busy ? 'Creating…' : 'Create exercise'}
              </Button>
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
