import { useState } from 'react';
import { formatT, type AarReport, type RoleId, type TimelineEvent } from '@vanguard/shared';
import { cn } from '@/lib/utils';

const SOUND = { SOUND: 'var(--color-ok)', RISKY: 'var(--color-warn)', UNSOUND: 'var(--color-bad)' } as const;

/** Swimlane timeline: one lane per role + ALL (US-AAR-4). */
export function Swimlanes({ aar, onPick }: { aar: AarReport; onPick?: (ref: string) => void }) {
  const lanes: (RoleId | 'ALL')[] = ['ALL', ...aar.meta.roles.map((r) => r.role)];
  const [hover, setHover] = useState<TimelineEvent | null>(null);
  const W = 1000;
  const L = 64;
  const laneH = 34;
  const H = lanes.length * laneH + 24;
  const end = Math.max(aar.meta.endMs, 60_000);
  const X = (t: number) => L + (Math.min(t, end) / end) * (W - L - 8);
  const ticks = Array.from({ length: Math.floor(end / 300_000) + 1 }, (_, i) => i * 300_000);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Swimlane timeline of injects, outages, messages, decisions and probes per role">
        {lanes.map((lane, i) => (
          <g key={lane}>
            <rect x={L} y={i * laneH} width={W - L} height={laneH} fill={i % 2 ? 'transparent' : 'rgba(255,255,255,0.025)'} />
            <text x={4} y={i * laneH + laneH / 2 + 4} fontSize={11} fontFamily="var(--font-mono)" fill="var(--color-muted)">{lane}</text>
          </g>
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={0} y2={lanes.length * laneH} stroke="var(--color-line)" strokeWidth={0.6} />
            <text x={X(t)} y={lanes.length * laneH + 14} fontSize={10} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--color-faint)">{formatT(t)}</text>
          </g>
        ))}
        {aar.q2.timeline.map((e, idx) => {
          const li = lanes.indexOf(e.lane);
          if (li < 0) return null;
          const y = li * laneH;
          const common = { onMouseEnter: () => setHover(e), onMouseLeave: () => setHover(null), style: { cursor: e.ref && e.kind === 'DECISION' ? 'pointer' : 'default' }, onClick: () => e.ref && e.kind === 'DECISION' && onPick?.(e.ref) };
          switch (e.kind) {
            case 'CUTOFF':
              return <rect key={idx} {...common} x={X(e.tMs)} y={y + 4} width={Math.max(2, X(e.endMs ?? end) - X(e.tMs))} height={6} fill="var(--color-bad)" opacity={0.85}><title>{`${e.label} ${formatT(e.tMs)}–${formatT(e.endMs ?? end)}`}</title></rect>;
            case 'INJECT':
            case 'CYBER':
              return <rect key={idx} {...common} x={X(e.tMs)} y={y + (e.kind === 'CYBER' ? 24 : 14)} width={Math.max(2, X(e.endMs ?? e.tMs + 20_000) - X(e.tMs))} height={5} fill={e.kind === 'CYBER' ? 'var(--color-bad)' : 'var(--color-warn)'} opacity={0.7}><title>{`${formatT(e.tMs)} ${e.label}`}</title></rect>;
            case 'DECISION': {
              const x = X(e.tMs);
              const cy = y + laneH / 2 + 2;
              return <path key={idx} {...common} d={`M${x} ${cy - 7} L${x + 6} ${cy} L${x} ${cy + 7} L${x - 6} ${cy} Z`} fill={SOUND[e.soundness ?? 'RISKY']} stroke="#0d1217"><title>{`${formatT(e.tMs)} ${e.lane}: ${e.label} — ${e.soundness}`}</title></path>;
            }
            case 'MSG_SENT':
            case 'MSG_RECV':
            case 'MSG_DROP':
              return <circle key={idx} {...common} cx={X(e.tMs)} cy={y + laneH - 5} r={e.kind === 'MSG_DROP' ? 2.6 : 1.8} fill={e.kind === 'MSG_DROP' ? 'var(--color-bad)' : e.kind === 'MSG_SENT' ? 'var(--color-blue)' : 'var(--color-muted)'}><title>{`${formatT(e.tMs)} ${e.label}`}</title></circle>;
            default:
              return <line key={idx} {...common} x1={X(e.tMs)} x2={X(e.tMs)} y1={y + 2} y2={y + laneH - 2} stroke={e.kind === 'PROBE' ? 'var(--color-blue)' : e.kind === 'JAMMER' ? 'var(--color-red)' : e.kind === 'PACE' ? 'var(--color-ok)' : 'var(--color-ink)'} strokeWidth={1.6}><title>{`${formatT(e.tMs)} ${e.label}`}</title></line>;
          }
        })}
      </svg>
      <p className="mt-1 min-h-5 font-mono text-[11px] text-muted" aria-live="polite">
        {hover ? `${formatT(hover.tMs)} · ${hover.lane} · ${hover.label}` : 'Hover an event for detail. Diamonds = decisions (green sound · amber risky · red unsound); red bars = cut off; amber = injects; red thin = cyber; blue lines = SA probes; dots = messages (red = lost). Click a decision to open its card.'}
      </p>
    </div>
  );
}

/** Horizontal bars for 0..1 metrics with numeric labels (colour is not the only signal). */
export function BarList({ title, rows, invert, color = 'var(--color-blue)', format }: { title: string; rows: { label: string; value: number | null }[]; invert?: boolean; color?: string; format?: (v: number) => string }) {
  const fmt = format ?? ((v: number) => (invert ? v.toFixed(2) : `${Math.round(v * 100)}%`));
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <figure>
      <figcaption className="mb-2 text-xs font-semibold text-ink">{title}</figcaption>
      <ul className="grid gap-1.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[96px_1fr_48px] items-center gap-2 text-xs">
            <span className="truncate font-mono text-muted">{r.label}</span>
            <span className="h-2.5 rounded bg-raised">
              {r.value !== null && <span className="block h-full rounded" style={{ width: `${(Math.min(r.value, max) / max) * 100}%`, background: color }} />}
            </span>
            <span className="text-right font-mono tabular">{r.value === null ? '—' : fmt(r.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Who talked to whom, and what was lost (US-AAR-6). */
export function NetworkGraph({ aar }: { aar: AarReport }) {
  const edges = aar.q3.comms.edges;
  const nodes = [...new Set([...aar.meta.roles.map((r) => r.role as string), ...edges.flatMap((e) => [e.from, e.to])])];
  const S = 360;
  const R = 130;
  const pos = new Map(nodes.map((n, i) => [n, { x: S / 2 + R * Math.cos((2 * Math.PI * i) / nodes.length - Math.PI / 2), y: S / 2 + R * Math.sin((2 * Math.PI * i) / nodes.length - Math.PI / 2) }]));
  const maxSent = Math.max(1, ...edges.map((e) => e.sent));
  const callsign = (r: string) => aar.meta.roles.find((x) => x.role === r)?.callsign ?? r;
  return (
    <figure>
      <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[380px]" role="img" aria-label="Comms network graph">
        <defs>
          <marker id="nx-arrow" viewBox="0 0 10 10" refX={22} refY={5} markerWidth={5} markerHeight={5} orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="var(--color-muted)" /></marker>
        </defs>
        {edges.map((e) => {
          const a = pos.get(e.from)!;
          const b = pos.get(e.to)!;
          const loss = e.dropped / Math.max(1, e.sent);
          const color = loss > 0.3 ? 'var(--color-bad)' : loss > 0 ? 'var(--color-warn)' : 'var(--color-ok)';
          const mx = a.x * 0.35 + b.x * 0.65;
          const my = a.y * 0.35 + b.y * 0.65;
          return (
            <g key={`${e.from}-${e.to}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={1 + (4 * e.sent) / maxSent} strokeDasharray={loss > 0.3 ? '5 3' : undefined} markerEnd="url(#nx-arrow)" opacity={0.85}>
                <title>{`${callsign(e.from)} → ${callsign(e.to)}: ${e.delivered}/${e.sent} delivered, ${e.dropped} lost`}</title>
              </line>
              <text x={mx} y={my} fontSize={10} fontFamily="var(--font-mono)" textAnchor="middle" fill="var(--color-ink)" paintOrder="stroke" stroke="#0d1217" strokeWidth={3}>{e.delivered}/{e.sent}</text>
            </g>
          );
        })}
        {[...pos].map(([n, p]) => (
          <g key={n}>
            <circle cx={p.x} cy={p.y} r={20} fill="var(--color-panel2)" stroke="var(--color-blue)" strokeWidth={1.6} />
            <text x={p.x} y={p.y + 4} fontSize={10} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--color-blue)">{n}</text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 text-center text-[11px] text-muted">Edge label = delivered/sent player messages · green no loss · amber some loss · red dashed &gt;30% lost · width ∝ volume.</figcaption>
    </figure>
  );
}

export function MetricCell({ v, good, bad, invert, fmt }: { v: number | null; good: number; bad: number; invert?: boolean; fmt: (n: number) => string }) {
  if (v === null) return <td className="px-2 py-1.5 text-right text-faint">—</td>;
  const isGood = invert ? v <= good : v >= good;
  const isBad = invert ? v > bad : v < bad;
  return (
    <td className={cn('px-2 py-1.5 text-right font-mono tabular', isGood && 'text-ok', isBad && 'text-bad')}>
      {fmt(v)}
      <span className="sr-only">{isGood ? ' (good)' : isBad ? ' (needs improvement)' : ''}</span>
      {isGood ? ' ▲' : isBad ? ' ▼' : ''}
    </td>
  );
}
