import { useMemo, useState } from 'react';
import { FileText, Gavel, Radio, ScrollText } from 'lucide-react';
import type { PerceivedPicture } from '@vanguard/shared';
import { MapLegend, TacticalMap } from '@/components/map/TacticalMap';
import { perceivedLayers } from '@/components/map/adapters';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/radix';
import { CommsPanel } from './CommsPanel';
import { DecisionLog, DecisionPanel } from './DecisionPanel';
import { IntelFeed } from './IntelFeed';
import { CutOffBanner, IntentCard, type Cmd } from './parts';

/**
 * The trainee's whole working surface: map + intent + intel/comms/decide/log tabs.
 * Rendered for the trainee, and read-only for the DS "view as role" (same PerceivedPicture).
 */
export function RoleWorkspace({ p, cmd, readOnly }: { p: PerceivedPicture; cmd: Cmd; readOnly?: boolean }) {
  const [targetCell, setTargetCell] = useState<string | null>(null);
  const [basedOn, setBasedOn] = useState<string[]>([]);
  const [tab, setTab] = useState('intel');
  const layers = useMemo(() => perceivedLayers(p), [p]);
  const toggleBasedOn = (id: string) => setBasedOn((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id].slice(-20)));
  const conflictBadge = p.conflicts.filter((c) => !c.flagged).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CutOffBanner p={p} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,34%)]">
        <section className="flex min-h-[420px] flex-col border-r border-line p-3" aria-label="Tactical map (perceived picture)">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <span className="text-muted">
              Perceived picture — what <span className="font-mono text-ink">{p.callsign}</span> knows. Ages are time since observation.
            </span>
            {!readOnly && <span className="font-mono text-muted">target: <span className="text-accent">{targetCell ?? '—'}</span></span>}
          </div>
          <div className="min-h-0 flex-1">
            <TacticalMap
              terrain={p.terrain}
              features={p.features}
              objectives={p.objectives}
              markers={layers.markers}
              jammers={layers.jammers}
              selectedCell={readOnly ? null : targetCell}
              pickMode={readOnly ? null : 'target'}
              onCellClick={readOnly ? undefined : (c) => setTargetCell(c)}
              ariaLabel={`Tactical map for ${p.callsign}. Use arrow keys to move between sectors and Enter to select a target.`}
            />
          </div>
          <div className="mt-2">
            <MapLegend />
          </div>
        </section>
        <aside className="flex min-h-0 flex-col bg-panel" aria-label="Role panels">
          <IntentCard p={p} readOnly={readOnly} cmd={cmd} />
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList>
              <TabsTrigger value="intel"><FileText size={13} aria-hidden /> Intel{conflictBadge > 0 && <span className="rounded bg-warn px-1 font-mono text-[10px] text-accent-ink">{conflictBadge}</span>}</TabsTrigger>
              <TabsTrigger value="comms"><Radio size={13} aria-hidden /> Comms</TabsTrigger>
              {!readOnly && <TabsTrigger value="decide"><Gavel size={13} aria-hidden /> Decide</TabsTrigger>}
              <TabsTrigger value="log"><ScrollText size={13} aria-hidden /> Log</TabsTrigger>
            </TabsList>
            <TabsContent value="intel" className="overflow-hidden">
              <IntelFeed
                p={p}
                cmd={cmd}
                readOnly={readOnly}
                basedOn={basedOn}
                toggleBasedOn={toggleBasedOn}
                onFocusCell={(c) => !readOnly && setTargetCell(c)}
              />
            </TabsContent>
            <TabsContent value="comms" className="overflow-hidden">
              <CommsPanel p={p} cmd={cmd} readOnly={readOnly} />
            </TabsContent>
            {!readOnly && (
              <TabsContent value="decide">
                <DecisionPanel p={p} cmd={cmd} targetCell={targetCell} setTargetCell={setTargetCell} basedOn={basedOn} toggleBasedOn={toggleBasedOn} clearBasedOn={() => setBasedOn([])} />
              </TabsContent>
            )}
            <TabsContent value="log">
              <DecisionLog p={p} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
