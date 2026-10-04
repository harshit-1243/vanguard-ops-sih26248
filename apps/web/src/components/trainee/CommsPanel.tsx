import { useState, type FormEvent } from 'react';
import { Activity, Plane, Send, Shuffle } from 'lucide-react';
import { formatAge, formatT, type ChannelId, type PerceivedPicture, type RoleId } from '@vanguard/shared';
import { LinkPill } from '@/components/status';
import { Badge, Button, Empty, Input, Label, SectionTitle, Select } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { Cmd } from './parts';

export function CommsPanel({ p, cmd, readOnly }: { p: PerceivedPicture; cmd: Cmd; readOnly?: boolean }) {
  const live = !readOnly && (p.phase === 'RUNNING' || p.phase === 'PAUSED');
  const nets = p.channels.filter((c) => c.messaging);
  const [channel, setChannel] = useState<ChannelId>(p.activeChannel);
  const members = p.netMembers[channel] ?? [];
  const [to, setTo] = useState<RoleId[]>([]);
  const [text, setText] = useState('');
  const callsignOf = (r: string) => p.roster.find((x) => x.role === r)?.callsign ?? (r === 'HHQ' ? 'HHQ' : r);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const recipients = to.filter((r) => members.includes(r));
    const r = await cmd({ type: 'SEND_MESSAGE', channel, to: recipients, text }, 'Transmitted');
    if (r.ok) setText('');
  };

  const log = [
    ...p.messages.map((m) => ({ key: `r-${m.id}-${m.deliveredAtMs}`, t: m.deliveredAtMs, dir: 'in' as const, m })),
    ...p.sent.map((s) => ({ key: `s-${s.id}`, t: s.sentAtMs, dir: 'out' as const, s })),
  ].sort((a, b) => b.t - a.t);

  return (
    <div className="flex h-full flex-col">
      <SectionTitle right={<span className="font-mono text-[10px] text-muted">active: {p.activeChannel}</span>}>Nets · PACE</SectionTitle>
      <ul className="shrink-0 divide-y divide-line/70" aria-label="Channels">
        {p.channels.map((c) => {
          const hopCooldown = c.hopCooldownUntilMs !== null && c.hopCooldownUntilMs > p.tMs;
          return (
            <li key={c.channel} className={cn('flex items-center gap-2 px-3 py-1.5', c.isActive && 'bg-accent/[0.07]')}>
              <span className={cn('w-4 text-center font-mono text-xs font-bold', c.paceSlot ? 'text-accent' : 'text-faint')} title={c.paceSlot ? `PACE ${c.paceSlot}` : 'Not in PACE plan'}>
                {c.paceSlot ?? '·'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[11px] text-ink">{c.channel}{!c.messaging && <span className="text-faint"> (feed)</span>}</span>
                {c.peers.length > 0 && (
                  <span className="block truncate text-[10px] text-muted">
                    {c.peers.map((x) => `${x.peerLabel} ${x.level === 'CLEAR' ? '✓' : x.level === 'DEGRADED' ? '~' : '✕'}`).join('  ')}
                  </span>
                )}
              </span>
              {c.hopActiveUntilMs && <Badge tone="ok">hop</Badge>}
              <LinkPill level={c.level} hint={c.hint} />
              {live && c.messaging && !c.isActive && (
                <Button size="xs" variant="outline" onClick={() => { setChannel(c.channel); setTo([]); void cmd({ type: 'SWITCH_PACE', channel: c.channel }, `Active channel → ${c.channel}`); }}>
                  use
                </Button>
              )}
              {live && p.role === 'EW' && c.channel !== 'RUNNER' && (
                <Button size="xs" variant="ghost" disabled={hopCooldown} title={hopCooldown ? `Cooldown until ${formatT(c.hopCooldownUntilMs!)}` : 'Frequency hop: reduces jamming one level for 60 s'} onClick={() => cmd({ type: 'FREQ_HOP', channel: c.channel }, `Frequency hop on ${c.channel}`)}>
                  <Shuffle size={12} />
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {p.spectrum && (
        <div className="shrink-0 border-t border-line">
          <SectionTitle right={<Activity size={12} className="text-muted" />}>Spectrum (DF — approximate)</SectionTitle>
          {p.spectrum.length === 0 ? (
            <Empty>No hostile emitters detected within 4 km.</Empty>
          ) : (
            <ul className="px-3 py-1.5 text-xs">
              {p.spectrum.map((s) => (
                <li key={s.label} className="flex items-center gap-2 py-0.5 font-mono">
                  <span className="text-red">{s.label}</span>
                  <span className="text-muted">{s.bands.join('/')}</span>
                  <span>≈ {s.approxCell} ±1</span>
                  <Badge tone={s.signal === 'HIGH' ? 'bad' : s.signal === 'MED' ? 'warn' : 'neutral'}>{s.signal}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {p.air && (
        <div className="shrink-0 border-t border-line px-3 py-2 text-xs">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted"><Plane size={12} aria-hidden /> Assets</div>
          {p.role === 'ALO' && (
            <p>
              Air: {p.air.onStationAtMs === null ? <span className="text-muted">not requested — use Decide › Call air support</span> : p.air.onStationAtMs <= p.tMs ? <span className="text-ok">on station</span> : <span className="text-warn">on station {formatT(p.air.onStationAtMs)}</span>} · sorties {p.air.sortiesLeft}
            </p>
          )}
          {p.air.isrTasking.map((x) => (
            <p key={x.label} className="font-mono text-muted">{x.label} → {x.cell}</p>
          ))}
        </div>
      )}

      {live && (
        <form onSubmit={send} className="shrink-0 grid gap-2 border-t border-line p-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <Label htmlFor="msg-net">Net</Label>
              <Select id="msg-net" value={channel} onChange={(e) => { setChannel(e.target.value as ChannelId); setTo([]); }}>
                {nets.map((n) => (
                  <option key={n.channel} value={n.channel}>{n.channel} — {n.level}</option>
                ))}
              </Select>
            </div>
          </div>
          <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <legend className="sr-only">Recipients</legend>
            {members.length === 0 && <span className="text-faint">No other stations on this net.</span>}
            {members.map((m) => (
              <label key={m} className="flex items-center gap-1">
                <input type="checkbox" className="accent-[var(--color-accent)]" checked={to.includes(m)} onChange={() => setTo((t) => (t.includes(m) ? t.filter((x) => x !== m) : [...t, m]))} />
                {callsignOf(m)}
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <Input aria-label="Message text" placeholder="Message (travels through the degraded net)" maxLength={400} value={text} onChange={(e) => setText(e.target.value)} />
            <Button type="submit" variant="primary" disabled={!text.trim() || to.length === 0} aria-label="Send message">
              <Send size={14} />
            </Button>
          </div>
        </form>
      )}

      <SectionTitle className="border-t">Traffic</SectionTitle>
      <ol className="min-h-0 flex-1 overflow-y-auto" aria-label="Message log">
        {log.length === 0 && <Empty>No traffic yet.</Empty>}
        {log.map((e) =>
          e.dir === 'in' ? (
            <li key={e.key} className="border-b border-line/60 px-3 py-1.5">
              <div className="flex items-center gap-2 text-[11px]">
                <Badge tone={e.m.kind === 'INTENT' ? 'accent' : 'blue'}>{e.m.kind === 'INTENT' ? 'INTENT' : 'RX'}</Badge>
                <span className="font-mono text-ink">{e.m.fromCallsign}</span>
                <span className="font-mono text-faint">{e.m.channel}</span>
                <span className="ml-auto font-mono text-muted">{formatT(e.m.deliveredAtMs)} · sent {formatAge(e.m.deliveredAtMs - e.m.sentAtMs)} earlier</span>
              </div>
              <p className={cn('mt-0.5 text-[12.5px]', e.m.corrupted && 'text-warn')}>{e.m.text}{e.m.corrupted && ' [garbled]'}</p>
            </li>
          ) : (
            <li key={e.key} className="border-b border-line/60 px-3 py-1.5 opacity-80">
              <div className="flex items-center gap-2 text-[11px]">
                <Badge>{e.s.kind === 'FORWARD' ? 'FWD' : e.s.kind === 'INTENT' ? 'INTENT TX' : 'TX'}</Badge>
                <span className="font-mono text-muted">→ {e.s.to.map(callsignOf).join(', ')}</span>
                <span className="font-mono text-faint">{e.s.channel}</span>
                <span className="ml-auto font-mono text-muted">{formatT(e.s.sentAtMs)} · no receipt</span>
              </div>
              <p className="mt-0.5 text-[12.5px] text-muted">{e.s.text}</p>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
