import { useEffect, useMemo, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatAge, formatT, type ReplayResponse, type RoleId } from '@vanguard/shared';
import { TacticalMap, type MapMarker } from '@/components/map/TacticalMap';
import { glyph } from '@/components/map/adapters';
import { Badge, Button } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Replay scrubber that rebuilds state from the event log (server-side) at 10 s resolution. */
export function ReplayPlayer({ code, token, roles, features, objectives }: { code: string; token: string; roles: RoleId[]; features: { id: string; label: string; kind: string; cell: string }[]; objectives: { cell: string; text: string }[] }) {
  const [view, setView] = useState<'truth' | RoleId>('truth');
  const [data, setData] = useState<ReplayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    api
      .get<ReplayResponse>(`/api/sessions/${code}/replay?view=${view}&stepS=10`, token)
      .then((r) => {
        if (!live) return;
        setData(r);
        setI((x) => Math.min(x, r.frames.length - 1));
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [code, token, view]);

  useEffect(() => {
    if (!playing || !data) return;
    const t = setInterval(() => setI((x) => (x + 1 >= data.frames.length ? (setPlaying(false), x) : x + 1)), 1000 / speed);
    return () => clearInterval(t);
  }, [playing, speed, data]);

  const f = data?.frames[i];
  const markers: MapMarker[] = useMemo(
    () =>
      (f?.units ?? []).map((u) => ({
        id: u.id,
        side: u.type === 'NEG' ? 'UNK' : u.side,
        negative: u.type === 'NEG',
        x: u.x,
        y: u.y,
        glyph: glyph(u.type),
        label: u.label,
        sub: u.ageMs !== undefined ? formatAge(u.ageMs) : undefined,
        decoy: u.decoy,
        conflict: u.conflict,
        destroyed: u.status === 'DESTROYED',
        faded: u.status !== 'ACTIVE' || (u.ageMs ?? 0) > 300_000,
        own: view !== 'truth' && u.id === 'own',
      })),
    [f, view],
  );
  const jammers = (f?.jammers ?? []).map((j, k) => {
    const col = j.cell.charCodeAt(0) - 65;
    const row = Number(j.cell[1]) - 1;
    return { id: `j${k}`, x: col + 0.5, y: row + 0.5, radius: j.radius, active: j.active, label: view === 'truth' ? 'jammer' : 'emitter?', estimate: view !== 'truth' };
  });

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="aspect-square max-h-[560px] w-full rounded-lg border border-line bg-bg p-2">
        {data && f ? (
          <TacticalMap terrain={data.terrain} features={features} objectives={objectives} markers={markers} jammers={jammers} ariaLabel={`Replay map at ${formatT(f.tMs)}, ${view === 'truth' ? 'ground truth' : `${view}'s perceived picture`}`} />
        ) : (
          <p className="p-6 text-sm text-muted" role="status">{error ?? 'Rebuilding state from the event log…'}</p>
        )}
      </div>
      <div className="grid content-start gap-3">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">View</p>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Replay view">
            {(['truth', ...roles] as const).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={cn('rounded border px-2 py-1 font-mono text-xs', view === v ? 'border-accent bg-accent/15' : 'border-line text-muted hover:text-ink')}>
                {v === 'truth' ? 'Ground truth' : v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="primary" disabled={!data} onClick={() => { if (data && i >= data.frames.length - 1) setI(0); setPlaying(!playing); }} aria-label={playing ? 'Pause replay' : 'Play replay'}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </Button>
          {[1, 4, 10].map((s) => (
            <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)} className={cn('rounded px-1.5 py-0.5 font-mono text-xs', speed === s ? 'bg-raised text-ink' : 'text-muted')}>×{s}</button>
          ))}
          <span className="ml-auto font-mono text-lg tabular">{f ? formatT(f.tMs) : '--:--'}</span>
        </div>
        <input
          type="range"
          aria-label="Replay time"
          min={0}
          max={Math.max(0, (data?.frames.length ?? 1) - 1)}
          value={i}
          onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }}
          className="w-full accent-[var(--color-accent)]"
        />
        {f && f.cutOff.length > 0 && <p className="text-xs"><Badge tone="bad">cut off</Badge> {f.cutOff.join(', ')}</p>}
        <p className="min-h-10 rounded border border-line bg-panel2 p-2 font-mono text-[11px] text-muted" aria-live="polite">{f?.note ?? 'No notable event in this interval.'}</p>
        <p className="text-[11px] text-faint">
          {view === 'truth' ? 'Ground truth: true positions, decoys and jammers.' : `Exactly what ${view} believed at that moment (positions from reports, ages shown).`} Frames are rebuilt deterministically from seed + input log.
        </p>
      </div>
    </div>
  );
}
