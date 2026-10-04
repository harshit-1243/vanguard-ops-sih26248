import { useState } from 'react';
import { AlertOctagon, Clock, Pencil } from 'lucide-react';
import { formatAge, formatT, type PerceivedPicture } from '@vanguard/shared';
import { Brand } from '@/components/shell';
import { ConnDot } from '@/components/status';
import { Badge, Button, Textarea } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export type Cmd = (c: unknown, okText?: string) => Promise<{ ok: boolean; error?: string }>;

const PHASE_TONE = { LOBBY: 'neutral', RUNNING: 'ok', PAUSED: 'warn', PROBE: 'accent', ENDED: 'neutral' } as const;

export function ConsoleHeader({ p, connected, extra }: { p: PerceivedPicture; connected: boolean; extra?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
      <Brand compact />
      <span className="hidden text-xs text-muted md:inline">{p.scenarioTitle}</span>
      <div className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-2 rounded border border-blue/40 bg-blue/10 px-2 py-1 text-xs">
          <span className="font-mono font-semibold text-blue">{p.callsign}</span>
          <span className="text-muted">{p.roleTitle}</span>
        </span>
        <span className="flex items-center gap-1.5 font-mono text-lg tabular text-ink" aria-label={`Exercise time ${formatT(p.tMs)}`}>
          <Clock size={14} className="text-muted" aria-hidden />
          {formatT(p.tMs)}
        </span>
        <Badge tone={PHASE_TONE[p.phase]}>{p.phase}{p.phase === 'RUNNING' && p.speed > 1 ? ` ×${p.speed}` : ''}</Badge>
        {extra}
        <ConnDot connected={connected} />
      </div>
    </header>
  );
}

export function CutOffBanner({ p }: { p: PerceivedPicture }) {
  if (!p.cutOff) return null;
  return (
    <div role="alert" aria-live="assertive" className="stripes-bad flex shrink-0 items-center gap-3 border-b-2 border-bad px-4 py-2">
      <AlertOctagon className="text-bad" size={20} aria-hidden />
      <p className="text-sm">
        <strong className="font-mono tracking-wider text-bad">CUT OFF — ACT ON INTENT.</strong>{' '}
        <span className="text-ink">No radio or data path to {p.superior.label}</span>
        {p.cutOffSinceMs !== null && <span className="text-muted"> since {formatT(p.cutOffSinceMs)} ({formatAge(p.tMs - p.cutOffSinceMs)})</span>}
        <span className="text-muted">. Runner still available. Decisions now are scored against the commander&apos;s intent.</span>
      </p>
    </div>
  );
}

export function IntentCard({ p, readOnly, cmd }: { p: PerceivedPicture; readOnly?: boolean; cmd: Cmd }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.intent.text);
  const canEdit = p.role === 'CDR' && !readOnly && (p.phase === 'RUNNING' || p.phase === 'PAUSED');
  const age = p.tMs - p.intent.receivedAtMs;
  return (
    <section aria-label="Commander's intent" className={cn('shrink-0 border-b border-line px-3 py-2.5', p.cutOff ? 'bg-bad/[0.07]' : 'bg-panel2')}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Commander&apos;s intent</h2>
        <span className="font-mono text-[10px] text-muted">
          v{p.intent.version} · {p.intent.byCallsign} · rcvd {formatAge(age)} ago
        </span>
      </div>
      {editing ? (
        <div className="grid gap-2">
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Refined intent" />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={text.trim().length < 10}
              onClick={async () => {
                const r = await cmd({ type: 'UPDATE_INTENT', text }, 'Intent sent — it travels over your active net');
                if (r.ok) setEditing(false);
              }}
            >
              Transmit intent
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[13px] leading-snug text-ink">{p.intent.text}</p>
          {canEdit && (
            <Button size="xs" variant="ghost" aria-label="Refine intent" onClick={() => { setText(p.intent.text); setEditing(true); }}>
              <Pencil size={12} />
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
