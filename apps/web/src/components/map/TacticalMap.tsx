import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { COL_LETTERS, TERRAIN_CODES, cellCentre, cellFromIndex, type TerrainCode } from '@vanguard/shared';
import { cn } from '@/lib/utils';

export const CELL = 100;
const PAD = 26;

export interface MapMarker {
  id: string;
  side: 'BLUE' | 'RED' | 'UNK';
  x: number;
  y: number;
  /** Short type glyph drawn inside the frame (e.g. ARM, MECH). */
  glyph: string;
  label?: string;
  sub?: string;
  own?: boolean;
  decoy?: boolean;
  negative?: boolean;
  conflict?: boolean;
  faded?: boolean;
  destroyed?: boolean;
  destination?: { x: number; y: number } | null;
  title?: string;
}

export interface MapJammer {
  id: string;
  x: number;
  y: number;
  radius: number;
  active: boolean;
  label: string;
  estimate?: boolean;
}

export interface MapLink {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  level: 'CLEAR' | 'DEGRADED' | 'DENIED';
  title?: string;
}

export interface TacticalMapProps {
  terrain: string[];
  features?: { id: string; label: string; kind: string; cell: string; intact?: boolean }[];
  objectives?: { cell: string; text: string }[];
  markers: MapMarker[];
  jammers?: MapJammer[];
  links?: MapLink[];
  relays?: { id: string; x: number; y: number; label: string; active: boolean }[];
  selectedCell?: string | null;
  pickMode?: string | null;
  onCellClick?: (cell: string) => void;
  ariaLabel: string;
  className?: string;
}

const TERRAIN_FILL: Record<TerrainCode, string> = {
  '.': 'var(--color-t-open)',
  F: 'url(#p-forest)',
  U: 'url(#p-urban)',
  '~': 'url(#p-river)',
  '=': 'url(#p-bridge)',
  '^': 'url(#p-ridge)',
  W: 'url(#p-sea)',
  M: 'url(#p-marsh)',
  H: 'url(#p-hills)',
};

const SIDE_COLOR = { BLUE: 'var(--color-blue)', RED: 'var(--color-red)', UNK: 'var(--color-unk)' };

/** Spread markers that share a cell so contradictory reports sit side-by-side (never merged). */
function layout(markers: MapMarker[]): (MapMarker & { px: number; py: number })[] {
  const groups = new Map<string, MapMarker[]>();
  for (const m of markers) {
    const k = `${Math.floor(m.x)},${Math.floor(m.y)}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const out: (MapMarker & { px: number; py: number })[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      const m = list[0]!;
      out.push({ ...m, px: m.x * CELL, py: m.y * CELL });
      continue;
    }
    const n = list.length;
    const cols = n <= 2 ? 2 : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    list.forEach((m, i) => {
      const cx = Math.floor(m.x) * CELL;
      const cy = Math.floor(m.y) * CELL;
      const c = i % cols;
      const r = Math.floor(i / cols);
      out.push({ ...m, px: cx + ((c + 0.5) / cols) * CELL, py: cy + ((r + 0.5) / rows) * CELL });
    });
  }
  return out;
}

function Symbol({ m, small }: { m: MapMarker & { px: number; py: number }; small: boolean }) {
  const color = SIDE_COLOR[m.side];
  const s = small ? 0.8 : 1;
  const w = 34 * s;
  const h = 22 * s;
  const dash = m.decoy ? '3 3' : undefined;
  return (
    <g transform={`translate(${m.px} ${m.py})`} opacity={m.faded ? 0.5 : 1}>
      <title>{m.title ?? `${m.label ?? m.glyph}${m.sub ? ` · ${m.sub}` : ''}`}</title>
      {m.conflict && (
        <rect x={-w / 2 - 6} y={-h / 2 - 6} width={w + 12} height={h + 12} rx={5} fill="none" stroke="var(--color-warn)" strokeWidth={2} strokeDasharray="5 3" />
      )}
      {m.own && <rect x={-w / 2 - 4} y={-h / 2 - 4} width={w + 8} height={h + 8} rx={3} fill="none" stroke={color} strokeWidth={1.5} />}
      {m.negative ? (
        <>
          <circle r={12 * s} fill="none" stroke="var(--color-unk)" strokeWidth={1.6} strokeDasharray="3 2" />
          <line x1={-8 * s} y1={8 * s} x2={8 * s} y2={-8 * s} stroke="var(--color-unk)" strokeWidth={1.6} />
        </>
      ) : m.side === 'BLUE' ? (
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2} fill="color-mix(in srgb, var(--color-blue) 20%, #0b0f13)" stroke={color} strokeWidth={1.8} strokeDasharray={dash} />
      ) : m.side === 'RED' ? (
        <rect x={-h / 1.414} y={-h / 1.414} width={h * 1.414} height={h * 1.414} transform="rotate(45)" fill="color-mix(in srgb, var(--color-red) 20%, #0b0f13)" stroke={color} strokeWidth={1.8} strokeDasharray={dash} />
      ) : (
        <circle r={13 * s} fill="color-mix(in srgb, var(--color-unk) 18%, #0b0f13)" stroke={color} strokeWidth={1.8} />
      )}
      {!m.negative && (
        <text y={3.5} textAnchor="middle" fontSize={m.glyph.length > 3 ? 8 : 9} fontFamily="var(--font-mono)" fill="var(--color-ink)" fontWeight={500}>
          {m.glyph}
        </text>
      )}
      {m.destroyed && (
        <g stroke="var(--color-ink)" strokeWidth={2}>
          <line x1={-14} y1={-14} x2={14} y2={14} />
          <line x1={14} y1={-14} x2={-14} y2={14} />
        </g>
      )}
      {m.conflict && (
        <g transform={`translate(${w / 2 + 4} ${-h / 2 - 4})`}>
          <circle r={7} fill="var(--color-warn)" />
          <text y={3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#1a1306">!</text>
        </g>
      )}
      {m.label && (
        <text y={h / 2 + 12} textAnchor="middle" fontSize={9.5} fontFamily="var(--font-mono)" fill="var(--color-ink)" paintOrder="stroke" stroke="#0b0f13" strokeWidth={3}>
          {m.label}
        </text>
      )}
      {m.sub && (
        <text y={h / 2 + 23} textAnchor="middle" fontSize={8.5} fontFamily="var(--font-mono)" fill="var(--color-muted)" paintOrder="stroke" stroke="#0b0f13" strokeWidth={3}>
          {m.sub}
        </text>
      )}
    </g>
  );
}

function Patterns() {
  const p = (id: string, bg: string, children: React.ReactNode, size = 20) => (
    <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
      <rect width={size} height={size} fill={bg} />
      {children}
    </pattern>
  );
  const ink = 'rgba(220,227,234,0.13)';
  return (
    <defs>
      {p('p-forest', 'var(--color-t-forest)', <><circle cx={5} cy={5} r={2.6} fill="rgba(110,170,120,0.28)" /><circle cx={15} cy={14} r={2.6} fill="rgba(110,170,120,0.28)" /></>)}
      {p('p-urban', 'var(--color-t-urban)', <><rect x={3} y={3} width={6} height={6} fill={ink} /><rect x={12} y={11} width={6} height={6} fill={ink} /></>)}
      {p('p-river', 'var(--color-t-river)', <path d="M0 10 Q5 6 10 10 T20 10" stroke="rgba(140,190,235,0.35)" fill="none" strokeWidth={1.2} />)}
      {p('p-sea', 'var(--color-t-sea)', <path d="M0 6 Q5 2 10 6 T20 6 M0 16 Q5 12 10 16 T20 16" stroke="rgba(120,170,220,0.25)" fill="none" />)}
      {p('p-ridge', 'var(--color-t-ridge)', <path d="M2 14 L7 6 L12 14 M11 14 L16 7 L20 13" stroke="rgba(220,180,130,0.4)" fill="none" strokeWidth={1.3} />)}
      {p('p-marsh', 'var(--color-t-marsh)', <><line x1={3} y1={6} x2={9} y2={6} stroke="rgba(150,190,160,0.3)" /><line x1={12} y1={15} x2={18} y2={15} stroke="rgba(150,190,160,0.3)" /></>)}
      {p('p-hills', 'var(--color-t-hills)', <path d="M0 16 Q10 4 20 16" stroke="rgba(190,200,150,0.25)" fill="none" />)}
      {p('p-bridge', 'var(--color-t-river)', <><rect x={0} y={6} width={20} height={8} fill="var(--color-t-bridge)" /><line x1={5} y1={6} x2={5} y2={14} stroke="rgba(0,0,0,0.4)" /><line x1={15} y1={6} x2={15} y2={14} stroke="rgba(0,0,0,0.4)" /></>)}
      {p('p-jam', 'transparent', <line x1={0} y1={0} x2={10} y2={10} stroke="rgba(229,103,90,0.35)" strokeWidth={2} />, 10)}
      <marker id="arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="var(--color-muted)" />
      </marker>
    </defs>
  );
}

export function TacticalMap(props: TacticalMapProps) {
  const { terrain, markers, onCellClick, selectedCell, pickMode } = props;
  const [focus, setFocus] = useState<{ col: number; row: number }>({ col: 3, row: 3 });
  const laid = useMemo(() => layout(markers), [markers]);
  const dense = markers.length > 18;

  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const mv = d[e.key];
    if (mv) {
      e.preventDefault();
      const next = { col: Math.min(7, Math.max(0, focus.col + mv[0])), row: Math.min(7, Math.max(0, focus.row + mv[1])) };
      setFocus(next);
      (e.currentTarget.ownerSVGElement?.querySelector(`[data-cell="${cellFromIndex(next.col, next.row)}"]`) as SVGGElement | null)?.focus();
    } else if ((e.key === 'Enter' || e.key === ' ') && onCellClick) {
      e.preventDefault();
      onCellClick(cellFromIndex(focus.col, focus.row));
    }
  };

  /** Any click inside the grid selects that sector, even on top of a marker, link or label. */
  const onSvgClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onCellClick) return;
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const col = Math.floor(pt.x / CELL);
    const row = Math.floor(pt.y / CELL);
    if (col < 0 || col > 7 || row < 0 || row > 7) return;
    setFocus({ col, row });
    onCellClick(cellFromIndex(col, row));
  };

  return (
    <svg
      onClick={onSvgClick}
      viewBox={`${-PAD} ${-PAD} ${8 * CELL + PAD + 4} ${8 * CELL + PAD + 4}`}
      className={cn('h-full w-full select-none', pickMode && 'cursor-crosshair', props.className)}
      role="group"
      aria-label={props.ariaLabel}
      preserveAspectRatio="xMidYMid meet"
    >
      <Patterns />
      {/* terrain + focusable cells */}
      {terrain.map((row, r) =>
        [...row].map((code, c) => {
          const cell = cellFromIndex(c, r);
          const name = TERRAIN_CODES[code as TerrainCode] ?? 'OPEN';
          const isFocus = focus.col === c && focus.row === r;
          return (
            <g
              key={cell}
              data-cell={cell}
              role={onCellClick ? 'button' : undefined}
              tabIndex={onCellClick ? (isFocus ? 0 : -1) : undefined}
              aria-label={`${cell} ${name.toLowerCase()}${selectedCell === cell ? ', selected' : ''}`}
              onKeyDown={onCellClick ? onKey : undefined}
              onFocus={() => setFocus({ col: c, row: r })}
              className={cn('outline-none', onCellClick && 'cursor-pointer [&:focus-visible>rect.focusring]:stroke-[var(--color-accent)]')}
            >
              <rect x={c * CELL} y={r * CELL} width={CELL} height={CELL} fill={TERRAIN_FILL[code as TerrainCode] ?? TERRAIN_FILL['.']} />
              <rect className="focusring" x={c * CELL + 2} y={r * CELL + 2} width={CELL - 4} height={CELL - 4} fill="none" stroke="transparent" strokeWidth={3} />
              <text x={c * CELL + 4} y={r * CELL + 12} fontSize={9} fontFamily="var(--font-mono)" fill="rgba(220,227,234,0.28)">
                {cell}
              </text>
            </g>
          );
        }),
      )}
      {/* grid lines */}
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i} stroke="rgba(220,227,234,0.10)" strokeWidth={1}>
          <line x1={i * CELL} y1={0} x2={i * CELL} y2={8 * CELL} />
          <line x1={0} y1={i * CELL} x2={8 * CELL} y2={i * CELL} />
        </g>
      ))}
      {/* axis labels */}
      {Array.from({ length: 8 }, (_, i) => (
        <g key={`ax${i}`} fontFamily="var(--font-mono)" fontSize={12} fill="var(--color-muted)" textAnchor="middle">
          <text x={i * CELL + CELL / 2} y={-9}>{COL_LETTERS[i]}</text>
          <text x={-13} y={i * CELL + CELL / 2 + 4}>{i + 1}</text>
        </g>
      ))}
      {/* objectives */}
      {props.objectives?.map((o) => {
        const p = cellCentre(o.cell);
        return (
          <g key={`obj-${o.cell}`} pointerEvents="none">
            <rect x={(p.x - 0.5) * CELL + 6} y={(p.y - 0.5) * CELL + 6} width={CELL - 12} height={CELL - 12} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="8 5" />
            <text x={(p.x - 0.5) * CELL + CELL - 8} y={(p.y - 0.5) * CELL + 20} textAnchor="end" fontSize={10} fontWeight={600} fontFamily="var(--font-mono)" fill="var(--color-accent)">OBJ</text>
            <title>{`Objective: ${o.text}`}</title>
          </g>
        );
      })}
      {/* features */}
      {props.features?.map((f) => {
        const p = cellCentre(f.cell);
        return (
          <g key={f.id} pointerEvents="none" transform={`translate(${p.x * CELL} ${(p.y + 0.5) * CELL - 8})`}>
            <text textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill={f.intact === false ? 'var(--color-bad)' : 'var(--color-ink)'} paintOrder="stroke" stroke="#0b0f13" strokeWidth={3}>
              {f.label}{f.intact === false ? ' ✕ DESTROYED' : ''}
            </text>
          </g>
        );
      })}
      {/* jammers */}
      {props.jammers?.map((j) => (
        <g key={j.id} pointerEvents="none" opacity={j.active ? 1 : 0.35}>
          <circle cx={j.x * CELL} cy={j.y * CELL} r={j.radius * CELL} fill="none" stroke="var(--color-red)" strokeWidth={1.5} strokeDasharray={j.estimate ? '2 6' : '6 4'} />
          {!j.estimate && <circle cx={j.x * CELL} cy={j.y * CELL} r={j.radius * CELL * 0.5} fill="url(#p-jam)" stroke="var(--color-red)" strokeWidth={1} />}
          <g transform={`translate(${j.x * CELL} ${j.y * CELL})`}>
            <path d="M-2 -11 L6 -2 L0 -1 L3 10 L-6 0 L0 -1 Z" fill="var(--color-red)" />
            <text y={22} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill="var(--color-red)" paintOrder="stroke" stroke="#0b0f13" strokeWidth={3}>
              {j.label}{j.active ? '' : ' (off)'}
            </text>
          </g>
        </g>
      ))}
      {/* comms links */}
      {props.links?.map((l) => (
        <g key={l.id} pointerEvents="visibleStroke">
          <title>{l.title}</title>
          <line
            x1={l.x1 * CELL}
            y1={l.y1 * CELL}
            x2={l.x2 * CELL}
            y2={l.y2 * CELL}
            stroke={l.level === 'CLEAR' ? 'var(--color-ok)' : l.level === 'DEGRADED' ? 'var(--color-warn)' : 'var(--color-bad)'}
            strokeWidth={l.level === 'CLEAR' ? 1.2 : 2}
            strokeDasharray={l.level === 'CLEAR' ? undefined : l.level === 'DEGRADED' ? '8 5' : '2 5'}
            opacity={0.8}
          />
          {l.level === 'DENIED' && (
            <text x={((l.x1 + l.x2) / 2) * CELL} y={((l.y1 + l.y2) / 2) * CELL + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-bad)">✕</text>
          )}
        </g>
      ))}
      {/* relays */}
      {props.relays?.map((r) => (
        <g key={r.id} transform={`translate(${r.x * CELL} ${r.y * CELL})`} opacity={r.active ? 1 : 0.45} pointerEvents="none">
          <path d="M0 -10 L9 7 L-9 7 Z" fill="none" stroke="var(--color-ok)" strokeWidth={1.6} />
          <text y={4} textAnchor="middle" fontSize={8} fill="var(--color-ok)" fontFamily="var(--font-mono)">R</text>
          <text y={20} textAnchor="middle" fontSize={8.5} fill="var(--color-muted)" fontFamily="var(--font-mono)" paintOrder="stroke" stroke="#0b0f13" strokeWidth={3}>{r.label}</text>
        </g>
      ))}
      {/* movement */}
      {laid
        .filter((m) => m.destination)
        .map((m) => (
          <line key={`mv-${m.id}`} x1={m.px} y1={m.py} x2={m.destination!.x * CELL} y2={m.destination!.y * CELL} stroke="var(--color-muted)" strokeWidth={1.4} strokeDasharray="4 4" markerEnd="url(#arrow)" pointerEvents="none" />
        ))}
      {/* markers */}
      <g>
        {laid.map((m) => (
          <Symbol key={m.id} m={m} small={dense} />
        ))}
      </g>
      {/* selection */}
      {selectedCell && (() => {
        const p = cellCentre(selectedCell);
        return <rect x={(p.x - 0.5) * CELL + 1.5} y={(p.y - 0.5) * CELL + 1.5} width={CELL - 3} height={CELL - 3} fill="none" stroke="var(--color-accent)" strokeWidth={3} pointerEvents="none" />;
      })()}
    </svg>
  );
}

export function MapLegend({ truth }: { truth?: boolean }) {
  const item = (svg: React.ReactNode, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <svg width={18} height={14} viewBox="-9 -7 18 14" aria-hidden>{svg}</svg>
      {text}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
      {item(<rect x={-8} y={-5} width={16} height={10} fill="none" stroke="var(--color-blue)" strokeWidth={1.5} />, 'Friendly')}
      {item(<rect x={-4.5} y={-4.5} width={9} height={9} transform="rotate(45)" fill="none" stroke="var(--color-red)" strokeWidth={1.5} />, 'Hostile (reported)')}
      {item(<><circle r={5.5} fill="none" stroke="var(--color-unk)" strokeDasharray="2 1.5" /><line x1={-4} y1={4} x2={4} y2={-4} stroke="var(--color-unk)" /></>, 'No-contact report')}
      {item(<rect x={-8} y={-6} width={16} height={12} rx={2} fill="none" stroke="var(--color-warn)" strokeDasharray="3 2" strokeWidth={1.5} />, 'In conflict')}
      {item(<rect x={-7} y={-5} width={14} height={10} fill="none" stroke="var(--color-accent)" strokeDasharray="4 2" strokeWidth={1.5} />, 'Objective')}
      {truth && item(<rect x={-4.5} y={-4.5} width={9} height={9} transform="rotate(45)" fill="none" stroke="var(--color-red)" strokeDasharray="2 2" strokeWidth={1.5} />, 'Decoy (truth)')}
      {truth && item(<circle r={6} fill="none" stroke="var(--color-red)" strokeDasharray="3 2" />, 'Jammer radius')}
    </div>
  );
}
