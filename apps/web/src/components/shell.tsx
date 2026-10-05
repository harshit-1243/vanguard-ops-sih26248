import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useSession } from '@/store/session';
import { cn } from '@/lib/utils';
import { Disclaimer } from './ui/primitives';

export const TEAM = 'K18';

/** Compass arrow on a map square — same mark as the landing page. */
export function Emblem({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect x="1.5" y="1.5" width="25" height="25" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
      <line x1="14" y1="2" x2="14" y2="26" stroke="var(--color-accent)" strokeOpacity=".35" />
      <line x1="2" y1="14" x2="26" y2="14" stroke="var(--color-accent)" strokeOpacity=".35" />
      <polygon points="14,5 20,22 14,18 8,22" fill="var(--color-accent)" />
    </svg>
  );
}

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-sm focus-visible:outline-2" aria-label="VANGUARD OPS home">
      <Emblem size={compact ? 22 : 26} />
      <span className={cn('font-display font-extrabold tracking-[0.14em] text-ink [font-stretch:125%]', compact ? 'text-[12px]' : 'text-[14px]')}>VANGUARD&nbsp;OPS</span>
    </Link>
  );
}

/** Message-header strip (as on the landing page). */
export function ExerciseStrip() {
  return (
    <div className="flex h-7 items-center justify-between gap-4 overflow-hidden whitespace-nowrap border-b border-[#222a31] bg-[#080b0e] px-5 font-mono text-[10.5px] font-medium tracking-[0.16em] text-muted">
      <span>EXERCISE · EXERCISE · EXERCISE<span className="hidden sm:inline"> — SYNTHETIC TRAINING DATA</span></span>
      <span className="hidden text-faint md:inline">SIH26248 · TEAM {TEAM}</span>
    </div>
  );
}

/** A–H column ruler: pages align to the map grid, like the landing page sections. */
export function Ruler({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('grid grid-cols-8 font-mono text-[10px] tracking-[0.1em] text-faint', className)}>
      {[...'ABCDEFGH'].map((c, i) => (
        <span key={c} className={cn('border-l border-line pb-2 pl-1.5', i === 7 && 'border-r')}>{c}</span>
      ))}
    </div>
  );
}

/** Page title block: orders-style kicker, display title, one-line description, optional actions. */
export function PageHeader({ kicker, title, sub, right, className }: { kicker: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-8', className)}>
      <Ruler />
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-t border-line pt-5">
        <div className="max-w-3xl">
          <p className="font-mono text-[11.5px] font-medium tracking-[0.16em] text-accent">{kicker}</p>
          <h1 className="mt-2 text-[clamp(28px,3.4vw,44px)] font-bold leading-[1.02] text-head">{title}</h1>
          {sub && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{sub}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}

export function PageShell({ children, right, wide }: { children: ReactNode; right?: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-full flex-col">
      <ExerciseStrip />
      <header className="flex h-14 items-center justify-between gap-4 border-b border-line bg-panel/60 px-5">
        <Brand />
        {right}
      </header>
      <main className={cn('mx-auto w-full flex-1 px-5 py-10', wide ? 'max-w-6xl' : 'max-w-4xl')}>{children}</main>
      <footer className="border-t border-line px-5 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-10 gap-y-2">
          <p className="font-mono text-[11px] font-medium tracking-[0.12em] text-muted">SIH 2026 · SIH26248 · TEAM {TEAM}</p>
          <Disclaimer />
        </div>
      </footer>
      <Toast />
    </div>
  );
}

export function Toast() {
  const flash = useSession((s) => s.flash);
  if (!flash) return null;
  return (
    <div
      role={flash.kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-md border px-4 py-2 text-sm shadow-xl',
        flash.kind === 'error' ? 'border-bad/60 bg-[#2a1614] text-bad' : 'border-ok/60 bg-[#13261c] text-ok',
      )}
    >
      {flash.kind === 'error' ? '✕ ' : '✓ '}
      {flash.text}
    </div>
  );
}
