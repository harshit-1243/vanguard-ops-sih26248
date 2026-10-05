import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, KeyRound, LibraryBig, LogOut } from 'lucide-react';
import { PageShell } from '@/components/shell';
import { Button, Input, Label, Panel } from '@/components/ui/primitives';
import { adminApi, getAdminKey, setAdminKey } from '@/lib/admin';
import { cn } from '@/lib/utils';

/** Header nav for the course-director area. */
export function AdminNav({ open }: { open: boolean }) {
  const { pathname } = useLocation();
  const item = (to: string, label: string, Icon: typeof BarChart3) => (
    <Link
      to={to}
      aria-current={pathname.startsWith(to) ? 'page' : undefined}
      className={cn('inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs', pathname.startsWith(to) ? 'bg-raised text-ink' : 'text-muted hover:text-ink')}
    >
      <Icon size={13} aria-hidden /> {label}
    </Link>
  );
  return (
    <nav aria-label="Course director" className="flex items-center gap-1">
      {item('/scenarios', 'Scenarios', LibraryBig)}
      {item('/analytics', 'Analytics', BarChart3)}
      {!open && getAdminKey() && (
        <button
          className="ml-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
          onClick={() => {
            setAdminKey(null);
            location.reload();
          }}
        >
          <LogOut size={13} aria-hidden /> Lock
        </button>
      )}
    </nav>
  );
}

/**
 * Course-director area guard: asks for ADMIN_KEY once per tab when the server requires one.
 * Without ADMIN_KEY (closed LAN / local) the area is open and a note says so.
 */
export function AdminGate({ children, wide = true }: { children: (open: boolean) => ReactNode; wide?: boolean }) {
  const [state, setState] = useState<'loading' | 'locked' | 'ok'>('loading');
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .status()
      .then(async (s) => {
        setOpen(!s.required);
        if (!s.required) return setState('ok');
        const k = getAdminKey();
        if (!k) return setState('locked');
        try {
          await adminApi.login(k);
          setState('ok');
        } catch {
          setAdminKey(null);
          setState('locked');
        }
      })
      .catch((e: Error) => {
        setErr(e.message);
        setState('locked');
      });
  }, []);

  if (state === 'loading') return <PageShell wide={wide}><p className="text-sm text-muted">Loading…</p></PageShell>;
  if (state === 'locked') {
    return (
      <PageShell right={<AdminNav open />}>
        <Panel className="mx-auto max-w-md p-6">
          <h1 className="flex items-center gap-2 text-lg font-semibold"><KeyRound size={18} className="text-accent" aria-hidden /> Course director</h1>
          <p className="mt-1 text-sm text-muted">The scenario editor and cross-course analytics need the course-director key (<code className="font-mono">ADMIN_KEY</code> on the server).</p>
          <form
            className="mt-5 grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              try {
                await adminApi.login(key);
                setAdminKey(key);
                setState('ok');
              } catch (x) {
                setErr((x as Error).message);
              }
            }}
          >
            <div>
              <Label htmlFor="admin-key">Course-director key</Label>
              <Input id="admin-key" type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} />
            </div>
            {err && <p role="alert" className="text-sm text-bad">{err}</p>}
            <Button variant="primary" type="submit" disabled={!key}>Unlock</Button>
          </form>
        </Panel>
      </PageShell>
    );
  }
  return <>{children(open)}</>;
}

export function OpenModeNote({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <p className="mb-4 rounded-md border border-warn/40 bg-warn/[0.06] px-3 py-2 text-xs text-muted">
      <strong className="text-warn">Open mode:</strong> this server has no <code className="font-mono">ADMIN_KEY</code>, so anyone who can reach it can edit scenarios and view analytics. Fine on a closed LAN; set a key for internet deployments.
    </p>
  );
}
