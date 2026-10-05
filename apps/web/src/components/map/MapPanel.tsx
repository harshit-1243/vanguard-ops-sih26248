import { Suspense, lazy, useState } from 'react';
import { Box, Map as MapIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MapView, type MapViewProps } from './MapView';

const SandTable3D = lazy(() => import('./SandTable3D'));

/** 2D tactical map ⇄ 3D sand table (WebXR-capable) over the same role-scoped data. */
export function MapPanel(props: MapViewProps & { title: string }) {
  const [mode, setMode] = useState<'map' | '3d'>('map');
  return (
    <div className="relative h-full w-full">
      <div className="absolute right-12 top-2 z-10 flex overflow-hidden rounded border border-line bg-panel/95 text-[11px]" role="group" aria-label="Map mode">
        <button type="button" aria-pressed={mode === 'map'} onClick={() => setMode('map')} className={cn('flex items-center gap-1 px-2 py-1', mode === 'map' ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink')}>
          <MapIcon size={12} /> Map
        </button>
        <button type="button" aria-pressed={mode === '3d'} onClick={() => setMode('3d')} className={cn('flex items-center gap-1 px-2 py-1', mode === '3d' ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink')}>
          <Box size={12} /> 3D · VR
        </button>
      </div>
      {mode === 'map' ? (
        <MapView {...props} />
      ) : (
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted" role="status">Building the sand table…</div>}>
          <SandTable3D terrain={props.terrain} markers={props.markers} jammers={props.jammers} links={props.links} objectives={props.objectives} title={props.title} animMs={props.animMs} />
        </Suspense>
      )}
    </div>
  );
}
