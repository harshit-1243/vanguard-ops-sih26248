import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Lightbulb, Sparkles } from 'lucide-react';
import type { AnalyticsGroup, AnalyticsResponse, MetricSet, NarrativeBlock } from '@vanguard/shared';
import { AdminGate, AdminNav, OpenModeNote } from '@/components/admin/AdminGate';
import { useAiStatus } from '@/components/ds/AiAdvisor';
import { MetricCell } from '@/components/aar/Charts';
import { PageShell } from '@/components/shell';
import { Badge, Button, Empty, Label, Panel, SectionTitle, Select } from '@/components/ui/primitives';
import { adminApi } from '@/lib/admin';

const pc = (v: number) => `${Math.round(v * 100)}%`;
/** Same thresholds as the per-exercise AAR so colours mean the same thing everywhere. */
const COLS: { key: keyof MetricSet; label: string; good: number; bad: number; invert?: boolean; fmt: (v: number) => string }[] = [
  { key: 'soundRate', label: 'Sound decisions', good: 0.7, bad: 0.4, fmt: pc },
  { key: 'verificationRate', label: 'Verified contested', good: 0.6, bad: 0.4, fmt: pc },
  { key: 'intentCutOff', label: 'Intent when cut off', good: 0.75, bad: 0.5, fmt: pc },
  { key: 'saMean', label: 'SA (SAGAT)', good: 0.7, bad: 0.5, fmt: pc },
  { key: 'brier', label: 'Brier ↓', good: 0.15, bad: 0.25, invert: true, fmt: (v) => v.toFixed(2) },
  { key: 'latencyMeanS', label: 'Reaction (s) ↓', good: 60, bad: 180, invert: true, fmt: (v) => v.toFixed(0) },
  { key: 'deliveryRatio', label: 'Msgs delivered', good: 0.8, bad: 0.5, fmt: pc },
];

function MetricTable({ title, rows, firstCol, caption }: { title: string; rows: (AnalyticsGroup & { extra?: string })[]; firstCol: string; caption?: string }) {
  return (
    <Panel>
      <SectionTitle>{title}</SectionTitle>
      {rows.length === 0 ? <Empty>No data.</Empty> : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={title}>
          <table className="w-full text-xs">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead className="text-right text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-1.5 text-left">{firstCol}</th>
                <th className="px-2">Exercises</th>
                <th className="px-2">Decisions</th>
                {COLS.map((c) => <th key={c.key} className="px-2">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <th scope="row" className="max-w-[260px] truncate px-3 py-1.5 text-left font-medium" title={r.label}>{r.label}{r.extra && <span className="ml-1 text-faint">{r.extra}</span>}</th>
                  <td className="px-2 text-right font-mono tabular">{r.exercises}</td>
                  <td className="px-2 text-right font-mono tabular">{r.decisions}</td>
                  {COLS.map((c) => <MetricCell key={c.key} v={r.metrics[c.key]} good={c.good} bad={c.bad} invert={c.invert} fmt={c.fmt} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

const SERIES: { key: keyof MetricSet; label: string; color: string; dash?: string }[] = [
  { key: 'soundRate', label: 'Sound decisions', color: 'var(--color-ok)' },
  { key: 'verificationRate', label: 'Verified contested', color: 'var(--color-blue)', dash: '6 3' },
  { key: 'intentCutOff', label: 'Intent when cut off', color: 'var(--color-accent)', dash: '2 3' },
  { key: 'saMean', label: 'SA', color: 'var(--color-unk)', dash: '10 3 2 3' },
];

/** Metric trend across exercises in the order they were run. */
function TrendChart({ a }: { a: AnalyticsResponse }) {
  const xs = [...a.exercises].sort((p, q) => p.createdAt.localeCompare(q.createdAt));
  const W = 640;
  const H = 200;
  const P = { l: 34, r: 10, t: 10, b: 26 };
  const x = (i: number) => P.l + (xs.length <= 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (xs.length - 1));
  const y = (v: number) => P.t + (1 - v) * (H - P.t - P.b);
  if (xs.length === 0) return <Empty>No exercises yet.</Empty>;
  return (
    <figure className="p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Trend of team metrics over ${xs.length} exercises`}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={P.l} x2={W - P.r} y1={y(g)} y2={y(g)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={P.l - 6} y={y(g) + 3} fontSize={9} textAnchor="end" fill="var(--color-muted)" fontFamily="var(--font-mono)">{g * 100}%</text>
          </g>
        ))}
        {xs.map((e, i) => (
          <text key={e.code} x={x(i)} y={H - 8} fontSize={9} textAnchor="middle" fill="var(--color-faint)" fontFamily="var(--font-mono)">{xs.length <= 12 || i % Math.ceil(xs.length / 12) === 0 ? e.code : ''}</text>
        ))}
        {SERIES.map((s) => {
          const pts = xs.map((e, i) => [i, e.metrics[s.key]] as const).filter((p): p is readonly [number, number] => p[1] !== null);
          return (
            <g key={s.key}>
              {pts.length > 1 && <polyline points={pts.map(([i, v]) => `${x(i)},${y(Math.min(1, v))}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />}
              {pts.map(([i, v]) => (
                <circle key={i} cx={x(i)} cy={y(Math.min(1, v))} r={3} fill={s.color}>
                  <title>{`${xs[i]!.code} · ${s.label}: ${pc(v)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-[11px] text-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width="26" height="8" aria-hidden><line x1="0" x2="26" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} /></svg>
            {s.label}
          </span>
        ))}
        <span className="text-faint">x-axis: exercises in the order they were run</span>
      </figcaption>
    </figure>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 font-mono text-2xl tabular">{value}</p>
      {sub && <p className="text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

function Dashboard({ open }: { open: boolean }) {
  const [course, setCourse] = useState<string | null>(null);
  const [scenario, setScenario] = useState<string | null>(null);
  const [a, setA] = useState<AnalyticsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState<NarrativeBlock | null | 'none'>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [sortBy, setSortBy] = useState<keyof MetricSet | 'exercises'>('exercises');
  const ai = useAiStatus();

  useEffect(() => {
    setLoading(true);
    setBrief(null);
    adminApi
      .analytics({ course, scenario })
      .then((r) => {
        setA(r);
        setErr(null);
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [course, scenario]);

  const people = useMemo(() => {
    if (!a) return [];
    const ps = [...a.participants];
    if (sortBy === 'exercises') return ps;
    const col = COLS.find((c) => c.key === sortBy)!;
    return ps.sort((p, q) => {
      const x = p.metrics[sortBy];
      const y = q.metrics[sortBy];
      if (x === null) return 1;
      if (y === null) return -1;
      return col.invert ? x - y : y - x;
    });
  }, [a, sortBy]);

  const m = a?.totals.metrics;
  return (
    <PageShell wide right={<AdminNav open={open} />}>
      <OpenModeNote open={open} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cross-course analytics</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Every finished exercise, replayed from its event log and reduced to the same metrics as its AAR — compare syndicates, courses, roles and difficulty settings over time.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-48">
            <Label htmlFor="f-course">Course</Label>
            <Select id="f-course" value={course ?? '__all'} onChange={(e) => setCourse(e.target.value === '__all' ? null : e.target.value)}>
              <option value="__all">All courses</option>
              {a?.options.courses.map((c) => <option key={c} value={c}>{c || '(no course label)'}</option>)}
            </Select>
          </div>
          <div className="w-48">
            <Label htmlFor="f-scn">Scenario</Label>
            <Select id="f-scn" value={scenario ?? ''} onChange={(e) => setScenario(e.target.value || null)}>
              <option value="">All scenarios</option>
              {a?.options.scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </Select>
          </div>
          <Button variant="outline" disabled={!a || a.totals.exercises === 0} onClick={() => adminApi.downloadCsv({ course, scenario }).catch((e: Error) => setErr(e.message))}>
            <Download size={14} aria-hidden /> CSV
          </Button>
        </div>
      </div>
      {err && <p role="alert" className="mt-4 text-sm text-bad">{err}</p>}
      {loading && !a && <p className="mt-6 text-sm text-muted">Replaying finished exercises…</p>}
      {a && m && (
        <div className={loading ? 'opacity-60' : undefined}>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
            <Kpi label="Exercises" value={String(a.totals.exercises)} sub={a.skipped.length ? `${a.skipped.length} unreadable` : undefined} />
            <Kpi label="Officers" value={String(a.totals.participants)} />
            <Kpi label="Decisions" value={String(a.totals.decisions)} />
            <Kpi label="Sound" value={m.soundRate === null ? '—' : pc(m.soundRate)} />
            <Kpi label="Verified" value={m.verificationRate === null ? '—' : pc(m.verificationRate)} sub="contested intel" />
            <Kpi label="Intent cut off" value={m.intentCutOff === null ? '—' : pc(m.intentCutOff)} />
            <Kpi label="SA" value={m.saMean === null ? '—' : pc(m.saMean)} sub="SAGAT probes" />
            <Kpi label="Brier ↓" value={m.brier === null ? '—' : m.brier.toFixed(2)} sub="calibration" />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Panel>
              <SectionTitle>Trend across exercises</SectionTitle>
              <TrendChart a={a} />
            </Panel>
            <Panel>
              <SectionTitle
                right={
                  ai?.enabled ? (
                    <Button size="xs" variant="outline" disabled={briefBusy || a.totals.exercises === 0} onClick={async () => {
                      setBriefBusy(true);
                      try {
                        const r = await adminApi.brief({ course, scenario });
                        setBrief(r.briefing ?? 'none');
                      } catch (e) {
                        setErr((e as Error).message);
                      } finally {
                        setBriefBusy(false);
                      }
                    }}><Sparkles size={12} aria-hidden /> {briefBusy ? 'Drafting…' : 'AI summary'}</Button>
                  ) : <Badge>AI off</Badge>
                }
              >Findings</SectionTitle>
              <ul className="grid gap-2 p-3 text-sm">
                {a.insights.map((t) => (
                  <li key={t} className="flex gap-2"><Lightbulb size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden /><span>{t}</span></li>
                ))}
              </ul>
              {brief && brief !== 'none' && (
                <div className="mx-3 mb-3 rounded border border-blue/40 bg-blue/[0.06] p-2 text-sm">
                  <Badge tone="blue">AI-generated draft · {brief.provider}</Badge>
                  <p className="mt-1 whitespace-pre-line leading-relaxed">{brief.text}</p>
                </div>
              )}
              {brief === 'none' && <p className="mx-3 mb-3 text-xs text-muted">The AI provider did not answer — the findings above are complete without it.</p>}
            </Panel>
          </div>

          <div className="mt-5 grid gap-5">
            <MetricTable title="By role" firstCol="Role" rows={a.byRole} />
            <div className="grid gap-5 xl:grid-cols-2">
              <MetricTable title="By course / syndicate" firstCol="Course" rows={a.byCourse} />
              <MetricTable title="By scenario" firstCol="Scenario" rows={a.byScenario} />
            </div>
            <MetricTable title="By difficulty (exercise variables)" firstCol="Settings" rows={a.byDifficulty} />

            <Panel>
              <SectionTitle>Most common reasons decisions were risky or unsound</SectionTitle>
              {a.pitfalls.length === 0 ? <Empty>None.</Empty> : (
                <ol className="grid gap-1.5 p-3 text-xs">
                  {a.pitfalls.map((p) => (
                    <li key={p.rule} className="grid grid-cols-[40px_240px_1fr] gap-2">
                      <span className="text-right font-mono tabular">{p.count}×</span>
                      <span>{p.label} <span className="font-mono text-faint">{p.rule}</span></span>
                      <span className="text-muted">e.g. {p.example}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <Panel>
              <SectionTitle right={
                <label className="flex items-center gap-2 text-[11px] text-muted">Sort
                  <select className="h-6 rounded border border-line bg-bg px-1 text-[11px] text-ink" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                    <option value="exercises">Most exercises</option>
                    {COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </label>
              }>Officers (by name entered when joining)</SectionTitle>
              {people.length === 0 ? <Empty>No officers yet.</Empty> : (
                <div className="max-h-[420px] overflow-auto" tabIndex={0} role="region" aria-label="Officers">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-panel text-right text-[10px] uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-3 py-1.5 text-left">Officer</th><th className="px-2 text-left">Course</th><th className="px-2 text-left">Last role</th><th className="px-2">Exercises</th><th className="px-2">Decisions</th>
                        {COLS.filter((c) => c.key !== 'deliveryRatio').map((c) => <th key={c.key} className="px-2">{c.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((p) => (
                        <tr key={`${p.course}|${p.callsign}`} className="border-t border-line">
                          <th scope="row" className="px-3 py-1.5 text-left font-mono font-medium">{p.callsign}</th>
                          <td className="px-2 text-muted">{p.course || '—'}</td>
                          <td className="px-2 font-mono text-muted">{p.role}</td>
                          <td className="px-2 text-right font-mono tabular">{p.exercises}</td>
                          <td className="px-2 text-right font-mono tabular">{p.decisions}</td>
                          {COLS.filter((c) => c.key !== 'deliveryRatio').map((c) => <MetricCell key={c.key} v={p.metrics[c.key]} good={c.good} bad={c.bad} invert={c.invert} fmt={c.fmt} />)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel>
              <SectionTitle>Exercises</SectionTitle>
              {a.exercises.length === 0 ? <Empty>No finished exercises match. Run one from <Link to="/create" className="text-accent underline">Create exercise</Link>.</Empty> : (
                <div className="max-h-[420px] overflow-auto" tabIndex={0} role="region" aria-label="Exercises">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-panel text-left text-[10px] uppercase tracking-wider text-muted">
                      <tr><th className="px-3 py-1.5">Code</th><th className="px-2">Date</th><th className="px-2">Course</th><th className="px-2">Scenario</th><th className="px-2">Variables</th><th className="px-2 text-right">Roles</th><th className="px-2 text-right">Decisions</th><th className="px-2 text-right">Objectives</th><th className="px-2 text-right">BLUE / RED left</th></tr>
                    </thead>
                    <tbody>
                      {[...a.exercises].reverse().map((e) => (
                        <tr key={e.code} className="border-t border-line">
                          <th scope="row" className="px-3 py-1.5 text-left font-mono">{e.code}</th>
                          <td className="px-2 text-muted">{new Date(e.createdAt).toLocaleDateString()}</td>
                          <td className="px-2">{e.course || '—'}</td>
                          <td className="px-2">{e.scenarioTitle}</td>
                          <td className="px-2 font-mono text-[10px] text-muted">EW {e.settings.ewIntensity} · {e.settings.opfor}</td>
                          <td className="px-2 text-right font-mono tabular">{e.roles}</td>
                          <td className="px-2 text-right font-mono tabular">{e.decisions}</td>
                          <td className="px-2 text-right font-mono tabular">{e.objectivesHeld}/{e.objectivesTotal}</td>
                          <td className="px-2 text-right font-mono tabular">{e.friendlyStrengthPct}% / {e.hostileStrengthPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </PageShell>
  );
}

export default function Analytics() {
  return <AdminGate>{(open) => <Dashboard open={open} />}</AdminGate>;
}
