import { useMemo, useState } from 'react';
import { Flag, Forward, Link2, ScanSearch, SquareCheck, Square } from 'lucide-react';
import { STALE_AFTER_MS, formatAge, type ChannelId, type IntelItem, type PerceivedPicture, type RoleId } from '@vanguard/shared';
import { ConfidenceBadge } from '@/components/status';
import { Badge, Button, Empty, Select } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { Cmd } from './parts';

const KIND_TONE: Record<IntelItem['kind'], 'red' | 'unk' | 'blue' | 'neutral' | 'ok'> = {
  CONTACT: 'red',
  NEGATIVE: 'unk',
  POSREP: 'blue',
  INFO: 'neutral',
  RECON: 'ok',
};

type Filter = 'ALL' | 'CONTACT' | 'CONFLICT' | 'POSREP' | 'INFO';

function ForwardBox({ p, item, cmd, onDone }: { p: PerceivedPicture; item: IntelItem; cmd: Cmd; onDone: () => void }) {
  const nets = p.channels.filter((c) => c.messaging).map((c) => c.channel);
  const [channel, setChannel] = useState<ChannelId>(p.activeChannel);
  const members = p.netMembers[channel] ?? [];
  const [to, setTo] = useState<RoleId[]>(members.includes(p.superior.id as RoleId) ? [p.superior.id as RoleId] : members.slice(0, 1));
  return (
    <div className="mt-2 grid gap-2 rounded border border-line bg-bg p-2">
      <Select aria-label="Forward over channel" value={channel} onChange={(e) => { setChannel(e.target.value as ChannelId); setTo([]); }}>
        {nets.map((n) => <option key={n} value={n}>{n}</option>)}
      </Select>
      <div className="flex flex-wrap gap-2 text-xs">
        {members.map((m) => (
          <label key={m} className="flex items-center gap-1">
            <input type="checkbox" className="accent-[var(--color-accent)]" checked={to.includes(m)} onChange={() => setTo((t) => (t.includes(m) ? t.filter((x) => x !== m) : [...t, m]))} />
            {p.roster.find((r) => r.role === m)?.callsign ?? m}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="xs" variant="primary" disabled={to.length === 0} onClick={async () => { const r = await cmd({ type: 'FORWARD_INTEL', itemId: item.id, channel, to }, 'Forwarded — subject to the same degradation'); if (r.ok) onDone(); }}>Send</Button>
        <Button size="xs" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

export function IntelFeed({
  p,
  cmd,
  readOnly,
  basedOn,
  toggleBasedOn,
  onFocusCell,
}: {
  p: PerceivedPicture;
  cmd: Cmd;
  readOnly?: boolean;
  basedOn: string[];
  toggleBasedOn: (id: string) => void;
  onFocusCell: (cell: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const conflictsOf = useMemo(() => {
    const m = new Map<string, { other: string; reason: string; flagged: boolean }[]>();
    for (const c of p.conflicts) {
      const [a, b] = c.itemIds;
      m.set(a, [...(m.get(a) ?? []), { other: b, reason: c.reason, flagged: c.flagged }]);
      m.set(b, [...(m.get(b) ?? []), { other: a, reason: c.reason, flagged: c.flagged }]);
    }
    return m;
  }, [p.conflicts]);
  const flagged = new Set(p.flaggedItemIds);
  const verifying = new Set(p.verificationItemIds);
  const items = [...p.intel]
    .reverse()
    .filter((i) =>
      filter === 'ALL' ? true : filter === 'CONFLICT' ? conflictsOf.has(i.id) : filter === 'CONTACT' ? ['CONTACT', 'NEGATIVE', 'RECON'].includes(i.kind) : i.kind === filter,
    );
  const live = !readOnly && (p.phase === 'RUNNING' || p.phase === 'PAUSED');

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-2 py-1.5" role="toolbar" aria-label="Filter intel">
        {(['ALL', 'CONTACT', 'CONFLICT', 'POSREP', 'INFO'] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={cn('rounded px-2 py-0.5 font-mono text-[10px] tracking-wide', filter === f ? 'bg-raised text-ink' : 'text-muted hover:text-ink')}>
            {f}
            {f === 'CONFLICT' && p.conflicts.length > 0 && <span className="ml-1 text-warn">{p.conflicts.length}</span>}
          </button>
        ))}
      </div>
      {items.length === 0 && <Empty>No intel received on this filter yet.</Empty>}
      <ol className="min-h-0 flex-1 overflow-y-auto" aria-label="Intel feed (newest first)">
        {items.map((i) => {
          const age = p.tMs - i.observedAtMs;
          const cf = conflictsOf.get(i.id) ?? [];
          const isFlagged = flagged.has(i.id);
          const picked = basedOn.includes(i.id);
          return (
            <li
              key={i.id}
              id={`intel-${i.id}`}
              className={cn('border-b border-line/70 px-3 py-2', highlight === i.id && 'bg-accent/10', cf.length > 0 && 'border-l-2 border-l-warn')}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={KIND_TONE[i.kind]}>{i.kind}</Badge>
                <span className="font-mono text-[11px] text-ink">{i.sourceLabel}</span>
                {i.forwardedBy && <span className="text-[11px] text-muted">via {i.forwardedBy}</span>}
                <span className="font-mono text-[10px] text-faint">{i.channel === 'OWN' ? 'own eyes' : i.channel}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {age > STALE_AFTER_MS && <Badge tone="warn">stale</Badge>}
                  <span className="font-mono text-[11px] tabular text-muted" title="Age since observation">{formatAge(age)} old</span>
                  <ConfidenceBadge c={i.confidence} />
                </span>
              </div>
              <p className={cn('mt-1 font-mono text-[12px] leading-snug', i.corrupted ? 'text-warn' : 'text-ink')}>
                {i.text}
                {i.corrupted && <span className="ml-1 text-[10px]">[partially garbled]</span>}
              </p>
              {cf.length > 0 && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-warn">
                  <Link2 size={11} aria-hidden /> Conflicts with
                  {cf.map((c) => (
                    <button
                      key={c.other}
                      className="font-mono underline decoration-dotted underline-offset-2 hover:text-ink"
                      title={c.reason}
                      onClick={() => {
                        setFilter('ALL');
                        setHighlight(c.other);
                        document.getElementById(`intel-${c.other}`)?.scrollIntoView({ block: 'center' });
                      }}
                    >
                      {c.other}
                    </button>
                  ))}
                  <span className="text-muted">— {cf[0]!.reason}</span>
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className="font-mono text-[10px] text-faint">{i.id}</span>
                {i.cell && (
                  <Button size="xs" variant="ghost" onClick={() => onFocusCell(i.cell!)} aria-label={`Select sector ${i.cell} on map`}>
                    {i.cell}
                  </Button>
                )}
                {live && (
                  <>
                    <Button size="xs" variant={picked ? 'outline' : 'ghost'} aria-pressed={picked} onClick={() => toggleBasedOn(i.id)} title="Use as basis for your next decision">
                      {picked ? <SquareCheck size={12} /> : <Square size={12} />} basis
                    </Button>
                    {cf.length > 0 && (
                      <Button size="xs" variant="ghost" disabled={isFlagged} onClick={() => cmd({ type: 'FLAG_CONFLICT', itemIds: [i.id, ...cf.map((c) => c.other)].slice(0, 10) }, 'Conflict flagged')}>
                        <Flag size={12} /> {isFlagged ? 'flagged' : 'flag conflict'}
                      </Button>
                    )}
                    {i.cell && i.kind !== 'POSREP' && (
                      <Button size="xs" variant="ghost" disabled={verifying.has(i.id)} onClick={() => cmd({ type: 'REQUEST_VERIFICATION', itemId: i.id }, 'Verification patrol tasked (~60 s)')}>
                        <ScanSearch size={12} /> {verifying.has(i.id) ? 'verifying' : 'verify'}
                      </Button>
                    )}
                    <Button size="xs" variant="ghost" onClick={() => setForwarding(forwarding === i.id ? null : i.id)}>
                      <Forward size={12} /> forward
                    </Button>
                  </>
                )}
                {!live && isFlagged && <Badge tone="warn">flagged</Badge>}
              </div>
              {forwarding === i.id && <ForwardBox p={p} item={i} cmd={cmd} onDone={() => setForwarding(null)} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
