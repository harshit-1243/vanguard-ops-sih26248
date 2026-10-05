import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { LobbyInfo, RoleId } from '@vanguard/shared';
import { PageHeader, PageShell } from '@/components/shell';
import { Badge, Button, Input, Label, Panel } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { saveIdentity } from '@/lib/identity';
import { cn } from '@/lib/utils';

export default function Join() {
  const [params] = useSearchParams();
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [role, setRole] = useState<RoleId | null>(null);
  const [callsign, setCallsign] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setLobby(null);
    setError(null);
    if (code.length !== 6) return;
    let live = true;
    const load = () =>
      api
        .lobby(code)
        .then((l) => live && setLobby(l))
        .catch((e: Error) => live && setError(e.message === 'Exercise not found' ? 'Exercise not found' : e.message));
    void load();
    const t = setInterval(load, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [code]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!role) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.join(code, role, callsign);
      saveIdentity(code, { token: r.playerToken, actor: r.roleId, callsign: r.callsign });
      navigate(`/play/${code}`);
    } catch (err) {
      setError((err as Error).message);
      api.lobby(code).then(setLobby).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const validCallsign = /^[A-Za-z0-9 -]{2,16}$/.test(callsign.trim());

  return (
    <PageShell>
      <PageHeader kicker="TRAINEE · REPORT IN" title="Join exercise." sub="Enter the code from your Directing Staff, pick a free role and your callsign. You will see only what reaches you." />
      <Panel className="mx-auto max-w-xl p-6">
        <form className="grid gap-5" onSubmit={submit}>
          <div>
            <Label htmlFor="code">Session code</Label>
            <Input
              id="code"
              autoFocus
              autoComplete="off"
              maxLength={6}
              placeholder="e.g. K7Q2MX"
              className="h-14 border-accent/40 font-mono text-2xl uppercase tracking-[0.32em]"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </div>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          {lobby && (
            <>
              <div className="rounded-md border border-line bg-panel2 p-3">
                <p className="font-display text-lg font-bold text-head">{lobby.title}</p>
                <p className="text-xs text-muted">{lobby.theatre} · {lobby.phase === 'LOBBY' ? 'waiting to start' : lobby.phase.toLowerCase()}</p>
              </div>
              <fieldset>
                <legend className="mb-2 font-mono text-[11.5px] font-medium tracking-[0.16em] text-accent">ROLE</legend>
                <div className="grid gap-2" role="radiogroup">
                  {lobby.roles.map((r) => (
                    <label
                      key={r.id}
                      className={cn(
                        'flex items-start gap-3 rounded-md border p-3',
                        r.taken ? 'cursor-not-allowed border-line/50 opacity-50' : 'cursor-pointer border-line hover:border-muted',
                        role === r.id && 'border-accent bg-accent/[0.06]',
                      )}
                    >
                      <input type="radio" name="role" aria-label={`${r.title} (${r.callsign})${r.taken ? `, taken by ${r.takenBy}` : ""}`} data-testid={`role-${r.id}`} className="mt-1 accent-[var(--color-accent)]" disabled={r.taken} checked={role === r.id} onChange={() => setRole(r.id)} />
                      <span className="flex-1">
                        <span className="flex items-center justify-between gap-2 text-sm font-medium">
                          {r.title}
                          {r.taken ? <Badge tone="neutral">taken · {r.takenBy}</Badge> : <Badge tone="ok">free</Badge>}
                        </span>
                        <span className="font-mono text-xs text-muted">{r.callsign}</span>
                        <span className="mt-1 block text-xs text-muted">{r.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <Label htmlFor="callsign">Your callsign</Label>
                <Input id="callsign" maxLength={16} placeholder="e.g. VIPER" value={callsign} onChange={(e) => setCallsign(e.target.value)} aria-describedby="cs-help" />
                <p id="cs-help" className="mt-1 text-[11px] text-faint">2–16 letters, digits, space or dash. No passwords needed.</p>
              </div>
              <Button type="submit" variant="primary" size="lg" disabled={!role || !validCallsign || busy || lobby.phase === 'ENDED'}>
                {busy ? 'Joining…' : 'Join'}
              </Button>
            </>
          )}
        </form>
      </Panel>
    </PageShell>
  );
}
