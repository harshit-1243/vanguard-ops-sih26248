import { useEffect, useState } from 'react';
import { Lightbulb, Sparkles, Zap } from 'lucide-react';
import type { DsCommand, NarrativeBlock } from '@vanguard/shared';
import { Badge, Button, Empty } from '@/components/ui/primitives';
import type { Cmd } from '@/components/trainee/parts';
import { api } from '@/lib/api';
import { loadIdentity } from '@/lib/identity';

interface Suggestion {
  id: string;
  title: string;
  objective: string;
  why: string;
  command: DsCommand;
}

export function useAiStatus(): { provider: string; enabled: boolean } | null {
  const [status, setStatus] = useState<{ provider: string; enabled: boolean } | null>(null);
  useEffect(() => {
    fetch('/api/ai/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  return status;
}

export function AiChip() {
  const s = useAiStatus();
  if (!s) return null;
  return (
    <Badge tone={s.enabled ? 'accent' : 'neutral'} title={s.enabled ? `AI drafts by ${s.provider}` : 'AI off — template text (set LLM_PROVIDER to enable)'}>
      <Sparkles size={10} aria-hidden /> {s.enabled ? `AI · ${s.provider.split(':')[0]}` : 'AI off'}
    </Badge>
  );
}

/** Suggests the next friction from the live state; one click applies it. */
export function AiAdvisor({ code, live, cmd }: { code: string; live: boolean; cmd: Cmd }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [briefing, setBriefing] = useState<NarrativeBlock | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggest = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = loadIdentity(code)?.token ?? '';
      const r = await api.post<{ suggestions: Suggestion[]; briefing: NarrativeBlock | null }>(`/api/sessions/${code}/ai/advisor`, {}, token);
      setItems(r.suggestions);
      setBriefing(r.briefing);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted">Reads the live truth and trainee behaviour, proposes the next friction for a training objective.</p>
        <Button size="sm" variant="outline" disabled={!live || busy} onClick={() => void suggest()}>
          <Lightbulb size={13} /> {busy ? 'Thinking…' : 'Suggest next inject'}
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
      {briefing && (
        <p className="rounded border border-accent/40 bg-accent/[0.06] p-2 text-xs">
          <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-accent"><Sparkles size={10} /> AI-generated draft · {briefing.provider}</span>
          {briefing.text}
        </p>
      )}
      {items && items.length === 0 && <Empty>No suggestion right now — the exercise is already exercising every objective.</Empty>}
      {items?.map((s) => (
        <div key={s.id} className="rounded border border-line bg-bg p-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-ink">{s.title}</p>
              <p className="mt-0.5 text-[11px] text-accent">{s.objective}</p>
            </div>
            <Button size="xs" variant="primary" disabled={!live} onClick={() => cmd(s.command, `Applied: ${s.title}`).then((r) => r.ok && setItems((x) => x?.filter((y) => y.id !== s.id) ?? null))}>
              <Zap size={11} /> Apply
            </Button>
          </div>
          <p className="mt-1 text-muted">{s.why}</p>
        </div>
      ))}
    </div>
  );
}
