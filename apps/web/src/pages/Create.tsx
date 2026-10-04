import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import type { CreateSessionResponse, RoleId, ScenarioSummary } from '@vanguard/shared';
import { PageShell } from '@/components/shell';
import { Badge, Button, Input, Label, Panel } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { saveIdentity } from '@/lib/identity';
import { cn } from '@/lib/utils';

function CopyField({ label, value, testId }: { label: string; value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <output data-testid={testId} className="flex-1 rounded-md border border-line bg-bg px-4 py-3 font-mono text-2xl tracking-[0.3em] text-accent">
          {value}
        </output>
        <Button
          variant="outline"
          aria-label={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => setCopied(true));
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </Button>
      </div>
    </div>
  );
}

export default function Create() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [selected, setSelected] = useState<ScenarioSummary | null>(null);
  const [roles, setRoles] = useState<RoleId[]>([]);
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateSessionResponse | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.scenarios().then(setScenarios).catch((e: Error) => setError(e.message));
  }, []);

  const pick = (s: ScenarioSummary) => {
    setSelected(s);
    setRoles(s.roles.filter((r) => !r.optional).map((r) => r.id));
    setSeed(String(s.defaultSeed));
  };

  const create = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.create(selected.id, roles, seed ? Number(seed) : undefined);
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
        <Panel className="mx-auto max-w-lg p-6">
          <h1 className="text-lg font-semibold">Exercise created</h1>
          <p className="mt-1 text-sm text-muted">Give trainees the session code. Keep the PIN to open the DS console on another machine.</p>
          <div className="mt-6 grid gap-4">
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
      <h1 className="text-xl font-semibold">Create exercise</h1>
      <p className="mt-1 text-sm text-muted">Choose a scenario template. All content is synthetic.</p>
      {error && <p role="alert" className="mt-4 text-sm text-bad">{error}</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <ul className="grid content-start gap-3" aria-label="Scenarios">
          {scenarios.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => pick(s)}
                aria-pressed={selected?.id === s.id}
                className={cn('w-full rounded-lg border p-4 text-left transition-colors', selected?.id === s.id ? 'border-accent bg-accent/[0.06]' : 'border-line bg-panel hover:border-muted')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{s.title}</span>
                  <Badge>{s.durationMin} min</Badge>
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
            <p className="text-sm text-muted">Select a scenario to configure it.</p>
          ) : (
            <div className="grid gap-5">
              <div>
                <h2 className="text-lg font-semibold">{selected.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{selected.summary}</p>
              </div>
              <fieldset>
                <legend className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Roles in play ({roles.length}/6, min 2)</legend>
                <div className="grid gap-2">
                  {selected.roles.map((r) => {
                    const on = roles.includes(r.id);
                    const locked = r.id === 'CDR';
                    return (
                      <label key={r.id} className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-3', on ? 'border-line bg-panel2' : 'border-line/60 opacity-70')}>
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
              <div className="max-w-40">
                <Label htmlFor="seed">Seed (replayable)</Label>
                <Input id="seed" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} />
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
