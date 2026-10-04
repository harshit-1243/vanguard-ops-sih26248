import { useState } from 'react';
import { ChevronDown, ChevronRight, MoveRight, Play, Power, SkipForward, Trash2 } from 'lucide-react';
import { formatAge, formatT, type DecisionRecord, type InstructorState, type RoleId } from '@vanguard/shared';
import { LinkPill, SoundBadge } from '@/components/status';
import { Badge, Button, Empty, Input, SectionTitle } from '@/components/ui/primitives';
import type { Cmd } from '@/components/trainee/parts';
import { ACTION_LABEL } from '@/components/trainee/DecisionPanel';
import { cn, num, pct } from '@/lib/utils';

export function MselPanel({ t, cmd }: { t: InstructorState; cmd: Cmd }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [val, setVal] = useState('');
  const toS = (v: string) => {
    const m = /^(\d+):(\d{1,2})$/.exec(v.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : Number(v);
  };
  const live = t.phase !== 'ENDED';
  return (
    <div>
      <SectionTitle right={<span className="font-mono text-[10px] text-muted">{t.msel.filter((m) => m.status === 'PENDING').length} pending</span>}>Master scenario events list</SectionTitle>
      <ol className="divide-y divide-line/70" aria-label="MSEL">
        {t.msel.map((m) => {
          const due = m.status === 'PENDING' && m.atS * 1000 - t.tMs < 60_000;
          return (
            <li key={m.id} className={cn('px-3 py-2 text-xs', m.status !== 'PENDING' && 'opacity-60', due && 'bg-accent/[0.06]')}>
              <div className="flex items-center gap-2">
                {editing === m.id ? (
                  <form className="flex items-center gap-1" onSubmit={async (e) => { e.preventDefault(); const r = await cmd({ type: 'MSEL_EDIT', mselId: m.id, atS: toS(val) }, `${m.id} retimed`); if (r.ok) setEditing(null); }}>
                    <Input aria-label="New time (mm:ss)" className="h-6 w-16 px-1 font-mono text-xs" value={val} onChange={(e) => setVal(e.target.value)} />
                    <Button size="xs" type="submit" variant="outline">save</Button>
                  </form>
                ) : (
                  <button className="font-mono text-muted hover:text-ink disabled:hover:text-muted" disabled={m.status !== 'PENDING' || !live} title="Edit time" onClick={() => { setEditing(m.id); setVal(formatT(m.atS * 1000).slice(2)); }}>
                    {formatT(m.atS * 1000)}
                  </button>
                )}
                <span className="font-mono text-[10px] text-faint">{m.id}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                <Badge tone={m.status === 'FIRED' ? 'ok' : m.status === 'SKIPPED' ? 'neutral' : due ? 'accent' : 'neutral'}>{m.status === 'FIRED' ? `fired ${formatT(m.firedAtMs!)}` : m.status}</Badge>
              </div>
              <p className="mt-0.5 font-mono text-[10px] text-muted">{m.kind} · {m.summary}</p>
              {m.status === 'PENDING' && live && (
                <div className="mt-1 flex gap-1">
                  <Button size="xs" variant="outline" aria-label={`Fire ${m.id} now: ${m.title}`} disabled={t.phase === 'LOBBY'} onClick={() => cmd({ type: 'MSEL_FIRE_NOW', mselId: m.id }, `${m.id} fired`)}><Play size={11} /> fire now</Button>
                  <Button size="xs" variant="ghost" aria-label={`Skip ${m.id}`} onClick={() => cmd({ type: 'MSEL_SKIP', mselId: m.id }, `${m.id} skipped`)}><SkipForward size={11} /> skip</Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DecisionRow({ d, roleTitle }: { d: DecisionRecord; roleTitle: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-line/70">
      <button className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-raised/40" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={13} className="mt-0.5 shrink-0" /> : <ChevronRight size={13} className="mt-0.5 shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-muted">{formatT(d.tMs)}</span>
            <span className="font-mono font-semibold text-blue">{d.callsign}</span>
            <span className="font-semibold">{ACTION_LABEL[d.action]}{d.targetCell ? ` ${d.targetCell}` : ''}{d.channel ? ` ${d.channel}` : ''}</span>
            {d.cutOff && <Badge tone="bad">cut off</Badge>}
            <span className="ml-auto flex items-center gap-1.5">
              <span className="font-mono" title="Stated confidence">{d.confidence}%</span>
              <SoundBadge s={d.adjudication.soundness} />
            </span>
          </span>
          <span className="mt-0.5 block truncate text-muted">“{d.rationale}”</span>
        </span>
      </button>
      {open && (
        <div className="grid gap-2 bg-bg/60 px-8 pb-3 text-xs">
          <p><span className="text-muted">{roleTitle} · rule {d.adjudication.rule}:</span> {d.adjudication.reason}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Knowable then</p>
              <p>{d.knowable.intel.length} intel items · {d.knowable.openConflicts.length} open conflicts · {d.knowable.outages.length} degraded nets{d.knowable.cutOff ? ' · CUT OFF' : ''}</p>
              <p className="text-muted">based on: {d.basedOn.length ? d.basedOn.join(', ') : 'nothing cited'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Ground truth</p>
              <p>ρ = {d.truth.rho ?? '—'} · in target: {d.truth.hostilesInTarget.map((h) => `${h.count}× ${h.type}${h.decoy ? ' (decoy)' : ''}`).join(', ') || 'none'}</p>
              <p className="text-muted">true position {d.truth.ownCell} (believed {d.knowable.ownCell}) · intent score {d.intentScore}</p>
            </div>
          </div>
          {d.effects.length > 0 && <ul className="list-disc pl-4 text-muted">{d.effects.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>
      )}
    </li>
  );
}

export function DecisionFeed({ t }: { t: InstructorState }) {
  const title = (r: RoleId) => t.roles.find((x) => x.role === r)?.title ?? r;
  const counts = { SOUND: 0, RISKY: 0, UNSOUND: 0 };
  for (const d of t.decisions) counts[d.adjudication.soundness]++;
  return (
    <div>
      <SectionTitle right={<span className="flex gap-1"><Badge tone="ok">{counts.SOUND}</Badge><Badge tone="warn">{counts.RISKY}</Badge><Badge tone="bad">{counts.UNSOUND}</Badge></span>}>Live decision feed</SectionTitle>
      {t.decisions.length === 0 && <Empty>No decisions yet.</Empty>}
      <ol aria-label="Decisions (newest first)">
        {[...t.decisions].reverse().map((d) => <DecisionRow key={d.id} d={d} roleTitle={title(d.role)} />)}
      </ol>
    </div>
  );
}

export function Heatmap({ roles, matrix, label }: { roles: string[]; matrix: (number | null)[][]; label: string }) {
  if (roles.length < 2) return <Empty>Needs answers from at least two roles.</Empty>;
  const color = (v: number | null) => (v === null ? 'transparent' : `color-mix(in srgb, var(--color-bad) ${Math.round(v * 85)}%, var(--color-panel2))`);
  return (
    <table className="mx-3 my-2 border-separate border-spacing-0.5 font-mono text-[10px]" aria-label={label}>
      <thead>
        <tr><th />{roles.map((r) => <th key={r} scope="col" className="px-1 font-normal text-muted">{r}</th>)}</tr>
      </thead>
      <tbody>
        {roles.map((r, i) => (
          <tr key={r}>
            <th scope="row" className="pr-1 text-right font-normal text-muted">{r}</th>
            {roles.map((c, j) => {
              const v = matrix[i]?.[j] ?? null;
              return (
                <td key={c} className="h-8 w-11 rounded text-center text-ink" style={{ background: color(v) }} title={`${r} vs ${c}: divergence ${v ?? '—'}`}>
                  {v === null ? '—' : v.toFixed(2)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SaCommsPanel({ t }: { t: InstructorState }) {
  const probe = t.probes.at(-1);
  const totals = t.comms.reduce((a, c) => ({ sent: a.sent + c.sent, delivered: a.delivered + c.delivered, dropped: a.dropped + c.dropped, corrupted: a.corrupted + c.corrupted }), { sent: 0, delivered: 0, dropped: 0, corrupted: 0 });
  return (
    <div>
      <SectionTitle right={probe && <span className="font-mono text-[10px] text-muted">probe #{probe.index + 1} @ {formatT(probe.startedAtMs)}{probe.endedAtMs === null ? ' · OPEN' : ''}</span>}>Situational awareness (SAGAT)</SectionTitle>
      {!probe ? (
        <Empty>No probe yet — use “Freeze &amp; probe” in the header.</Empty>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-1 px-3 py-2 text-xs">
            {probe.results.map((r) => (
              <li key={r.role} className="flex items-center justify-between rounded border border-line px-2 py-1">
                <span className="font-mono">{r.role}</span>
                {r.submitted ? <span className="font-mono">{pct(r.accuracy)}</span> : <Badge>waiting</Badge>}
              </li>
            ))}
          </ul>
          <p className="px-3 text-[11px] text-muted">Team SA divergence (0 = identical pictures, 1 = no overlap): <span className="font-mono text-ink">{num(probe.divergence.team)}</span></p>
          <Heatmap roles={probe.divergence.roles} matrix={probe.divergence.matrix} label="SA divergence heatmap" />
          {probe.endedAtMs === null && (
            <details className="px-3 pb-2 text-xs">
              <summary className="cursor-pointer text-muted">Questions &amp; truth</summary>
              <ul className="mt-1 grid gap-1">
                {(Object.values(probe.questions)[0] ?? []).map((q) => <li key={q.id}>{q.text} <span className="font-mono text-accent">→ {q.truth}</span></li>)}
              </ul>
            </details>
          )}
        </>
      )}
      <SectionTitle className="border-t">Comms health</SectionTitle>
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-muted">
          <tr><th className="px-3 py-1 text-left font-medium">Channel</th><th className="text-left font-medium">Links (role→superior)</th><th className="px-2 text-right font-medium">Sent</th><th className="px-2 text-right font-medium">Deliv</th><th className="px-2 text-right font-medium">Drop</th><th className="px-3 text-right font-medium">Garb</th></tr>
        </thead>
        <tbody className="font-mono">
          {t.comms.filter((c) => c.sent > 0 || c.clearLinks + c.degradedLinks + c.deniedLinks > 0).map((c) => (
            <tr key={c.channel} className="border-t border-line/60">
              <td className="px-3 py-1">{c.channel}</td>
              <td className="flex gap-1 py-1">
                {c.clearLinks > 0 && <span className="text-ok">{c.clearLinks}✓</span>}
                {c.degradedLinks > 0 && <span className="text-warn">{c.degradedLinks}~</span>}
                {c.deniedLinks > 0 && <span className="text-bad">{c.deniedLinks}✕</span>}
              </td>
              <td className="px-2 text-right">{c.sent}</td>
              <td className="px-2 text-right">{c.delivered}</td>
              <td className="px-2 text-right text-bad">{c.dropped}</td>
              <td className="px-3 text-right text-warn">{c.corrupted}</td>
            </tr>
          ))}
          <tr className="border-t border-line font-semibold"><td className="px-3 py-1">TOTAL</td><td className="py-1 text-muted">{totals.sent ? pct(totals.delivered / totals.sent) : '—'} delivered</td><td className="px-2 text-right">{totals.sent}</td><td className="px-2 text-right">{totals.delivered}</td><td className="px-2 text-right text-bad">{totals.dropped}</td><td className="px-3 text-right text-warn">{totals.corrupted}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export function RosterPanel({ t, cmd }: { t: InstructorState; cmd: Cmd }) {
  return (
    <div>
      <SectionTitle>Roster &amp; links</SectionTitle>
      <ul className="divide-y divide-line/70">
        {t.roles.filter((r) => r.enabled).map((r) => {
          const links = t.links.filter((l) => l.a === r.role);
          return (
            <li key={r.role} className={cn('px-3 py-2 text-xs', r.cutOff && 'bg-bad/[0.07]')}>
              <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', r.connected ? 'bg-ok' : 'bg-faint')} aria-hidden />
                <span className="font-mono font-semibold">{r.callsign}</span>
                <span className="text-muted">{r.title}</span>
                {!r.joined && <Badge>open</Badge>}
                {r.cutOff && <Badge tone="bad">CUT OFF</Badge>}
                <span className="ml-auto font-mono text-muted">{r.decisions} dec{r.lastDecisionMs !== null ? ` · last ${formatAge(t.tMs - r.lastDecisionMs)}` : ''}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] text-muted">active {r.activeChannel}</span>
                <span className={cn('font-mono text-[10px]', r.perceivedCell !== r.trueCell ? 'text-warn' : 'text-muted')}>
                  pos {r.trueCell}{r.perceivedCell !== r.trueCell ? ` (believes ${r.perceivedCell})` : ''}
                </span>
                {links.map((l) => (
                  <span key={l.channel} className="flex items-center gap-0.5 font-mono text-[10px]" title={l.causes.join(', ')}>
                    {l.channel}<LinkPill level={l.level} compact />
                  </span>
                ))}
                {r.joined && t.phase !== 'ENDED' && (
                  <Button size="xs" variant="ghost" className="ml-auto" title="Free this seat (trainee lost their tab)" onClick={() => cmd({ type: 'RELEASE_ROLE', role: r.role }, `${r.role} released`)}>
                    release
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function JammerList({ t, cmd, onMove }: { t: InstructorState; cmd: Cmd; onMove: (id: string) => void }) {
  return (
    <div>
      <SectionTitle>Jammers on map</SectionTitle>
      {t.jammers.length === 0 && <Empty>None. Use the map tool “Place jammer”.</Empty>}
      <ul className="divide-y divide-line/70">
        {t.jammers.map((j) => (
          <li key={j.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
            <span className={cn('font-mono', j.active ? 'text-red' : 'text-faint')}>{j.label}</span>
            <span className="font-mono text-muted">{j.cell} r{j.radius} ×{j.power} [{j.bands.join('/')}]</span>
            <span className="ml-auto flex gap-1">
              <Button size="xs" variant="ghost" onClick={() => onMove(j.id)} title="Move: then click a cell"><MoveRight size={11} /></Button>
              <Button size="xs" variant="ghost" onClick={() => cmd({ type: 'TOGGLE_JAMMER', jammerId: j.id, active: !j.active })} title={j.active ? 'Switch off' : 'Switch on'}><Power size={11} /></Button>
              <Button size="xs" variant="ghost" onClick={() => cmd({ type: 'REMOVE_JAMMER', jammerId: j.id }, 'Jammer removed')} title="Remove"><Trash2 size={11} /></Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function JournalPanel({ t }: { t: InstructorState }) {
  return (
    <div>
      <SectionTitle>Event journal (truth)</SectionTitle>
      <ol className="font-mono text-[11px]">
        {[...t.journal].reverse().map((j, i) => (
          <li key={i} className="flex gap-2 border-b border-line/50 px-3 py-1">
            <span className="text-muted">{formatT(j.tMs)}</span>
            <span className="w-24 shrink-0 text-faint">{j.kind}</span>
            <span className="text-ink">{j.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
