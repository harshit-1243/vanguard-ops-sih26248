import { useState, type FormEvent } from 'react';
import { EyeOff } from 'lucide-react';
import type { PerceivedPicture } from '@vanguard/shared';
import { Button, Input, Label, Select } from '@/components/ui/primitives';
import type { Cmd } from './parts';

/** SAGAT freeze: the picture is blanked and the trainee answers from memory. */
export function ProbeOverlay({ p, cmd }: { p: PerceivedPicture; cmd: Cmd }) {
  const probe = p.probe!;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const full = Object.fromEntries(probe.questions.map((q) => [q.id, answers[q.id] || 'UNKNOWN']));
    await cmd({ type: 'ANSWER_PROBE', probeId: probe.id, answers: full }, 'Answers locked');
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-bg/[0.97] p-4" role="dialog" aria-modal="true" aria-labelledby="probe-title">
      <div className="w-full max-w-xl rounded-lg border border-accent/50 bg-panel p-6 shadow-2xl">
        <div className="flex items-center gap-2 text-accent">
          <EyeOff size={18} aria-hidden />
          <h2 id="probe-title" className="font-mono text-sm font-semibold tracking-[0.18em]">SITUATION FREEZE — SA PROBE</h2>
        </div>
        <p className="mt-2 text-sm text-muted">
          Your displays are blanked. Answer from what you currently believe. &ldquo;Unknown&rdquo; is an honest answer.
        </p>
        {probe.submitted ? (
          <p className="mt-6 rounded border border-ok/50 bg-ok/10 p-3 text-sm text-ok">Answers locked. Waiting for the DS to resume the exercise…</p>
        ) : (
          <form onSubmit={submit} className="mt-5 grid gap-4">
            {probe.questions.map((q, i) => (
              <div key={q.id}>
                <Label htmlFor={q.id} className="normal-case tracking-normal text-sm text-ink">
                  {i + 1}. {q.text}
                </Label>
                {q.input === 'number' ? (
                  <div className="flex gap-2">
                    <Input id={q.id} type="number" min={0} max={99} className="w-28 font-mono" value={answers[q.id] === 'UNKNOWN' ? '' : (answers[q.id] ?? '')} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                    <Button size="sm" variant={answers[q.id] === 'UNKNOWN' ? 'outline' : 'ghost'} onClick={() => setAnswers((a) => ({ ...a, [q.id]: 'UNKNOWN' }))}>Unknown</Button>
                  </div>
                ) : (
                  <Select id={q.id} className="max-w-60 font-mono" value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}>
                    <option value="">— choose —</option>
                    <option value="UNKNOWN">Unknown</option>
                    {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                )}
              </div>
            ))}
            <Button type="submit" variant="primary" size="lg" disabled={busy}>Lock answers</Button>
          </form>
        )}
      </div>
    </div>
  );
}
