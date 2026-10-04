import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useSession } from '@/store/session';
import { cn } from '@/lib/utils';
import { Disclaimer } from './ui/primitives';

export function Emblem({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="1.5" y="1.5" width="21" height="21" rx="2" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" />
      <path d="M1.5 9h21M1.5 15h21M9 1.5v21M15 1.5v21" stroke="var(--color-line)" strokeWidth="1" />
      <path d="M12 5.5 L17.5 17 L12 14.2 L6.5 17 Z" fill="var(--color-accent)" />
    </svg>
  );
}

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 rounded focus-visible:outline-2" aria-label="VANGUARD OPS home">
      <Emblem />
      <span className={cn('font-mono font-semibold tracking-[0.2em] text-ink', compact ? 'text-xs' : 'text-sm')}>VANGUARD&nbsp;OPS</span>
    </Link>
  );
}

export function PageShell({ children, right, wide }: { children: ReactNode; right?: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b border-line px-5">
        <Brand />
        {right}
      </header>
      <main className={cn('mx-auto w-full flex-1 px-5 py-8', wide ? 'max-w-6xl' : 'max-w-4xl')}>{children}</main>
      <footer className="border-t border-line px-5 py-3">
        <Disclaimer />
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
