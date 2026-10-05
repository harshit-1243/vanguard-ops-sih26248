import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileJson, FileSpreadsheet, FileText, Sparkles } from 'lucide-react';
import { formatT, type AarReport, type RoleId } from '@vanguard/shared';
import { Brand } from '@/components/shell';
import { BarList, MetricCell, NetworkGraph, Swimlanes } from '@/components/aar/Charts';
import { DecisionCard } from '@/components/aar/DecisionCard';
import { ReplayPlayer } from '@/components/aar/ReplayPlayer';
import { AiChip } from '@/components/ds/AiAdvisor';
import { Heatmap } from '@/components/ds/Panels';
import { Badge, Disclaimer, Panel, SectionTitle } from '@/components/ui/primitives';
import { api, type ApiError } from '@/lib/api';
import { loadIdentity } from '@/lib/identity';
import { cn, num, pct } from '@/lib/utils';

function Section({ id, n, title, children }: { id: string; n?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="min-w-0 scroll-mt-16" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="mb-4 flex items-baseline gap-3 border-b border-line pb-2 text-lg font-semibold">
        {n && <span className="font-mono text-accent">{n}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Aar() {
  const { code: raw = '' } = useParams();
  const code = raw.toUpperCase();
  const id = loadIdentity(code);
  const [aar, setAar] = useState<AarReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleId | 'ALL'>('ALL');
  const [revealAll, setRevealAll] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<AarReport>(`/api/sessions/${code}/aar`, id.token)
      .then(setAar)
      .catch((e: ApiError) => setError(e.status === 403 ? 'The AAR opens for trainees once the DS ends the exercise.' : e.message));
  }, [code, id?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const decisions = useMemo(() => (aar ? aar.q3.decisions.filter((d) => roleFilter === 'ALL' || d.role === roleFilter) : []), [aar, roleFilter]);

  if (!id) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Panel className="max-w-md p-6 text-sm">
          <p>Open the AAR from your DS console or trainee tab, or log in as Directing Staff.</p>
          <Link to="/ds-login" className="mt-4 inline-block rounded bg-accent px-3 py-1.5 font-semibold text-accent-ink">DS login</Link>
        </Panel>
      </div>
    );
  }
  if (error) return <div className="p-10 text-center text-sm text-bad" role="alert">{error}</div>;
  if (!aar) return <div className="p-10 text-center text-sm text-muted" role="status">Building the after-action review from the event log…</div>;

  const dl = (path: string) => `/api/sessions/${code}/${path}?token=${encodeURIComponent(id.token)}`;
  const t = aar.q3.team;
  const roles = aar.meta.roles.map((r) => r.role);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-panel/95 px-5 backdrop-blur">
        <Brand compact />
        <span className="font-mono text-xs text-muted">AAR · {aar.meta.scenarioTitle} · {code}</span>
        <nav className="ml-4 hidden gap-3 text-xs text-muted lg:flex" aria-label="AAR sections">
          {[['exec', 'Summary'], ['q1', '1 · Plan'], ['q2', '2 · Happened'], ['q3', '3 · Why'], ['q4', '4 · Sustain/Improve']].map(([h, l]) => (
            <a key={h} href={`#${h}`} className="hover:text-ink">{l}</a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <AiChip />
          <a href={dl('aar.pdf')} download className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-accent-ink" data-testid="export-pdf"><FileText size={13} /> PDF</a>
          <a href={dl('events.json')} download className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs hover:border-muted"><FileJson size={13} /> JSON</a>
          <a href={dl('decisions.csv')} download className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs hover:border-muted"><FileSpreadsheet size={13} /> CSV</a>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-5 py-8">
        <div className="rounded border border-accent/40 bg-accent/[0.06] px-3 py-2 text-xs text-accent">{aar.disclaimer}</div>

        <Section id="exec" title="Executive summary">
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="p-4 lg:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Objective</p>
              <p className="mt-1 text-sm">{aar.exec.objective}</p>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Outcome</p>
              <p className="mt-1 text-sm">{aar.exec.outcome}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {aar.q2.outcome.objectives.map((o) => <Badge key={o.id} tone={o.held ? 'ok' : 'bad'}>{o.cell} {o.held ? 'held ✓' : 'not held ✕'}</Badge>)}
              </div>
            </Panel>
            <Panel className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ok">Top sustains</p>
              <ul className="mt-2 grid gap-2 text-sm">{aar.exec.sustain.map((s, i) => <li key={i}>▲ {s}</li>)}{aar.exec.sustain.length === 0 && <li className="text-muted">None identified.</li>}</ul>
            </Panel>
            <Panel className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-bad">Top improves</p>
              <ul className="mt-2 grid gap-2 text-sm">{aar.exec.improve.map((s, i) => <li key={i}>▼ {s}</li>)}{aar.exec.improve.length === 0 && <li className="text-muted">None identified.</li>}</ul>
            </Panel>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4 lg:grid-cols-8">
            {[
              ['Decisions', String(t.decisions)],
              ['Sound', `${t.soundCounts.SOUND}`],
              ['Brier', num(t.brier)],
              ['Over-conf.', num(t.overconfidence)],
              ['Verified', pct(t.verificationRate)],
              ['Intent (cut off)', pct(t.intentCutOff)],
              ['SA mean', pct(t.saMean)],
              ['SA divergence', num(t.divergenceMean)],
            ].map(([k, v]) => (
              <div key={k} className="rounded border border-line bg-panel p-2">
                <dt className="text-[10px] uppercase tracking-wider text-muted">{k}</dt>
                <dd className="mt-0.5 font-mono text-lg">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="q1" n="1" title="What was supposed to happen?">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="p-4 text-sm leading-relaxed">
              <p><span className="text-muted">Situation.</span> {aar.q1.brief.situation}</p>
              <p className="mt-2"><span className="text-muted">Mission.</span> {aar.q1.brief.mission}</p>
              <p className="mt-2"><span className="text-muted">Execution.</span> {aar.q1.brief.execution}</p>
            </Panel>
            <Panel className="p-4 text-sm leading-relaxed">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Commander&apos;s intent · {aar.q1.intent.priority} · by {formatT(aar.q1.intent.deadlineS * 1000)}</p>
              <p className="mt-1">{aar.q1.intent.text}</p>
              {aar.q1.intent.finalVersion > 1 && <p className="mt-2 text-muted">Refined (v{aar.q1.intent.finalVersion}): {aar.q1.intent.finalText}</p>}
            </Panel>
          </div>
          <Panel className="mt-4 overflow-x-auto">
            <SectionTitle>Friction applied (MSEL)</SectionTitle>
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-3 py-1.5">Time</th><th>Event</th><th>Effect</th><th className="px-3">Status</th></tr></thead>
              <tbody>
                {aar.q1.msel.map((m) => (
                  <tr key={m.id} className="border-t border-line/60">
                    <td className="px-3 py-1.5 font-mono">{formatT(m.atS * 1000)}</td>
                    <td>{m.title}</td>
                    <td className="font-mono text-[11px] text-muted">{m.summary}</td>
                    <td className="px-3"><Badge tone={m.status === 'FIRED' ? 'ok' : 'neutral'}>{m.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Section>

        <Section id="q2" n="2" title="What actually happened?">
          <p className="mb-3 text-sm">{aar.q2.outcome.summary}</p>
          <Panel className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Swimlane timeline</h3>
            <Swimlanes aar={aar} onPick={(ref) => { setPicked(ref); setRoleFilter('ALL'); setTimeout(() => document.getElementById(`card-${ref}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }} />
          </Panel>
          <Panel className="mt-4 p-4">
            <h3 className="mb-3 text-sm font-semibold">Replay</h3>
            <ReplayPlayer code={code} token={id.token} roles={roles} features={aar.q2.outcome.features} objectives={aar.q1.objectives} />
          </Panel>
        </Section>

        <Section id="q3" n="3" title="Why did it happen?">
          <Panel className="overflow-x-auto">
            <SectionTitle>Per-role metrics (PRD §9)</SectionTitle>
            <table className="w-full min-w-[860px] text-xs">
              <thead className="text-right text-[10px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-1.5 text-left">Role</th><th className="px-2">Dec.</th><th className="px-2">Latency mean (s)</th><th className="px-2">No resp.</th><th className="px-2">Verified contested</th><th className="px-2">Brier ↓</th><th className="px-2">Over-conf.</th><th className="px-2">Intent cut off</th><th className="px-2">Self-aware</th><th className="px-2">SA</th><th className="px-2">Msgs sent/deliv/drop</th><th className="px-2">PACE sw.</th><th className="px-3">Cut off</th>
                </tr>
              </thead>
              <tbody>
                {aar.q3.roleMetrics.map((r) => (
                  <tr key={r.role} className="border-t border-line/60">
                    <td className="px-3 py-1.5"><span className="font-mono text-blue">{r.callsign}</span> <span className="text-muted">{r.role}</span></td>
                    <td className="px-2 text-right font-mono">{r.decisions}</td>
                    <td className="px-2 text-right font-mono">{num(r.latency.meanS, 0)}</td>
                    <td className="px-2 text-right font-mono">{r.latency.noResponse}</td>
                    <MetricCell v={r.verification.rate} good={0.6} bad={0.4} fmt={(v) => `${r.verification.verified}/${r.verification.contested} (${Math.round(v * 100)}%)`} />
                    <MetricCell v={r.calibration.brier} good={0.15} bad={0.25} invert fmt={(v) => v.toFixed(2)} />
                    <MetricCell v={r.calibration.overconfidence} good={0.05} bad={0.15} invert fmt={(v) => v.toFixed(2)} />
                    <MetricCell v={r.intent.cutOff} good={0.75} bad={0.5} fmt={(v) => `${Math.round(v * 100)}% (${r.intent.cutOffN})`} />
                    <MetricCell v={r.intent.selfAwareness} good={0.75} bad={0.5} fmt={(v) => `${Math.round(v * 100)}%`} />
                    <MetricCell v={r.sa.mean} good={0.7} bad={0.5} fmt={(v) => `${Math.round(v * 100)}%`} />
                    <td className="px-2 text-right font-mono">{r.comms.sent}/{r.comms.delivered}/{r.comms.dropped}</td>
                    <td className="px-2 text-right font-mono">{r.comms.paceSwitches}</td>
                    <td className="px-3 text-right font-mono">{r.cutOffTotalS ? `${Math.round(r.cutOffTotalS / 60)}m` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[11px] text-faint">▲ good · ▼ needs attention. Brier = mean (confidence − outcome)², outcome SOUND 1 / RISKY 0.5 / UNSOUND 0. Latency = time to first decision after an inject, cyber event, lost link or cut-off (10-min window).</p>
          </Panel>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Panel className="p-4"><BarList title="SA accuracy (SAGAT)" rows={aar.q3.roleMetrics.map((r) => ({ label: r.callsign, value: r.sa.mean }))} /></Panel>
            <Panel className="p-4"><BarList title="Calibration — Brier (lower is better)" rows={aar.q3.roleMetrics.map((r) => ({ label: r.callsign, value: r.calibration.brier }))} invert color="var(--color-accent)" /></Panel>
            <Panel className="p-4"><BarList title="Decision latency after friction (s)" rows={aar.q3.roleMetrics.map((r) => ({ label: r.callsign, value: r.latency.meanS }))} color="var(--color-muted)" format={(v) => `${Math.round(v)}s`} /></Panel>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel>
              <SectionTitle>SA probes &amp; team divergence</SectionTitle>
              {aar.q3.probes.length === 0 && <p className="p-3 text-xs text-muted">No SAGAT probes were run.</p>}
              {aar.q3.probes.map((p) => (
                <div key={p.id} className="border-b border-line/60 last:border-0">
                  <p className="px-3 pt-2 text-xs"><span className="font-mono">Probe #{p.index + 1} · {formatT(p.startedAtMs)}</span> · team divergence <span className="font-mono">{num(p.divergence.team)}</span></p>
                  <Heatmap roles={p.divergence.roles} matrix={p.divergence.matrix} label={`SA divergence heatmap, probe ${p.index + 1}`} />
                </div>
              ))}
            </Panel>
            <Panel className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Comms network — who talked to whom, what was lost</h3>
              <NetworkGraph aar={aar} />
            </Panel>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-base font-semibold">Decision cards <span className="text-sm font-normal text-muted">— judge on what was knowable, then reveal</span></h3>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter decisions by role">
              {(['ALL', ...roles] as const).map((r) => (
                <button key={r} aria-pressed={roleFilter === r} onClick={() => setRoleFilter(r)} className={cn('rounded border px-2 py-1 font-mono text-xs', roleFilter === r ? 'border-accent bg-accent/15' : 'border-line text-muted')}>{r}</button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" className="accent-[var(--color-accent)]" checked={revealAll} onChange={(e) => setRevealAll(e.target.checked)} />
              Reveal all
            </label>
          </div>
          <div className="mt-3 grid gap-3" data-testid="decision-cards">
            {decisions.length === 0 && <p className="text-sm text-muted">No decisions recorded.</p>}
            {decisions.map((d) => <DecisionCard key={d.id} d={d} feedback={aar.q4.rationaleFeedback[d.id]} revealAll={revealAll} highlight={picked === d.id} />)}
          </div>
        </Section>

        <Section id="q4" n="4" title="What do we sustain / improve?">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-ok">Sustain</p><ul className="mt-2 grid gap-2 text-sm">{aar.q4.sustain.map((s, i) => <li key={i}>▲ {s}</li>)}</ul></Panel>
            <Panel className="p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-bad">Improve</p><ul className="mt-2 grid gap-2 text-sm">{aar.q4.improve.map((s, i) => <li key={i}>▼ {s}</li>)}</ul></Panel>
          </div>
          <Panel className="mt-4 p-4">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {aar.q4.narrative.source === 'ai' ? <><Sparkles size={12} className="text-accent" /> AI-generated draft — {aar.q4.narrative.provider} · review before use</> : 'Narrative draft (template — no AI)'}
            </p>
            <div className="whitespace-pre-line text-sm leading-relaxed">{aar.q4.narrative.text}</div>
          </Panel>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted"><Download size={12} /> State hash {aar.meta.stateHash} · seed {aar.meta.seed} · replay-verifiable from the JSON export.</p>
        </Section>
        <Disclaimer />
      </main>
    </div>
  );
}
