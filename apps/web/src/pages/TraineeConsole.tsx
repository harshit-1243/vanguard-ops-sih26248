import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { FileBarChart, Hourglass } from 'lucide-react';
import { Toast } from '@/components/shell';
import { Badge, Button, Disclaimer, Panel } from '@/components/ui/primitives';
import { ConsoleHeader } from '@/components/trainee/parts';
import { ProbeOverlay } from '@/components/trainee/ProbeOverlay';
import { RoleWorkspace } from '@/components/trainee/RoleWorkspace';
import { api, type Briefing } from '@/lib/api';
import { clearIdentity, loadIdentity } from '@/lib/identity';
import { useSession } from '@/store/session';

function LobbyView() {
  const { code } = useParams();
  const picture = useSession((s) => s.picture)!;
  const lobby = useSession((s) => s.lobby);
  const [brief, setBrief] = useState<Briefing | null>(null);
  useEffect(() => {
    if (code) api.briefing(code).then(setBrief).catch(() => {});
  }, [code]);
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 p-6 lg:grid-cols-[1.4fr_1fr]">
      <Panel className="p-5">
        <div className="flex items-center gap-2 text-accent">
          <Hourglass size={16} aria-hidden />
          <p className="font-mono text-xs tracking-[0.18em]">WAITING FOR THE DS TO START</p>
        </div>
        <h1 className="mt-3 text-xl font-semibold">{picture.scenarioTitle} — orders</h1>
        {brief && (
          <dl className="mt-4 grid gap-3 text-sm leading-relaxed">
            {(['situation', 'mission', 'execution', 'command'] as const).map((k) =>
              brief.brief[k] ? (
                <div key={k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{k}</dt>
                  <dd className="mt-0.5">{brief.brief[k]}</dd>
                </div>
              ) : null,
            )}
          </dl>
        )}
      </Panel>
      <div className="grid content-start gap-5">
        <Panel className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Commander&apos;s intent</p>
          <p className="mt-2 text-sm leading-relaxed">{picture.intent.text}</p>
        </Panel>
        <Panel className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">You are</p>
          <p className="mt-1 font-mono text-lg text-blue">{picture.callsign}</p>
          <p className="text-sm text-muted">{picture.roleTitle} · reports to {picture.superior.label}</p>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">In the exercise</p>
          <ul className="mt-2 grid gap-1 text-sm">
            {(lobby?.roles ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span>{r.title} <span className="font-mono text-xs text-muted">{r.callsign}</span></span>
                {r.taken ? <Badge tone={r.connected ? 'ok' : 'neutral'}>{r.takenBy}{r.connected ? '' : ' (away)'}</Badge> : <Badge>open</Badge>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

export default function TraineeConsole() {
  const { code = '' } = useParams();
  const id = loadIdentity(code);
  const { connect, picture, connected, authError, cmd, ended } = useSession();

  useEffect(() => {
    if (id && id.actor !== 'DS') connect(code.toUpperCase(), id.token);
  }, [code, id?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!id || id.actor === 'DS') return <Navigate to={`/join?code=${code}`} replace />;
  if (authError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Panel className="max-w-sm p-6 text-center">
          <p className="text-sm text-bad">{authError}</p>
          <Button className="mt-4" variant="primary" onClick={() => { clearIdentity(code); location.assign(`/join?code=${code}`); }}>Re-join</Button>
        </Panel>
      </div>
    );
  }
  if (!picture) {
    return <div className="flex h-full items-center justify-center text-sm text-muted" role="status">Connecting to exercise {code}…</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConsoleHeader p={picture} connected={connected} />
      {ended && (
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-panel2 px-4 py-2 text-sm" role="status">
          <FileBarChart size={16} className="text-accent" aria-hidden />
          Exercise ended — the after-action review is available.
          <Link to={`/aar/${code}`} className="ml-auto rounded bg-accent px-3 py-1 text-xs font-semibold text-accent-ink">Open AAR</Link>
        </div>
      )}
      {picture.phase === 'LOBBY' ? <LobbyView /> : <RoleWorkspace p={picture} cmd={cmd} readOnly={ended} />}
      {picture.phase === 'PROBE' && picture.probe && <ProbeOverlay p={picture} cmd={cmd} />}
      <footer className="shrink-0 border-t border-line px-4 py-1.5">
        <Disclaimer />
      </footer>
      <Toast />
    </div>
  );
}
