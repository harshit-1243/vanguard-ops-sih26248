import { AlertTriangle, CheckCircle2, CircleSlash, Radio, Waves } from 'lucide-react';
import type { LinkHint, LinkLevelName, Soundness } from '@vanguard/shared';
import { cn } from '@/lib/utils';
import { Badge } from './ui/primitives';

/** Link state: icon + text + colour (never colour alone). */
export function LinkPill({ level, hint, compact }: { level: LinkLevelName; hint?: LinkHint; compact?: boolean }) {
  const cfg = {
    CLEAR: { tone: 'ok' as const, Icon: CheckCircle2, text: 'CLEAR' },
    DEGRADED: { tone: 'warn' as const, Icon: Waves, text: 'DEGRADED' },
    DENIED: { tone: 'bad' as const, Icon: CircleSlash, text: 'DENIED' },
  }[level];
  return (
    <Badge tone={cfg.tone} title={hint && hint !== 'OK' ? `${cfg.text} — ${hint === 'JAMMING' ? 'noise / jamming heard' : 'no signal'}` : cfg.text}>
      <cfg.Icon size={11} aria-hidden />
      {!compact && cfg.text}
      {!compact && hint === 'JAMMING' && <span className="normal-case opacity-80">· jam</span>}
      {compact && <span className="sr-only">{cfg.text}</span>}
    </Badge>
  );
}

export function SoundBadge({ s }: { s: Soundness }) {
  const tone = s === 'SOUND' ? 'ok' : s === 'RISKY' ? 'warn' : 'bad';
  const mark = s === 'SOUND' ? '✓' : s === 'RISKY' ? '!' : '✕';
  return (
    <Badge tone={tone}>
      <span aria-hidden>{mark}</span>
      {s}
    </Badge>
  );
}

export function ConfidenceBadge({ c }: { c: 'H' | 'M' | 'L' }) {
  return (
    <Badge tone={c === 'H' ? 'ok' : c === 'M' ? 'neutral' : 'warn'} title={`Confidence ${c === 'H' ? 'high' : c === 'M' ? 'medium' : 'low'}`}>
      CONF {c}
    </Badge>
  );
}

export function ConnDot({ connected }: { connected: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px]', connected ? 'text-ok' : 'text-bad')}>
      {connected ? <Radio size={12} aria-hidden /> : <AlertTriangle size={12} aria-hidden />}
      {connected ? 'Server link' : 'Reconnecting…'}
    </span>
  );
}
