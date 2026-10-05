import type { ReactNode } from 'react';

/** Animated friction diagrams + hero overlay for the landing page (static when reduced motion). */
const B = '#63A2E6';
const RD = '#E5675A';
const AM = '#E5A940';
const MU = '#B5AFA0';
const LN = '#2A333B';
const TX = '#ECE6D8';
const MONO = 'IBM Plex Mono, monospace';

type AnimProps = { attributeName: string; values: string; dur: string; keyTimes?: string };
const Anim = ({ reduced, ...p }: AnimProps & { reduced: boolean }) => (reduced ? null : <animate repeatCount="indefinite" {...p} />);

function T({ x, y, children, fill = MU, anchor = 'start', size = 10 }: { x: number; y: number; children: ReactNode; fill?: string; anchor?: 'start' | 'middle' | 'end'; size?: number }) {
  return (
    <text x={x} y={y} fill={fill} fontSize={size} fontFamily={MONO} letterSpacing=".08em" textAnchor={anchor}>
      {children}
    </text>
  );
}

function Svg({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 300 150" width="100%" height="100%" role="img" aria-label={label} style={{ display: 'block' }}>
      {children}
    </svg>
  );
}

function Unit({ x, y, label, dash }: { x: number; y: number; label: string; dash?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={38} height={24} fill="rgba(99,162,230,.14)" stroke={B} strokeWidth={1.5} strokeDasharray={dash} />
      <text x={x + 19} y={y + 16} fill={TX} fontSize={10} fontFamily={MONO} textAnchor="middle">{label}</text>
    </g>
  );
}

const diamond = (cx: number, cy: number, s: number) => `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`;

export function frictionDiagrams(reduced: boolean): ReactNode[] {
  const R = reduced;
  const cycle = { dur: '6s', keyTimes: '0;.35;.45;.9;1' };
  return [
    <Svg key="jam" label="A jammer between Kestrel 6 and Kestrel 2 breaks their link">
      <circle cx={176} cy={72} r={44} fill="rgba(229,103,90,.1)" stroke={RD} strokeDasharray="4 4">
        <Anim reduced={R} attributeName="r" values="40;48;40" dur="3s" />
      </circle>
      <line x1={78} y1={72} x2={222} y2={72} stroke={B} strokeWidth={1.5} strokeDasharray="6 5">
        <Anim reduced={R} attributeName="opacity" values="1;1;.15;.9;0;0;1" dur="2.4s" />
      </line>
      <g stroke={RD} strokeWidth={2}>
        <line x1={160} y1={64} x2={172} y2={80} />
        <line x1={172} y1={64} x2={160} y2={80} />
      </g>
      <Unit x={40} y={60} label="K6" />
      <Unit x={222} y={60} label="K2" />
      <T x={176} y={20} fill={RD} anchor="middle">JAMMER</T>
      <T x={16} y={136}>PL_NET_B · LINK DOWN</T>
    </Svg>,
    <Svg key="delay" label="A message sent at T+02:00 arrives at T+03:00">
      <line x1={24} y1={88} x2={276} y2={88} stroke={LN} strokeWidth={2} />
      {[60, 96, 132, 168, 204].map((x) => <line key={x} x1={x} y1={84} x2={x} y2={92} stroke={LN} />)}
      <line x1={40} y1={76} x2={40} y2={100} stroke={MU} />
      <line x1={236} y1={76} x2={236} y2={100} stroke={AM} />
      <rect x={R ? 228 : 32} y={81} width={16} height={14} fill="#0B0F13" stroke={TX} strokeWidth={1.5}>
        <Anim reduced={R} attributeName="x" values="32;228;228" dur="4s" keyTimes="0;.8;1" />
      </rect>
      <T x={40} y={118}>SENT T+02:00</T>
      <T x={236} y={118} anchor="end" fill={AM}>RCVD T+03:00</T>
      <T x={150} y={52} anchor="middle" fill={TX}>+60 s · CMD_NET</T>
    </Svg>,
    <Svg key="conflict" label="UAV reports two armour in F4, ground sensor reports no contact">
      <rect x={115} y={34} width={70} height={70} fill="rgba(229,169,64,.07)" stroke={AM} strokeWidth={1.5} strokeDasharray="5 4">
        <Anim reduced={R} attributeName="opacity" values="1;.45;1" dur="2s" />
      </rect>
      <T x={121} y={48} fill={AM}>F4</T>
      <line x1={104} y1={53} x2={115} y2={58} stroke={RD} />
      <line x1={196} y1={96} x2={185} y2={86} stroke={MU} />
      <rect x={8} y={40} width={96} height={26} fill="#0B0F13" stroke={RD} />
      <T x={16} y={57} fill="#F08A7F" size={9.5}>UAV: 2× ARMOUR</T>
      <rect x={196} y={84} width={98} height={26} fill="#0B0F13" stroke={MU} />
      <T x={203} y={101} fill={TX} size={9.5}>UGS: NO CONTACT</T>
      <T x={150} y={134} fill={AM} anchor="middle">IN CONFLICT · VERIFY FIRST</T>
    </Svg>,
    <Svg key="decoy" label="Three blocks reported as armour are decoys">
      {[80, 150, 220].map((cx) => (
        <g key={cx}>
          <polygon points={diamond(cx, 64, 22)} fill="rgba(229,103,90,.22)" stroke={RD} strokeWidth={1.5} />
          <polygon points={diamond(cx, 64, 22)} fill="none" stroke={RD} strokeWidth={1.5} strokeDasharray="4 4" opacity={R ? 1 : 0} />
        </g>
      ))}
      <g opacity={R ? 0 : 1}>
        <Anim reduced={R} attributeName="opacity" values="1;1;0;0;1" dur="5s" keyTimes="0;.45;.5;.95;1" />
        <T x={150} y={120} anchor="middle" fill="#F08A7F">REPORTED: 5× ARMOUR</T>
      </g>
      <g opacity={R ? 1 : 0}>
        <Anim reduced={R} attributeName="opacity" values="0;0;1;1;0" dur="5s" keyTimes="0;.45;.5;.95;1" />
        <rect x={40} y={26} width={220} height={76} fill="#0B0F13" opacity={0.55} />
        <T x={150} y={120} anchor="middle" fill={TX}>TRUTH: 3 DECOYS</T>
      </g>
    </Svg>,
    <Svg key="gps" label="A spoofed GPS fix drifts the believed position away from the true one">
      {[60, 100, 140, 180, 220, 260].map((x) => <line key={x} x1={x} y1={14} x2={x} y2={112} stroke="#1C242B" />)}
      <Unit x={84} y={58} label="TRUE" />
      <line x1={122} y1={70} x2={R ? 190 : 168} y2={70} stroke={B} strokeDasharray="2 3">
        <Anim reduced={R} attributeName="x2" values="122;190;190;122" dur="6s" keyTimes="0;.6;.85;1" />
      </line>
      <g transform={R ? 'translate(84 -18)' : undefined}>
        {!R && <animateTransform attributeName="transform" type="translate" values="0 0;84 -18;84 -18;0 0" keyTimes="0;.6;.85;1" dur="6s" repeatCount="indefinite" />}
        <rect x={84} y={58} width={38} height={24} fill="none" stroke={B} strokeWidth={1.5} strokeDasharray="4 3" />
        <T x={103} y={52} anchor="middle" fill="#9CC4EF">BELIEVED</T>
      </g>
      <T x={16} y={136}>GPS SPOOFED · POSITION DRIFT</T>
    </Svg>,
    <Svg key="pace" label="SATCOM goes dark and HF takes over on the PACE plan">
      {(
        [
          ['P', 'SATCOM', 30],
          ['A', 'HF_NET', 60],
          ['C', '—', 90],
          ['E', '—', 120],
        ] as const
      ).map(([k, n, y], i) => (
        <g key={k}>
          <T x={18} y={y + 4} fill={TX} size={11}>{k}</T>
          <T x={40} y={y + 4} fill={i < 2 ? TX : MU}>{n}</T>
          <rect x={124} y={y - 5} width={112} height={9} fill="none" stroke={LN} />
          {i === 0 && (
            <rect x={124} y={y - 5} width={112} height={9} fill={B} opacity={R ? 0.1 : 1}>
              <Anim reduced={R} attributeName="opacity" values="1;1;.1;.1;1" {...cycle} />
            </rect>
          )}
          {i === 1 && (
            <rect x={124} y={y - 5} width={112} height={9} fill={AM} opacity={R ? 1 : 0.1}>
              <Anim reduced={R} attributeName="opacity" values=".1;.1;1;1;.1" {...cycle} />
            </rect>
          )}
        </g>
      ))}
      <g opacity={R ? 0 : 1}>
        <Anim reduced={R} attributeName="opacity" values="1;1;0;0;1" {...cycle} />
        <T x={244} y={34} fill={TX}>UP</T>
        <T x={244} y={64}>STBY</T>
      </g>
      <g opacity={R ? 1 : 0}>
        <Anim reduced={R} attributeName="opacity" values="0;0;1;1;0" {...cycle} />
        <T x={244} y={34} fill="#F08A7F">DARK</T>
        <T x={244} y={64} fill={AM}>LIVE</T>
      </g>
    </Svg>,
  ];
}

/** Overlay drawn in the hero image's own pixel space (1672×941): jammed link, ring, decoy marks. */
export function HeroFx({ reduced }: { reduced: boolean }) {
  return (
    <svg viewBox="0 0 1672 941" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <line x1={560} y1={412} x2={1200} y2={420} stroke={B} strokeWidth={3} strokeDasharray="16 12">
        <Anim reduced={reduced} attributeName="opacity" values="1;1;.2;.9;0;0;1" dur="2.6s" />
      </line>
      <g stroke={RD} strokeWidth={4}>
        <line x1={1200} y1={405} x2={1226} y2={435} />
        <line x1={1226} y1={405} x2={1200} y2={435} />
      </g>
      <ellipse cx={1385} cy={448} rx={192} ry={76} fill="none" stroke={RD} strokeWidth={2.5} strokeDasharray="12 9">
        <Anim reduced={reduced} attributeName="opacity" values=".95;.35;.95" dur="2.4s" />
      </ellipse>
      <circle cx={1260} cy={342} r={30} fill="none" stroke={AM} strokeWidth={2.5} />
      {[
        [1098, 560],
        [1515, 537],
        [1425, 743],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r={36} fill="none" stroke={RD} strokeWidth={2.5} strokeDasharray="7 6" />
      ))}
    </svg>
  );
}

export function FogDrift() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: '-4%',
        pointerEvents: 'none',
        background: 'radial-gradient(40% 30% at 78% 40%,rgba(225,218,200,.16),transparent 70%),radial-gradient(35% 26% at 92% 70%,rgba(225,218,200,.12),transparent 70%)',
        animation: 'lpFogDrift 18s ease-in-out infinite',
      }}
    />
  );
}
