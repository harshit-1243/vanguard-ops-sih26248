import { useState, type FormEvent } from 'react';
import { Crosshair, X } from 'lucide-react';
import {
  ACTIONS,
  CELL_ACTIONS,
  allCells,
  formatT,
  type Action,
  type ChannelId,
  type IntentSelf,
  type PerceivedPicture,
} from '@vanguard/shared';
import { Slider } from '@/components/ui/radix';
import { Badge, Button, Empty, Input, Label, SectionTitle, Select, Textarea } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { Cmd } from './parts';

export const ACTION_LABEL: Record<Action, string> = {
  ADVANCE: 'Advance',
  HOLD: 'Hold',
  WITHDRAW: 'Withdraw',
  REPOSITION: 'Reposition',
  REQUEST_RECON: 'Request recon',
  CALL_AIR: 'Call air support',
  RELAY: 'Relay',
  SWITCH_CHANNEL: 'Switch channel',
};

const HINT: Partial<Record<Action, string>> = {
  REQUEST_RECON: 'ALO retasks the UAV, NLO the coastal radar; others send a patrol (report in ~90 s).',
  CALL_AIR: 'ALO requests air (on station from T+15). Others can only call air already on station.',
  RELAY: 'EW relocates the rebro to the target sector (60 s setup); others act as a radio relay.',
};

export function DecisionPanel({
  p,
  cmd,
  targetCell,
  setTargetCell,
  basedOn,
  toggleBasedOn,
  clearBasedOn,
}: {
  p: PerceivedPicture;
  cmd: Cmd;
  targetCell: string | null;
  setTargetCell: (c: string | null) => void;
  basedOn: string[];
  toggleBasedOn: (id: string) => void;
  clearBasedOn: () => void;
}) {
  const [action, setAction] = useState<Action>('ADVANCE');
  const [channel, setChannel] = useState<ChannelId | ''>('');
  const [confidence, setConfidence] = useState(60);
  const [rationale, setRationale] = useState('');
  const [intentSelf, setIntentSelf] = useState<IntentSelf | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsCell = CELL_ACTIONS.includes(action);
  const live = p.phase === 'RUNNING' || p.phase === 'PAUSED';
  const nets = p.channels.filter((c) => c.messaging);

  const problems: string[] = [];
  if (needsCell && !targetCell) problems.push('Pick a target sector on the map');
  if (action === 'SWITCH_CHANNEL' && !channel) problems.push('Choose a channel');
  if (rationale.trim().length < 15) problems.push(`Rationale needs ${15 - rationale.trim().length} more characters`);
  if (!intentSelf) problems.push('Say whether this is consistent with intent');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problems.length) return setError(problems[0]!);
    setBusy(true);
    setError(null);
    const decision = {
      action,
      targetCell: needsCell ? targetCell : undefined,
      channel: action === 'SWITCH_CHANNEL' ? channel : undefined,
      confidence,
      rationale: rationale.trim(),
      basedOn,
      intentSelf,
    };
    const r = await cmd({ type: 'MAKE_DECISION', decision }, `Decision logged at ${formatT(p.tMs)}`);
    setBusy(false);
    if (r.ok) {
      setRationale('');
      setIntentSelf('');
      clearBasedOn();
    } else setError(r.error ?? 'Rejected');
  };

  if (!live) return <Empty>Decisions open when the exercise is running.</Empty>;

  return (
    <form onSubmit={submit} className="grid gap-4 p-3" aria-label="Decision">
      {p.cutOff && (
        <p className="rounded border border-bad/60 bg-bad/10 px-2 py-1.5 text-xs text-bad">
          You are CUT OFF. This decision will be recorded as made under mission command and scored against the intent.
        </p>
      )}
      <fieldset>
        <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Action</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {ACTIONS.map((a) => (
            <button
              type="button"
              key={a}
              aria-pressed={action === a}
              onClick={() => setAction(a)}
              className={cn('rounded-md border px-2 py-1.5 text-left text-xs', action === a ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:border-muted hover:text-ink')}
            >
              {ACTION_LABEL[a]}
            </button>
          ))}
        </div>
        {HINT[action] && <p className="mt-1.5 text-[11px] text-faint">{HINT[action]}</p>}
      </fieldset>

      {needsCell && (
        <div>
          <Label htmlFor="target">Target sector</Label>
          <div className="flex items-center gap-2">
            <Select id="target" className="w-28 font-mono" value={targetCell ?? ''} onChange={(e) => setTargetCell(e.target.value || null)}>
              <option value="">—</option>
              {allCells().map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <span className="flex items-center gap-1 text-[11px] text-muted"><Crosshair size={12} aria-hidden /> or click the map</span>
          </div>
        </div>
      )}
      {action === 'SWITCH_CHANNEL' && (
        <div>
          <Label htmlFor="dec-channel">New active channel</Label>
          <Select id="dec-channel" value={channel} onChange={(e) => setChannel(e.target.value as ChannelId)}>
            <option value="">—</option>
            {nets.map((n) => <option key={n.channel} value={n.channel}>{n.paceSlot ? `${n.paceSlot} · ` : ''}{n.channel} — {n.level}</option>)}
          </Select>
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="mb-0" htmlFor="conf-num">Confidence that this is sound</Label>
          <Input id="conf-num" type="number" min={0} max={100} className="h-7 w-16 text-right font-mono" value={confidence} onChange={(e) => setConfidence(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
        </div>
        <Slider value={confidence} onChange={setConfidence} label="Confidence" />
      </div>

      <div>
        <Label htmlFor="rationale">Rationale (required, ≥ 15 characters)</Label>
        <Textarea id="rationale" rows={3} maxLength={600} placeholder="What do you know, what are you assuming, why this?" value={rationale} onChange={(e) => setRationale(e.target.value)} />
        <p className={cn('mt-0.5 text-right font-mono text-[10px]', rationale.trim().length >= 15 ? 'text-faint' : 'text-warn')}>{rationale.trim().length}/15+</p>
      </div>

      <div>
        <Label>Based on (select items in Intel › basis)</Label>
        <div className="flex flex-wrap gap-1">
          {basedOn.length === 0 && <span className="text-[11px] text-faint">Nothing selected — that will be recorded too.</span>}
          {basedOn.map((id) => (
            <Badge key={id} tone="accent">
              {id}
              <button type="button" aria-label={`Remove ${id}`} onClick={() => toggleBasedOn(id)}><X size={10} /></button>
            </Badge>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Consistent with commander&apos;s intent?</legend>
        <div className="flex gap-1.5">
          {(['YES', 'NO', 'UNSURE'] as IntentSelf[]).map((v) => (
            <button type="button" key={v} aria-pressed={intentSelf === v} onClick={() => setIntentSelf(v)} className={cn('flex-1 rounded-md border py-1.5 text-xs', intentSelf === v ? 'border-accent bg-accent/10' : 'border-line text-muted hover:text-ink')}>
              {v === 'YES' ? 'Yes' : v === 'NO' ? 'No' : 'Unsure'}
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
      <Button type="submit" variant="primary" size="lg" disabled={busy}>
        {busy ? 'Logging…' : 'Commit decision'}
      </Button>
    </form>
  );
}

export function DecisionLog({ p }: { p: PerceivedPicture }) {
  return (
    <div>
      <SectionTitle>My decisions</SectionTitle>
      {p.decisions.length === 0 && <Empty>No decisions yet.</Empty>}
      <ol>
        {[...p.decisions].reverse().map((d) => (
          <li key={d.id} className="border-b border-line/70 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono text-muted">{formatT(d.tMs)}</span>
              <span className="font-semibold">{ACTION_LABEL[d.action]}</span>
              {d.targetCell && <span className="font-mono">{d.targetCell}</span>}
              {d.channel && <span className="font-mono">{d.channel}</span>}
              {d.cutOff && <Badge tone="bad">cut off</Badge>}
              <span className="ml-auto font-mono">{d.confidence}%</span>
            </div>
            <p className="mt-0.5 text-muted">{d.rationale}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
