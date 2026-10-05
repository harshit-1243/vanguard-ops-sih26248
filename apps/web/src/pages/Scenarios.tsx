import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Download, Pencil, Trash2, Upload } from 'lucide-react';
import type { Scenario, ScenarioListItem } from '@vanguard/shared';
import { AdminGate, AdminNav, OpenModeNote } from '@/components/admin/AdminGate';
import { PageShell } from '@/components/shell';
import { Badge, Button, Panel } from '@/components/ui/primitives';
import { adminApi, saveBlob } from '@/lib/admin';

function Library({ open }: { open: boolean }) {
  const [list, setList] = useState<ScenarioListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const load = () => adminApi.scenarios().then(setList).catch((e: Error) => setErr(e.message));
  useEffect(() => {
    void load();
  }, []);

  const exportOne = async (id: string) => {
    try {
      const { scenario } = await adminApi.scenario(id);
      saveBlob(new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' }), `${id}.json`);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <PageShell wide right={<AdminNav open={open} />}>
      <OpenModeNote open={open} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Scenario library</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Built-in templates are read-only — duplicate one to make your own. Custom scenarios are validated and dry-run before saving, and each
            exercise keeps a snapshot, so editing a scenario never changes a past AAR.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import scenario JSON"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const draft = JSON.parse(await f.text()) as Scenario;
                navigate('/scenarios/new', { state: { draft } });
              } catch (x) {
                setErr(`Not valid JSON: ${(x as Error).message}`);
              }
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload size={14} aria-hidden /> Import JSON</Button>
        </div>
      </div>
      {err && <p role="alert" className="mt-4 text-sm text-bad">{err}</p>}
      {!list ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : (
        <ul className="mt-6 grid gap-3 md:grid-cols-2" aria-label="Scenarios">
          {list.map((s) => (
            <li key={s.id}>
              <Panel className="flex h-full flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{s.title}</h2>
                    <p className="font-mono text-[11px] text-faint">{s.id}</p>
                  </div>
                  <div className="flex gap-1">
                    {s.custom ? <Badge tone="accent">custom</Badge> : <Badge>built-in</Badge>}
                    <Badge>{s.durationMin} min</Badge>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted">{s.theatre}</p>
                <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-muted">{s.summary}</p>
                <p className="mt-2 font-mono text-[11px] text-faint">
                  {s.roles.length} roles · {s.mselCount} MSEL{s.updatedAt ? ` · saved ${new Date(s.updatedAt).toLocaleString()}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.custom && (
                    <Button size="sm" variant="primary" onClick={() => navigate(`/scenarios/edit/${s.id}`)}><Pencil size={13} aria-hidden /> Edit</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => navigate(`/scenarios/new?from=${encodeURIComponent(s.id)}`)}><Copy size={13} aria-hidden /> Duplicate</Button>
                  <Button size="sm" variant="ghost" onClick={() => exportOne(s.id)}><Download size={13} aria-hidden /> JSON</Button>
                  {s.custom && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      aria-label={`Delete ${s.title}`}
                      onClick={async () => {
                        if (!confirm(`Delete scenario "${s.title}"? Exercises already run on it keep their own copy.`)) return;
                        try {
                          await adminApi.remove(s.id);
                          await load();
                        } catch (e) {
                          setErr((e as Error).message);
                        }
                      }}
                    >
                      <Trash2 size={13} aria-hidden /> Delete
                    </Button>
                  )}
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-muted">
        Ready to run one? <Link to="/create" className="text-accent underline">Create an exercise</Link> — custom scenarios appear in the list.
      </p>
    </PageShell>
  );
}

export default function Scenarios() {
  return <AdminGate>{(open) => <Library open={open} />}</AdminGate>;
}
