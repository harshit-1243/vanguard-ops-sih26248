import { useState } from 'react';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { formatAge, formatT, type DecisionRecord, type NarrativeBlock } from '@vanguard/shared';
import { LinkPill, SoundBadge } from '@/components/status';
import { Badge, Button } from '@/components/ui/primitives';
import { ACTION_LABEL } from '@/components/trainee/DecisionPanel';
import { cn } from '@/lib/utils';

/**
 * Hindsight-safe decision card (US-AAR-3): the frozen knowable picture first;
 * ground truth and the adjudicated outcome only after an explicit reveal.
 */
export function DecisionCard({ d, feedback, revealAll, highlight }: { d: DecisionRecord; feedback?: NarrativeBlock; revealAll: boolean; highlight?: boolean }) {
  const [reveal, setReveal] = useState(false);
  const shown = reveal || revealAll;
  const k = d.knowable;
  const cited = k.intel.filter((i) => d.basedOn.includes(i.id));
  return (
    <article id={`card-${d.id}`} className={cn('scroll-mt-20 rounded-lg border bg-panel', highlight ? 'border-accent' : 'border-line')} aria-label={`Decision ${d.id}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="font-mono text-xs text-muted">{d.id}</span>
        <span className="font-mono text-sm">{formatT(d.tMs)}</span>
        <span className="font-mono text-sm font-semibold text-blue">{d.callsign}</span>
        <span className="text-sm font-semibold">
          {ACTION_LABEL[d.action]}
          {d.targetCell ? ` ${d.targetCell}` : ''}
          {d.channel ? ` → ${d.channel}` : ''}
        </span>
        {d.cutOff && <Badge tone="bad">cut off — mission command</Badge>}
        <span className="ml-auto flex items-center gap-2">
          <Badge tone="neutral">confidence {d.confidence}%</Badge>
          {shown && <SoundBadge s={d.adjudication.soundness} />}
        </span>
      </header>
      <div className={cn('grid gap-0', shown && 'md:grid-cols-2')}>
        <section className="px-4 py-3" aria-label="What was knowable at decision time">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue">At decision time — knowable</h4>
          <dl className="grid gap-1 text-xs">
            <div className="flex gap-2"><dt className="text-muted">Believed position</dt><dd className="font-mono">{k.ownCell}</dd></div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-muted">Nets</dt>
              <dd className="flex flex-wrap gap-1">
                <span className="font-mono">active {k.activeChannel}</span>
                {k.outages.length === 0 ? <span className="text-ok">all clear</span> : k.outages.map((o) => <span key={o.channel} className="flex items-center gap-0.5 font-mono">{o.channel}<LinkPill level={o.level} compact /></span>)}
              </dd>
            </div>
            <div className="flex gap-2"><dt className="text-muted">Intent</dt><dd>v{k.intentVersion}</dd></div>
            <div className="flex gap-2"><dt className="text-muted">Intel held</dt><dd>{k.intel.length} items · {k.openConflicts.length} open conflicts</dd></div>
          </dl>
          {cited.length > 0 && (
            <ul className="mt-2 grid gap-1">
              {cited.map((i) => (
                <li key={i.id} className="rounded border border-line bg-bg px-2 py-1 font-mono text-[11px]">
                  <span className="text-muted">{i.id} · {i.sourceLabel} · {formatAge(i.ageMs)} old · conf {i.confidence}</span>
                  <br />
                  {i.text}
                </li>
              ))}
            </ul>
          )}
          {cited.length === 0 && <p className="mt-2 text-[11px] text-faint">No intel cited as the basis.</p>}
          {k.openConflicts.length > 0 && (
            <ul className="mt-2 grid gap-0.5 text-[11px] text-warn">
              {k.openConflicts.slice(0, 3).map((c) => <li key={c.id}>⚠ {c.reason}{c.flagged ? ' (flagged)' : ''}</li>)}
            </ul>
          )}
          <blockquote className="mt-3 border-l-2 border-accent pl-3 text-sm italic">“{d.rationale}”</blockquote>
          <p className="mt-1 text-[11px] text-muted">Self-assessed consistency with intent: <span className="font-semibold text-ink">{d.intentSelf}</span></p>
        </section>
        {shown && (
          <section className="border-t border-line bg-accent/[0.04] px-4 py-3 md:border-l md:border-t-0" aria-label="Ground truth and adjudicated outcome">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">Ground truth — revealed</h4>
            <p className="text-sm"><SoundBadge s={d.adjudication.soundness} /> <span className="ml-1">rule {d.adjudication.rule}: {d.adjudication.reason}</span></p>
            <dl className="mt-2 grid gap-1 text-xs">
              <div className="flex gap-2"><dt className="text-muted">True position</dt><dd className="font-mono">{d.truth.ownCell}{d.truth.ownCell !== k.ownCell && <span className="text-warn"> (GPS error)</span>}</dd></div>
              <div className="flex gap-2"><dt className="text-muted">Force ratio ρ</dt><dd className="font-mono">{d.truth.rho ?? '—'}</dd></div>
              <div className="flex gap-2"><dt className="text-muted">In target</dt><dd>{d.truth.hostilesInTarget.map((h) => `${h.count}× ${h.type}${h.decoy ? ' (DECOY)' : ''}`).join(', ') || 'no hostiles'}</dd></div>
              {d.truth.hostilesAdjacent.length > 0 && <div className="flex gap-2"><dt className="text-muted">Adjacent</dt><dd>{d.truth.hostilesAdjacent.map((h) => `${h.count}× ${h.type}${h.decoy ? ' (DECOY)' : ''} ${h.cell}`).join(', ')}</dd></div>}
              <div className="flex gap-2"><dt className="text-muted">Intent adherence</dt><dd className="font-mono">{d.intentScore}</dd></div>
            </dl>
            {d.effects.length > 0 && (
              <ul className="mt-2 list-disc pl-4 text-xs text-muted">{d.effects.map((e, i) => <li key={i}>{e}</li>)}</ul>
            )}
            {feedback && (
              <div className="mt-3 rounded border border-line bg-bg p-2 text-xs">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {feedback.source === 'ai' ? <><Sparkles size={11} /> AI-generated draft feedback</> : 'Feedback (template)'}
                </p>
                {feedback.text}
              </div>
            )}
          </section>
        )}
      </div>
      {!revealAll && (
        <footer className="border-t border-line px-4 py-2">
          <Button size="sm" variant={shown ? 'ghost' : 'outline'} onClick={() => setReveal(!reveal)} aria-expanded={shown}>
            {shown ? <><EyeOff size={13} /> Hide ground truth</> : <><Eye size={13} /> Reveal ground truth</>}
          </Button>
        </footer>
      )}
    </article>
  );
}
