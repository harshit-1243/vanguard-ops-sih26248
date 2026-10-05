import { COLS, COL_LETTERS, ROWS, TERRAIN_CODES, cellCentre, cellFromIndex, terrainAt, type Scenario, type TerrainCode } from '@vanguard/shared';
import { cn } from '@/lib/utils';

export const TERRAIN_COLOR: Record<TerrainCode, string> = {
  '.': 'var(--color-t-open)',
  F: 'var(--color-t-forest)',
  U: 'var(--color-t-urban)',
  '~': 'var(--color-t-river)',
  '=': 'var(--color-t-bridge)',
  '^': 'var(--color-t-ridge)',
  W: 'var(--color-t-sea)',
  M: 'var(--color-t-marsh)',
  H: 'var(--color-t-hills)',
};
export const TERRAIN_OPTIONS = Object.entries(TERRAIN_CODES) as [TerrainCode, string][];

const C = 64;

/**
 * Editable 8×8 scenario grid: terrain (colour + code letter), units with their routes, objectives,
 * forbidden cells, sensors, features and MSEL jammers. Every cell is a keyboard-reachable button.
 */
export function GridEditor({ sc, onCell, selectedUnit, hint }: { sc: Scenario; onCell: (cell: string, shift: boolean) => void; selectedUnit: string | null; hint: string }) {
  const objectives = new Set(sc.intent.objectiveCells);
  const forbidden = new Set(sc.intent.forbiddenCells);
  const jammers = sc.msel.flatMap((m) => (m.action.kind === 'JAMMER' ? [m.action.jammer] : []));
  const sel = sc.units.find((u) => u.id === selectedUnit);
  const unitsAt = new Map<string, Scenario['units']>();
  for (const u of sc.units) unitsAt.set(u.waypoints[0]!.cell, [...(unitsAt.get(u.waypoints[0]!.cell) ?? []), u]);

  return (
    <figure>
      <svg viewBox={`-18 -18 ${COLS * C + 22} ${ROWS * C + 22}`} className="w-full max-w-[560px] select-none" role="group" aria-label="Scenario grid editor">
        {Array.from({ length: COLS }, (_, c) => (
          <text key={`c${c}`} x={c * C + C / 2} y={-6} fontSize={11} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--color-muted)">{COL_LETTERS[c]}</text>
        ))}
        {Array.from({ length: ROWS }, (_, r) => (
          <text key={`r${r}`} x={-9} y={r * C + C / 2 + 4} fontSize={11} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--color-muted)">{r + 1}</text>
        ))}
        {Array.from({ length: ROWS }, (_, r) =>
          Array.from({ length: COLS }, (_, c) => {
            const cell = cellFromIndex(c, r);
            const t = terrainAt(sc.terrain, cell);
            const here = unitsAt.get(cell) ?? [];
            const label = `${cell} ${TERRAIN_CODES[t]}${objectives.has(cell) ? ', objective' : ''}${forbidden.has(cell) ? ', forbidden' : ''}${here.length ? `, units: ${here.map((u) => u.callsign).join(', ')}` : ''}`;
            return (
              <g
                key={cell}
                role="button"
                tabIndex={0}
                aria-label={label}
                data-cell={cell}
                className="cursor-pointer outline-none [&:focus>rect.ring]:stroke-[var(--color-accent)]"
                onClick={(e) => onCell(cell, e.shiftKey)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onCell(cell, e.shiftKey);
                  }
                }}
              >
                <rect x={c * C} y={r * C} width={C} height={C} fill={TERRAIN_COLOR[t]} stroke="var(--color-line)" strokeWidth={1} />
                <rect className="ring" x={c * C + 2} y={r * C + 2} width={C - 4} height={C - 4} fill="none" stroke="transparent" strokeWidth={2.5} />
                <text x={c * C + 4} y={r * C + 12} fontSize={9} fontFamily="var(--font-mono)" fill="rgba(220,227,234,0.4)">{cell}</text>
                <text x={c * C + C - 5} y={r * C + 12} fontSize={10} textAnchor="end" fontFamily="var(--font-mono)" fill="rgba(220,227,234,0.55)">{t === '.' ? '' : t}</text>
                {objectives.has(cell) && <text x={c * C + C - 6} y={r * C + C - 6} fontSize={16} textAnchor="end" fill="var(--color-accent)">★</text>}
                {forbidden.has(cell) && <path d={`M${c * C + 6} ${r * C + 6} L${c * C + C - 6} ${r * C + C - 6} M${c * C + C - 6} ${r * C + 6} L${c * C + 6} ${r * C + C - 6}`} stroke="var(--color-bad)" strokeWidth={1.5} opacity={0.7} />}
              </g>
            );
          }),
        )}
        {jammers.map((j) => {
          const p = cellCentre(j.cell);
          return <circle key={`j-${j.id}`} cx={p.x * C} cy={p.y * C} r={j.radius * C} fill="var(--color-bad)" fillOpacity={0.06} stroke="var(--color-bad)" strokeDasharray="4 3" pointerEvents="none" />;
        })}
        {sc.sensors.map((s) => {
          const p = cellCentre(s.cell);
          return (
            <g key={`s-${s.id}`} pointerEvents="none">
              <circle cx={p.x * C} cy={p.y * C} r={s.rangeCells * C} fill="none" stroke="var(--color-blue)" strokeOpacity={0.35} strokeDasharray="2 4" />
              <text x={p.x * C - C / 2 + 4} y={p.y * C + C / 2 - 5} fontSize={9} fontFamily="var(--font-mono)" fill="var(--color-blue)">◉ {s.kind === 'GROUND_SENSOR' ? 'UGS' : s.kind}</text>
            </g>
          );
        })}
        {sc.features.map((f) => {
          const p = cellCentre(f.cell);
          return <text key={`f-${f.id}`} x={p.x * C - C / 2 + 4} y={p.y * C + 2} fontSize={9} fontFamily="var(--font-mono)" fill="var(--color-unk)" pointerEvents="none">◆ {f.kind}</text>;
        })}
        {sel && sel.waypoints.length > 1 && (
          <polyline
            points={sel.waypoints.map((w) => { const p = cellCentre(w.cell); return `${p.x * C},${p.y * C}`; }).join(' ')}
            fill="none"
            stroke={sel.side === 'BLUE' ? 'var(--color-blue)' : 'var(--color-red)'}
            strokeWidth={2}
            strokeDasharray="6 4"
            pointerEvents="none"
          />
        )}
        {sel && sel.waypoints.slice(1).map((w, i) => {
          const p = cellCentre(w.cell);
          return <text key={`wp-${i}`} x={p.x * C} y={p.y * C - 12} fontSize={9} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--color-ink)" pointerEvents="none">{`${i + 1}@${w.atS}s`}</text>;
        })}
        {[...unitsAt.entries()].map(([cell, us]) => {
          const p = cellCentre(cell);
          return us.slice(0, 4).map((u, i) => {
            const x = p.x * C - 22 + (i % 2) * 24;
            const y = p.y * C - 6 + Math.floor(i / 2) * 18;
            const color = u.side === 'BLUE' ? 'var(--color-blue)' : 'var(--color-red)';
            return (
              <g key={u.id} pointerEvents="none">
                <rect x={x} y={y - 9} width={22} height={14} rx={2} fill="var(--color-bg)" stroke={color} strokeWidth={u.id === selectedUnit ? 2.5 : 1.2} strokeDasharray={u.decoy ? '3 2' : undefined} />
                <text x={x + 11} y={y + 1.5} fontSize={8} textAnchor="middle" fontFamily="var(--font-mono)" fill={color}>{u.type.slice(0, 3)}</text>
              </g>
            );
          });
        })}
      </svg>
      <figcaption className={cn('mt-2 text-xs text-muted')}>{hint}</figcaption>
    </figure>
  );
}
