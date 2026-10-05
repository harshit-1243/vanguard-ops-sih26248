import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FogDrift, HeroFx, frictionDiagrams } from '@/components/landing/diagrams';
import { TEAM } from '@/components/shell';
import { api } from '@/lib/api';
import { saveIdentity } from '@/lib/identity';
import heroFog from '@/assets/landing/hero-fog.webp';
import heroClear from '@/assets/landing/hero-clear.webp';
import dsConsole from '@/assets/landing/ds-console.webp';
import trainee from '@/assets/landing/trainee.webp';
import aarCard from '@/assets/landing/aar-card.webp';
import sand3d from '@/assets/landing/sand-3d.webp';
import editorShot from '@/assets/landing/editor.webp';
import analyticsShot from '@/assets/landing/analytics.webp';

/**
 * Landing page — "Fog, by design" (designed in Claude Design, ported to React).
 * Hero: the same sand model as ground truth (left) and as Kestrel 2 perceives it (right);
 * the divider is draggable and keyboard-operable. Mobile swaps the divider for three tabs.
 */
const MONO = "'IBM Plex Mono',monospace";
const SANS = "'IBM Plex Sans',sans-serif";
const mono = (w: number, px: number, lh: number | string = 1) => `${w} ${px}px/${lh} ${MONO}`;
const sans = (w: number, px: number, lh: number | string = 1) => `${w} ${px}px/${lh} ${SANS}`;
const C = { ink: '#0B0F13', panel: '#0F1419', card: '#11171D', line: '#2A333B', line2: '#3A444D', text: '#ECE6D8', head: '#F2ECDF', sub: '#C9C3B4', body: '#B9B3A4', mut: '#B5AFA0', faint: '#8E897C', amber: '#E5A940', blue: '#63A2E6', red: '#E5675A', redInk: '#F08A7F', paper: '#EEE7D6', paperInk: '#1C1A15', paperLine: '#CFC5AE', paperMut: '#6B6455' };
const HERO_H = 'clamp(640px,min(100vh,60vw),860px)';
const heroBox: CSSProperties = { position: 'absolute', left: '45%', top: '55%', width: `max(100%, calc(${HERO_H} * 1.7768))`, aspectRatio: '1672/941', transform: 'translate(-45%,-55%)' };
const fill: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' };
const wrap: CSSProperties = { maxWidth: 1280, margin: '0 auto' };
const sectionPad = (top: string, bottom: string): CSSProperties => ({ padding: `${top} clamp(16px,4vw,48px) ${bottom}`, scrollMarginTop: 24 });
const COLS = 'ABCDEFGH';

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const h = () => setOn(m.matches);
    m.addEventListener('change', h);
    h();
    return () => m.removeEventListener('change', h);
  }, [query]);
  return on;
}

function Emblem({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect x="1.5" y="1.5" width="25" height="25" fill="none" stroke={C.amber} strokeWidth="1.5" />
      <line x1="14" y1="2" x2="14" y2="26" stroke={C.amber} strokeOpacity=".35" />
      <line x1="2" y1="14" x2="26" y2="14" stroke={C.amber} strokeOpacity=".35" />
      <polygon points="14,5 20,22 14,18 8,22" fill={C.amber} />
    </svg>
  );
}

function Wordmark({ size }: { size: number }) {
  return (
    <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: C.text, flex: 'none' }}>
      <Emblem size={size + 11} />
      <span className="lp-display" style={{ fontWeight: 800, fontStretch: '125%', fontSize: size, letterSpacing: '.14em' }}>VANGUARD OPS</span>
    </a>
  );
}

/** A–H column ruler: the page aligns to the map grid. */
function Ruler({ paper }: { paper?: boolean }) {
  const line = paper ? C.paperLine : C.line;
  return (
    <div aria-hidden style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', font: mono(400, 10), color: paper ? C.paperMut : C.faint, letterSpacing: '.1em' }}>
      {[...COLS].map((c, i) => (
        <span key={c} style={{ borderLeft: `1px solid ${line}`, borderRight: i === 7 ? `1px solid ${line}` : undefined, padding: '0 0 8px 6px' }}>{c}</span>
      ))}
    </div>
  );
}

function SectionHead({ num, title, sub, paper }: { num: string; title: string; sub?: string; paper?: boolean }) {
  return (
    <>
      <Ruler paper={paper} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 32px', borderTop: `1px solid ${paper ? C.paperInk : C.line}`, paddingTop: 24, marginBottom: 48 }}>
        <div style={{ flex: '1 1 220px', font: mono(500, 12, 1.5), letterSpacing: '.16em', color: paper ? '#8A5A0B' : C.amber }}>{num}</div>
        <div style={{ flex: '3 1 480px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 className="lp-display" style={{ margin: 0, fontWeight: 700, fontSize: 'clamp(34px,4.2vw,58px)', lineHeight: 1, letterSpacing: '-.02em', color: paper ? C.paperInk : C.head }}>{title}</h2>
          {sub && <p style={{ margin: 0, maxWidth: 620, font: sans(400, 17, 1.6), color: paper ? '#4A4538' : C.sub, textWrap: 'pretty' }}>{sub}</p>}
        </div>
      </div>
    </>
  );
}

function Shot({ label, right, src, alt }: { label: string; right?: string; src: string; alt: string }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 6px 10px', font: mono(500, 10.5), letterSpacing: '.14em', color: C.mut }}>
        <span>{label}</span>
        {right && <span>{right}</span>}
      </div>
      <img src={src} alt={alt} loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
    </div>
  );
}

function Callout({ children, style, dashed, color = C.red, textColor = C.redInk }: { children: ReactNode; style: CSSProperties; dashed?: boolean; color?: string; textColor?: string }) {
  return (
    <div style={{ position: 'absolute', padding: '4px 8px', background: 'rgba(11,15,19,.9)', border: `1px ${dashed ? 'dashed' : 'solid'} ${color}`, font: mono(500, 11), letterSpacing: '.1em', color: textColor, whiteSpace: 'nowrap', ...style }}>
      {children}
    </div>
  );
}

function JoinForm({ id, code, setCode, onJoin, wide }: { id: string; code: string; setCode: (c: string) => void; onJoin: (e: FormEvent) => void; wide?: boolean }) {
  return (
    <form onSubmit={onJoin} style={{ display: 'flex', height: wide ? 52 : 50, border: `1px solid ${C.line2}`, borderRadius: 3, background: '#0E1318', overflow: 'hidden' }}>
      <label htmlFor={id} className="sr-only">6-character session code</label>
      <input
        id={id}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
        maxLength={6}
        autoComplete="off"
        spellCheck={false}
        placeholder="CODE"
        style={{ width: wide ? undefined : 132, flex: wide ? 1 : undefined, minWidth: 0, padding: '0 14px', background: 'transparent', border: 0, outlineOffset: -2, color: C.text, font: mono(500, 17), letterSpacing: '.3em', textTransform: 'uppercase' }}
      />
      <button type="submit" className="lp-btn" style={{ padding: '0 18px', background: '#1C242B', border: 0, borderLeft: `1px solid ${C.line2}`, borderRadius: 0, color: C.text, fontSize: 14 }}>
        Join
      </button>
    </form>
  );
}

function DemoLink({ style }: { style?: CSSProperties }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const d = await api.demo();
            saveIdentity(d.code, { token: d.instructorToken, actor: 'DS', pin: d.pin });
            navigate(`/aar/${d.code}`);
          } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
          }
        }}
        style={{ padding: 0, background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', font: sans(500, 14), color: C.amber, textDecoration: 'underline', textUnderlineOffset: 3, ...style }}
      >
        {busy ? 'Playing a scripted demo exercise…' : 'Watch a finished exercise’s debrief →'}
      </button>
      {err && <span role="alert" style={{ font: sans(400, 13), color: C.redInk }}>{err}</span>}
    </span>
  );
}

const NAV = [
  ['How it works', 'how'],
  ['Directing Staff', 'ds'],
  ['Debrief', 'debrief'],
  ['3D & VR', 'vr'],
  ['Course directors', 'directors'],
] as const;

const FRICTIONS = [
  ['F-01', 'JAMMING', 'A jammer severs the link', 'Inside the radius the net drops; outside it holds. Computed from real geometry, not scripted.'],
  ['F-02', 'DELAY', 'Messages arrive late', 'Traffic on a delayed channel lands after the moment it described.'],
  ['F-03', 'CONTRADICTION', 'Two reports, one square', 'Sensors disagree on F4. Verify before you act, or record why you did not.'],
  ['F-04', 'DECOY', 'Three dummies read as armour', 'The DS sees decoys. Kestrel 2 sees a company of tanks.'],
  ['F-05', 'GPS SPOOFING', 'Your position walks away', 'A spoofed fix drifts a unit’s believed position off its true one.'],
  ['F-06', 'C2 OUTAGE', 'SATCOM dark, HF takes over', 'Outages force traffic down the PACE plan. Who still hears you?'],
] as const;

const TABS = [
  ['truth', 'GROUND TRUTH', 'DS only'],
  ['k6', 'KESTREL 6', 'Commander'],
  ['k2', 'KESTREL 2', 'Platoon B'],
] as const;

export default function Landing() {
  const mobile = useMedia('(max-width: 1023px)');
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const [split, setSplit] = useState(50);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('k2');
  const [code, setCode] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const dragging = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => {
      let a: string | null = null;
      for (const [, id] of NAV) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 160) a = id;
      }
      setActive(a);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const setX = (x: number) => {
    const r = heroRef.current?.getBoundingClientRect();
    if (r) setSplit(Math.max(6, Math.min(94, ((x - r.left) / r.width) * 100)));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = ({ ArrowLeft: -2, ArrowRight: 2, PageDown: -10, PageUp: 10 } as Record<string, number>)[e.key];
    if (step) setSplit((s) => Math.max(6, Math.min(94, s + step)));
    else if (e.key === 'Home') setSplit(6);
    else if (e.key === 'End') setSplit(94);
    else return;
    e.preventDefault();
  };
  const join = (e: FormEvent) => {
    e.preventDefault();
    navigate(code.length === 6 ? `/join?code=${code}` : '/join');
  };
  const focusJoin = () => document.getElementById(mobile ? 'code-m' : 'code-d')?.focus();
  const pct = `${split}%`;

  return (
    <div className="lp" id="top">
      {/* message-header strip */}
      <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '0 clamp(16px,3vw,40px)', background: '#080B0E', borderBottom: '1px solid #222A31', font: mono(500, 10.5), letterSpacing: '.16em', color: C.mut, position: 'relative', zIndex: 30, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span>{mobile ? 'EXERCISE · EXERCISE · EXERCISE' : 'EXERCISE · EXERCISE · EXERCISE — SYNTHETIC TRAINING DATA'}</span>
        {!mobile && <span style={{ color: C.faint }}>SIH26248 · MoD / DSSC</span>}
      </div>

      {!mobile ? (
        <section ref={heroRef} aria-label="Ground truth versus perceived picture" style={{ position: 'relative', height: HERO_H, overflow: 'hidden', background: C.ink, touchAction: 'pan-y' }}>
          <div style={heroBox}>
            <img src={heroFog} alt="Sand model of a fictional river crossing under drifting fog: hostile blocks, a red jamming ring and a town on the far bank" style={fill} />
          </div>
          <div aria-hidden style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - split}% 0 0)` }}>
            <div style={heroBox}>
              <img src={heroClear} alt="" style={fill} />
            </div>
          </div>
          <div aria-hidden style={{ position: 'absolute', inset: 0, clipPath: `inset(0 0 0 ${split}%)`, pointerEvents: 'none' }}>
            <div style={heroBox}>
              <FogDrift />
              <HeroFx reduced={reduced} />
              <Callout color={C.amber} textColor="#F0C46A" style={{ left: '73.3%', top: '36.3%', transform: 'translate(-100%,-50%)' }}>AGE 4 MIN</Callout>
              <Callout style={{ left: '82.8%', top: '37.6%', transform: 'translate(-50%,-100%)' }}>LINK JAMMED</Callout>
              <Callout dashed style={{ left: '77.8%', top: '68%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 9px' }}>
                <span style={{ font: mono(500, 13), letterSpacing: '.08em' }}>5× ARMOUR?</span>
                <span style={{ font: mono(400, 10), letterSpacing: '.12em', color: C.mut }}>3 REPORTS · UNVERIFIED</span>
              </Callout>
            </div>
          </div>
          {/* legibility */}
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(11,15,19,.88) 0%,rgba(11,15,19,.7) 26%,rgba(11,15,19,0) 55%)', pointerEvents: 'none' }} />
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg,#0B0F13 0%,rgba(11,15,19,.55) 14%,rgba(11,15,19,0) 32%),linear-gradient(180deg,rgba(11,15,19,.7) 0%,rgba(11,15,19,0) 16%)', pointerEvents: 'none' }} />

          <nav aria-label="Primary" style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - clamp(32px,6vw,96px))', maxWidth: 1280, zIndex: 20, display: 'flex', alignItems: 'center', gap: 24, height: 56, padding: '0 10px 0 18px', background: 'rgba(11,15,19,.92)', border: `1px solid ${C.line}`, borderRadius: 4 }}>
            <Wordmark size={15} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto' }}>
              {NAV.map(([label, id]) => (
                <a key={id} href={`#${id}`} className="lp-nav-link" aria-current={active === id ? 'true' : undefined}>{label}</a>
              ))}
            </div>
            <Link to="/create" className="lp-btn lp-btn-primary" style={{ height: 38, padding: '0 16px', fontSize: 13.5, flex: 'none' }}>Create exercise</Link>
          </nav>

          <div style={{ position: 'absolute', zIndex: 10, left: 'clamp(24px,5vw,80px)', top: 'clamp(120px,17%,164px)', maxWidth: 'min(640px, calc(50% - 88px))', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 22 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 10px', border: '1px solid rgba(229,169,64,.55)', background: 'rgba(11,15,19,.6)', font: mono(500, 11), letterSpacing: '.14em', color: C.amber }}>CLOSED WARGAME · MoD / DSSC · SIH 2026</span>
            <h1 className="lp-display" style={{ margin: 0, fontWeight: 800, fontSize: 'clamp(44px,5vw,74px)', lineHeight: 0.98, letterSpacing: '-.022em', color: C.head, textWrap: 'balance' }}>Every commander sees a different war.</h1>
            <p style={{ margin: 0, maxWidth: 470, font: sans(400, 17, 1.55), color: '#D2CCBD', textWrap: 'pretty' }}>The server holds the ground truth. Each commander gets a deliberately degraded copy. The debrief judges what was knowable, not what was lucky.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 4 }}>
              <Link to="/create" className="lp-btn lp-btn-primary" style={{ height: 50, padding: '0 22px' }}>Create exercise <span aria-hidden>→</span></Link>
              <JoinForm id="code-d" code={code} setCode={setCode} onJoin={join} />
            </div>
            <DemoLink />
          </div>

          <div aria-hidden style={{ position: 'absolute', zIndex: 8, top: 96, left: pct, transform: 'translateX(calc(-100% - 14px))', padding: '5px 9px', background: 'rgba(11,15,19,.88)', border: `1px solid ${C.blue}`, font: mono(500, 11), letterSpacing: '.14em', color: '#9CC4EF', whiteSpace: 'nowrap' }}>GROUND TRUTH</div>
          <div aria-hidden style={{ position: 'absolute', zIndex: 8, top: 96, left: pct, transform: 'translateX(14px)', padding: '5px 9px', background: 'rgba(11,15,19,.88)', border: `1px dashed ${C.text}`, font: mono(500, 11), letterSpacing: '.14em', color: C.text, whiteSpace: 'nowrap' }}>WHAT KESTREL 2 SEES</div>

          <div
            data-testid="fog-divider"
            style={{ position: 'absolute', zIndex: 9, top: 0, bottom: 0, left: pct, width: 44, transform: 'translateX(-50%)', cursor: 'ew-resize', touchAction: 'none' }}
            onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              setX(e.clientX);
            }}
            onPointerMove={(e) => dragging.current && setX(e.clientX)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            <div aria-hidden style={{ position: 'absolute', left: 21, top: 84, bottom: 0, width: 2, background: 'linear-gradient(180deg,rgba(236,230,216,0) 0%,rgba(236,230,216,.9) 12%,rgba(236,230,216,.9) 100%)' }} />
            <div
              role="slider"
              tabIndex={0}
              aria-label="Move the line between ground truth and Kestrel 2's picture"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(split)}
              aria-valuetext={`Ground truth shown on the left ${Math.round(split)} percent`}
              onKeyDown={onKey}
              style={{ position: 'absolute', left: '50%', top: '68%', transform: 'translate(-50%,-50%)', width: 44, height: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: C.ink, border: `1.5px solid ${C.text}`, borderRadius: 3, boxShadow: '0 6px 24px rgba(0,0,0,.5)' }}
            >
              <span aria-hidden style={{ display: 'flex', gap: 2, font: mono(500, 10), color: C.text }}><span>◂</span><span>▸</span></span>
              <span aria-hidden style={{ font: mono(500, 10), color: C.amber, letterSpacing: '.06em' }}>COL {COLS[Math.min(7, Math.floor(split / 12.5))]}</span>
            </div>
          </div>
          <div aria-hidden style={{ position: 'absolute', zIndex: 8, right: 'clamp(24px,4vw,64px)', bottom: 84, font: mono(400, 10.5, 1.6), letterSpacing: '.14em', color: C.mut, textAlign: 'right' }}>DRAG OR ← → TO MOVE THE FOG LINE</div>
        </section>
      ) : (
        <section aria-label="Ground truth versus perceived picture" style={{ position: 'relative', background: C.ink, paddingBottom: 88 }}>
          <nav aria-label="Primary" style={{ margin: '12px 12px 0', background: '#0F1419', border: `1px solid ${C.line}`, borderRadius: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, height: 52, padding: '0 8px 0 14px' }}>
              <Wordmark size={13} />
              <button aria-expanded={menu} aria-controls="lp-menu" onClick={() => setMenu((m) => !m)} style={{ height: 44, padding: '0 12px', background: 'transparent', border: `1px solid ${C.line}`, borderRadius: 3, color: C.text, font: mono(500, 11), letterSpacing: '.14em' }}>
                {menu ? 'CLOSE' : 'MENU'}
              </button>
            </div>
            {menu && (
              <ul id="lp-menu" style={{ listStyle: 'none', margin: 0, padding: '4px 14px 14px', display: 'grid', gap: 2, borderTop: `1px solid ${C.line}` }}>
                {NAV.map(([label, id]) => (
                  <li key={id}><a href={`#${id}`} onClick={() => setMenu(false)} style={{ display: 'block', padding: '12px 0', font: sans(500, 15), color: C.text, textDecoration: 'none' }}>{label}</a></li>
                ))}
                <li><Link to="/ds-login" style={{ display: 'block', padding: '12px 0', font: sans(500, 15), color: C.text, textDecoration: 'none' }}>DS log in</Link></li>
              </ul>
            )}
          </nav>
          <div style={{ padding: '36px 20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 18 }}>
            <span style={{ padding: '6px 9px', border: '1px solid rgba(229,169,64,.55)', font: mono(500, 10, 1.2), letterSpacing: '.12em', color: C.amber }}>CLOSED WARGAME · MoD / DSSC · SIH 2026</span>
            <h1 className="lp-display" style={{ margin: 0, fontWeight: 800, fontSize: 42, lineHeight: 1, letterSpacing: '-.02em', color: C.head, textWrap: 'balance' }}>Every commander sees a different war.</h1>
            <p style={{ margin: 0, font: sans(400, 16, 1.55), color: '#D2CCBD' }}>The server holds the ground truth. Each commander gets a deliberately degraded copy. The debrief judges what was knowable, not what was lucky.</p>
          </div>
          <div role="tablist" aria-label="Whose picture" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', margin: '0 12px', border: `1px solid ${C.line}`, borderBottom: 0 }}>
            {TABS.map(([id, label, sub]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={{ minHeight: 52, padding: '8px 4px', background: tab === id ? '#161E25' : C.ink, border: 0, borderRight: `1px solid ${C.line}`, borderBottom: `2px solid ${tab === id ? C.amber : 'transparent'}`, color: tab === id ? C.text : C.mut, font: mono(500, 10.5, 1.3), letterSpacing: '.08em', cursor: 'pointer' }}>
                <span style={{ display: 'block', whiteSpace: 'nowrap' }}>{label}</span>
                <span style={{ display: 'block', marginTop: 3, font: sans(400, 11), letterSpacing: 0, color: C.mut }}>{sub}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" style={{ position: 'relative', height: 420, margin: '0 12px', overflow: 'hidden', border: `1px solid ${C.line}` }}>
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: 'max(860px, calc((100vw - 24px) * 1.5))', aspectRatio: '1672/941', transform: 'translate(-66%,-58%)' }}>
              {tab === 'truth' ? (
                <img src={heroClear} alt="Ground truth: the sand model with no fog" style={fill} />
              ) : (
                <>
                  <img src={heroFog} alt="The same sand model under fog, as one commander perceives it" style={fill} />
                  <FogDrift />
                  <HeroFx reduced={reduced} />
                </>
              )}
              {tab === 'k2' && (
                <>
                  <Callout color={C.amber} textColor="#F0C46A" style={{ left: '73.3%', top: '36.3%', transform: 'translate(-100%,-50%)', fontSize: 10 }}>AGE 4 MIN</Callout>
                  <Callout style={{ left: '80%', top: '37.6%', transform: 'translate(-50%,-100%)', fontSize: 10 }}>LINK JAMMED</Callout>
                  <Callout dashed style={{ left: '76%', top: '68%', transform: 'translate(-50%,-50%)', fontSize: 12 }}>5× ARMOUR?</Callout>
                </>
              )}
              {tab === 'k6' && (
                <>
                  <Callout style={{ left: '80%', top: '37.6%', transform: 'translate(-50%,-100%)', fontSize: 10 }}>PL_NET_B DOWN</Callout>
                  <Callout dashed style={{ left: '76%', top: '68%', transform: 'translate(-50%,-50%)', fontSize: 12 }}>2× ARMOUR? · UAV</Callout>
                </>
              )}
            </div>
            <div style={{ position: 'absolute', left: 10, bottom: 10, padding: '5px 8px', background: 'rgba(11,15,19,.9)', border: `1px solid ${C.line2}`, font: mono(500, 10), letterSpacing: '.12em', color: C.text }}>
              {tab === 'truth' ? 'GROUND TRUTH · DS ONLY' : tab === 'k6' ? 'WHAT KESTREL 6 SEES' : 'WHAT KESTREL 2 SEES'}
            </div>
          </div>
          <div style={{ padding: '24px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Link to="/create" className="lp-btn lp-btn-primary" style={{ height: 52 }}>Create exercise →</Link>
            <JoinForm id="code-m" code={code} setCode={setCode} onJoin={join} wide />
            <DemoLink style={{ padding: '10px 0' }} />
          </div>
        </section>
      )}

      {/* proof cards overlapping the hero */}
      <div style={{ position: 'relative', zIndex: 12, marginTop: -64, padding: '0 clamp(16px,4vw,48px)' }}>
        <div style={{ ...wrap, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 1, background: C.line, border: `1px solid ${C.line}`, boxShadow: '0 24px 60px rgba(0,0,0,.45)' }}>
          {(
            [
              ['A1', '6', 'ROLES', 'Tri-service, plus Directing Staff'],
              ['C1', '40', 'EXERCISES', 'On one server, at 4× speed'],
              ['E1', '100%', 'OFFLINE', 'Closed LAN, no internet'],
              ['G1', 'Identical', 'REPLAY', 'Every time, from the event log'],
            ] as const
          ).map(([cell, n, label, sub]) => (
            <div key={cell} style={{ background: C.card, padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span aria-hidden style={{ alignSelf: 'flex-end', font: mono(400, 10), color: C.faint, letterSpacing: '.1em' }}>{cell}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ font: n.length > 4 ? `500 clamp(24px,2.4vw,30px)/1.2 ${MONO}` : `500 clamp(28px,3vw,38px)/1 ${MONO}`, color: C.amber }}>{n}</span>
                <span className="lp-display" style={{ fontStretch: '75%', fontWeight: 700, fontSize: 15, letterSpacing: '.12em', color: C.text }}>{label}</span>
              </div>
              <span style={{ font: sans(400, 13.5, 1.4), color: C.mut }}>{sub}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 1. FOG */}
      <section id="how" style={sectionPad('clamp(80px,10vw,136px)', 'clamp(56px,7vw,96px)')}>
        <div style={wrap}>
          <SectionHead num="1. SITUATION" title="The fog, engineered." sub="Six friction mechanics, computed by the server and fired by the Directing Staff. Each one degrades a different commander's picture in a different way." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,340px),1fr))', gap: 1, background: C.line, border: `1px solid ${C.line}` }}>
            {(() => {
              const diagrams = frictionDiagrams(reduced);
              return FRICTIONS.map(([codeId, tag, title, body], i) => (
                <article key={codeId} style={{ background: C.panel, padding: '20px 22px 26px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', font: mono(500, 10.5), letterSpacing: '.14em', color: C.mut }}>
                    <span>{codeId}</span>
                    <span>{tag}</span>
                  </div>
                  <div style={{ height: 150, background: C.ink, border: '1px solid #222A31' }}>{diagrams[i]}</div>
                  <h3 className="lp-display" style={{ margin: '6px 0 0', fontWeight: 700, fontSize: 21, lineHeight: 1.15, color: C.head }}>{title}</h3>
                  <p style={{ margin: 0, font: sans(400, 15, 1.55), color: C.body, textWrap: 'pretty' }}>{body}</p>
                </article>
              ));
            })()}
          </div>
        </div>
      </section>

      {/* 2. SEATS */}
      <section id="ds" style={sectionPad('clamp(56px,7vw,96px)', 'clamp(56px,7vw,96px)')}>
        <div style={wrap}>
          <SectionHead num="2. EXECUTION" title="Three seats at the table." sub="2–6 players and the Directing Staff, in a browser, on the same LAN." />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
            <figure style={{ flex: '1.6 1 560px', margin: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Shot label="DS CONSOLE · GROUND TRUTH" right="T+02:02" src={dsConsole} alt="Directing Staff console: ground-truth map, jammer placed at G2 and the live inject composer" />
              <figcaption style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 32px' }}>
                <h3 className="lp-display" style={{ flex: '1 1 180px', margin: 0, fontWeight: 700, fontSize: 22, color: C.head }}>Directing Staff</h3>
                <p style={{ flex: '2 1 320px', margin: 0, font: sans(400, 15, 1.6), color: C.body }}>See ground truth and fire friction live: delay a net, place a jammer, drop a decoy. An optional AI advisor proposes the next inject for your training objective.</p>
              </figcaption>
            </figure>
            <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 32 }}>
              <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Shot label="KESTREL 2 · PERCEIVED PICTURE" src={trainee} alt="Trainee screen for Kestrel 2, cut off from Kestrel 6, deciding on the commander's intent" />
                <figcaption>
                  <h3 className="lp-display" style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 20, color: C.head }}>Trainee</h3>
                  <p style={{ margin: 0, font: sans(400, 15, 1.6), color: C.body }}>See only what reached you, with the age of every report. Cut off, act on intent. The decision is scored against it.</p>
                </figcaption>
              </figure>
              <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Shot label="AAR · DECISION D3" src={aarCard} alt="After-action review: decision card with what was knowable next to revealed ground truth" />
                <figcaption>
                  <h3 className="lp-display" style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 20, color: C.head }}>Debrief</h3>
                  <p style={{ margin: 0, font: sans(400, 15, 1.6), color: C.body }}>Replay every decision with what was knowable then. Export the AAR as PDF or CSV.</p>
                </figcaption>
              </figure>
            </div>
          </div>
          <div style={{ marginTop: 48, display: 'flex', flexWrap: 'wrap', border: `1px solid ${C.line}` }}>
            <div style={{ flex: '1 1 180px', padding: '16px 18px', font: mono(500, 11, 1.5), letterSpacing: '.14em', color: C.amber, borderRight: `1px solid ${C.line}` }}>ROLES · TRI-SERVICE</div>
            <ul aria-label="Roles" style={{ flex: '5 1 520px', display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 14px', margin: 0, listStyle: 'none', alignItems: 'center' }}>
              {['Company Commander', 'Platoon Commander A', 'Platoon Commander B', 'Air Liaison Officer', 'EW / Signals Officer'].map((r) => (
                <li key={r} style={{ padding: '7px 10px', border: `1px solid ${C.line2}`, font: sans(400, 13.5), color: C.text }}>{r}</li>
              ))}
              <li style={{ padding: '7px 10px', border: `1px dashed ${C.line2}`, font: sans(400, 13.5), color: C.body }}>Naval Liaison Officer · optional</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 3. JUDGED (paper) */}
      <section id="debrief" style={{ ...sectionPad('clamp(72px,9vw,128px)', 'clamp(72px,9vw,128px)'), background: C.paper, color: C.paperInk, scrollMarginTop: 0 }}>
        <div style={wrap}>
          <Ruler paper />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '40px 48px', borderTop: `1px solid ${C.paperInk}`, paddingTop: 24 }}>
            <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ font: mono(500, 12, 1.5), letterSpacing: '.16em', color: '#8A5A0B' }}>3. ASSESSMENT</div>
              <h2 className="lp-display" style={{ margin: 0, fontWeight: 700, fontSize: 'clamp(34px,4.2vw,58px)', lineHeight: 1, letterSpacing: '-.02em', textWrap: 'balance' }}>Judged on what was knowable.</h2>
              <p style={{ margin: 0, font: sans(400, 17, 1.6), color: '#4A4538', textWrap: 'pretty' }}>Every decision is frozen with exactly what that officer could know at that moment. The debrief judges judgement, not luck.</p>
              <ol style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.paperLine}` }}>
                {['SA freeze-probes mid-exercise', 'Confidence calibration on every decision', 'Deterministic replay from the event log', 'PDF and CSV export'].map((t, i) => (
                  <li key={t} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: `1px solid ${C.paperLine}`, font: sans(400, 15, 1.45) }}>
                    <span style={{ font: mono(500, 12, 1.6), color: C.paperMut, width: 20 }}>{'abcd'[i]}.</span>
                    {t}
                  </li>
                ))}
              </ol>
            </div>
            <div style={{ flex: '1.7 1 560px', background: C.card, color: C.text, border: `1px solid ${C.paperInk}`, boxShadow: '12px 12px 0 #D8CEB6' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px', padding: '16px 20px', borderBottom: `1px solid ${C.line}` }}>
                <span style={{ font: mono(500, 13), color: C.mut }}>D3</span>
                <span style={{ font: mono(500, 15), color: C.text }}>T+06:30</span>
                <span style={{ font: sans(600, 15), color: '#8DBBEE' }}>KESTREL 2</span>
                <span style={{ font: sans(600, 15) }}>Advance F4</span>
                <span style={{ padding: '4px 7px', border: `1px solid ${C.red}`, font: mono(500, 10.5), letterSpacing: '.1em', color: C.redInk }}>CUT OFF — MISSION COMMAND</span>
                <span style={{ marginLeft: 'auto', padding: '4px 7px', border: `1px solid ${C.line2}`, font: mono(500, 10.5), letterSpacing: '.1em', color: C.mut }}>CONFIDENCE 55%</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, borderRight: `1px solid ${C.line}` }}>
                  <div style={{ font: mono(500, 10.5), letterSpacing: '.14em', color: '#8DBBEE' }}>WHAT KESTREL 2 KNEW AT T+06:30</div>
                  <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', font: sans(400, 14, 1.4) }}>
                    <dt style={{ color: C.mut }}>Believed position</dt>
                    <dd style={{ margin: 0, fontFamily: MONO }}>G3</dd>
                    <dt style={{ color: C.mut }}>Nets</dt>
                    <dd style={{ margin: 0, fontFamily: MONO, fontSize: 12.5, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {['CMD_NET', 'PL_NET_B', 'HF_NET'].map((n) => (
                        <span key={n} style={{ padding: '2px 5px', border: `1px solid ${C.red}`, color: C.redInk }}>{n} ⊘<span className="sr-only"> denied</span></span>
                      ))}
                    </dd>
                    <dt style={{ color: C.mut }}>Intent</dt>
                    <dd style={{ margin: 0, fontFamily: MONO }}>v2</dd>
                    <dt style={{ color: C.mut }}>Intel held</dt>
                    <dd style={{ margin: 0 }}>0 items · 0 open conflicts</dd>
                  </dl>
                  <blockquote style={{ margin: '6px 0 0', padding: '12px 14px', background: C.ink, border: `1px solid ${C.line}`, font: `italic 400 15px/1.5 ${SANS}`, color: C.text }}>“Comms down with KESTREL 6. Intent is to seize the bridge, so I close on F4.”</blockquote>
                </div>
                <div style={{ position: 'relative', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 280 }} aria-live="polite">
                  <div style={{ font: mono(500, 10.5), letterSpacing: '.14em', color: C.amber }}>GROUND TRUTH</div>
                  {revealed ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ padding: '4px 7px', border: '1px solid #6FBF8E', font: mono(500, 11), color: '#8FD3A9' }}>✓ SOUND</span>
                        <span style={{ font: mono(400, 14) }}>rule R1: ρ=0 in F4 (&lt;0.75)</span>
                      </div>
                      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', font: sans(400, 14, 1.4) }}>
                        <dt style={{ color: C.mut }}>True position</dt>
                        <dd style={{ margin: 0, fontFamily: MONO }}>G3</dd>
                        <dt style={{ color: C.mut }}>In target</dt>
                        <dd style={{ margin: 0 }}>no hostiles</dd>
                        <dt style={{ color: C.mut }}>Intent adherence</dt>
                        <dd style={{ margin: 0, fontFamily: MONO }}>1</dd>
                      </dl>
                      <p style={{ margin: '4px 0 0', padding: '12px 14px', border: `1px solid ${C.line2}`, font: sans(400, 14, 1.5), color: '#D2CCBD' }}>Cut off from the commander, the action served the stated intent. Good mission command. Under-confident (55%) for an action that proved sound.</p>
                      <button onClick={() => setRevealed(false)} className="lp-btn" style={{ alignSelf: 'flex-start', marginTop: 'auto', minHeight: 40, padding: '0 14px', background: 'transparent', border: `1px solid ${C.line2}`, color: C.mut, fontSize: 13, fontWeight: 500 }}>Hide ground truth</button>
                    </>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 14, padding: 18, background: 'repeating-linear-gradient(135deg,#161E25 0 8px,#11171D 8px 16px)', border: `1px dashed ${C.line2}` }}>
                      <span style={{ font: sans(400, 13, 1.5), color: C.mut }}>Withheld until debrief. Decide first, then see what was true.</span>
                      <button onClick={() => setRevealed(true)} className="lp-btn lp-btn-primary" style={{ minHeight: 44, padding: '0 18px', fontSize: 14 }}>Reveal ground truth</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. 3D / VR */}
      <section id="vr" style={{ ...sectionPad('clamp(72px,9vw,128px)', 'clamp(40px,5vw,64px)'), scrollMarginTop: 0 }}>
        <div style={wrap}>
          <Ruler />
          <div style={{ display: 'flex', flexWrap: 'wrap-reverse', gap: '40px 48px', borderTop: `1px solid ${C.line}`, paddingTop: 24 }}>
            <div style={{ flex: '2.4 1 560px', border: `1px solid ${C.line}`, background: C.panel, padding: 6 }}>
              <img src={sand3d} alt="3D sand table: the same grid as the map, with friendly and hostile blocks and a jammer dome" loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
            </div>
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ font: mono(500, 12, 1.5), letterSpacing: '.16em', color: C.amber }}>4. TERRAIN</div>
              <h2 className="lp-display" style={{ margin: 0, fontWeight: 700, fontSize: 'clamp(32px,3.6vw,50px)', lineHeight: 1.02, letterSpacing: '-.02em', color: C.head }}>The sand table, in 3D and VR.</h2>
              <p style={{ margin: 0, font: sans(400, 16, 1.6), color: C.sub }}>Orbit the same terrain the plan is briefed on. On a WebXR headset or phone, step into it.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['Enter VR', 'Enter AR'].map((t) => (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', height: 40, padding: '0 14px', border: `1px solid ${C.line2}`, font: mono(500, 13), letterSpacing: '.08em', color: C.text }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. COURSE DIRECTOR */}
      <section id="directors" style={{ ...sectionPad('clamp(56px,7vw,96px)', 'clamp(80px,10vw,136px)'), scrollMarginTop: 0 }}>
        <div style={wrap}>
          <SectionHead num="5. COMMAND" title="For the course director." sub="Write the scenario. Compare syndicates across courses." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))', gap: 32 }}>
            {(
              [
                [editorShot, 'Scenario editor: painted terrain, unit routes with timings, sensors and jammer radii, validate and dry run', 'Scenario editor', 'Paint terrain, place forces and routes, script the MSEL, set sensors. Validate with a dry run before you save.', '/scenarios'],
                [analyticsShot, 'Cross-course analytics: exercises, decisions, sound share, SA and calibration scores by role', 'Cross-course analytics', 'Every finished exercise is replayed from its log and reduced to the same metrics: sound decisions, verified intel, SA, calibration.', '/analytics'],
              ] as const
            ).map(([src, alt, title, body, to]) => (
              <figure key={title} style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ border: `1px solid ${C.line}`, background: C.panel, padding: 6 }}>
                  <img src={src} alt={alt} loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
                </div>
                <figcaption>
                  <h3 className="lp-display" style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 20, color: C.head }}>{title}</h3>
                  <p style={{ margin: '0 0 8px', font: sans(400, 15, 1.6), color: C.body }}>{body}</p>
                  <Link to={to} style={{ font: sans(500, 14) }}>Open {title.toLowerCase()} →</Link>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* 6. CLOSED NETWORK (paper) */}
      <section id="network" style={{ ...sectionPad('clamp(72px,9vw,128px)', 'clamp(72px,9vw,128px)'), background: C.paper, color: C.paperInk }}>
        <div style={wrap}>
          <Ruler paper />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 32px', borderTop: `1px solid ${C.paperInk}`, paddingTop: 24, marginBottom: 48 }}>
            <div style={{ flex: '1 1 220px', font: mono(500, 12, 1.5), letterSpacing: '.16em', color: '#8A5A0B' }}>6. SERVICE SUPPORT</div>
            <h2 className="lp-display" style={{ flex: '3 1 480px', margin: 0, fontWeight: 700, fontSize: 'clamp(34px,4.2vw,58px)', lineHeight: 1, letterSpacing: '-.02em' }}>Built for a closed network.</h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48 }}>
            <ol style={{ flex: '1.6 1 480px', margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '0 40px' }}>
              {(
                [
                  ['Offline Docker', 'One container on a closed LAN. No internet, no cloud account.'],
                  ['Ground truth stays on the server', 'Each browser receives only its own degraded picture. There is nothing to inspect.'],
                  ['Synthetic data only', 'All units, callsigns, terrain and events are fictional.'],
                  ['AI is optional', 'Switch it off. Advisor and debrief fall back to templates.'],
                ] as const
              ).map(([title, body], i) => (
                <li key={title} style={{ padding: '20px 0', borderTop: `1px solid ${C.paperLine}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ font: mono(500, 12), color: C.paperMut }}>{'abcd'[i]}.</span>
                  <strong className="lp-display" style={{ fontSize: 19 }}>{title}</strong>
                  <span style={{ font: sans(400, 15, 1.55), color: '#4A4538' }}>{body}</span>
                </li>
              ))}
            </ol>
            <div style={{ flex: '1 1 320px', alignSelf: 'flex-start', background: C.paperInk, color: C.paper, padding: 28 }}>
              <div style={{ font: mono(500, 10.5), letterSpacing: '.14em', color: C.amber, marginBottom: 20 }}>MEASURED · ONE SERVER</div>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(3,auto)', justifyContent: 'space-between', gap: 12 }}>
                {(
                  [
                    ['40', 'exercises at once'],
                    ['4×', 'speed'],
                    ['96%', 'of real time'],
                  ] as const
                ).map(([n, l]) => (
                  <div key={l} style={{ display: 'flex', flexDirection: 'column-reverse', gap: 10 }}>
                    <dt style={{ font: mono(400, 12, 1.4), letterSpacing: '.06em', color: '#CFC8B6' }}>{l}</dt>
                    <dd style={{ margin: 0, font: `500 clamp(30px,3.4vw,44px)/1 ${MONO}`, color: C.amber }}>{n}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* closing CTA */}
      <section id="create" style={sectionPad('clamp(72px,9vw,120px)', 'clamp(72px,9vw,120px)')}>
        <div style={{ ...wrap, display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
            <div style={{ font: mono(500, 12, 1.5), letterSpacing: '.16em', color: C.amber }}>DS · SET THE TABLE</div>
            <h2 className="lp-display" style={{ margin: 0, fontWeight: 800, fontSize: 'clamp(36px,5vw,68px)', lineHeight: 0.98, letterSpacing: '-.02em', color: C.head }}>Decide under fog.</h2>
            <p style={{ margin: 0, font: sans(400, 17, 1.6), color: C.sub }}>Pick a scenario, seat the roles, share the code.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link to="/create" className="lp-btn lp-btn-primary" style={{ height: 52, padding: '0 24px' }}>Create exercise →</Link>
            <button onClick={() => { window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); setTimeout(focusJoin, reduced ? 0 : 500); }} className="lp-btn lp-btn-dark" style={{ height: 52, padding: '0 22px' }}>Join with a code</button>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${C.line}`, padding: '28px clamp(16px,4vw,48px) 36px' }}>
        <div style={{ ...wrap, display: 'flex', flexWrap: 'wrap', gap: '16px 40px', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', font: mono(500, 11.5, 1.4), letterSpacing: '.12em', color: C.mut }}>
            <span>SIH 2026</span>
            <span>SIH26248</span>
            <span>TEAM {TEAM}</span>
            <Link to="/ds-login" style={{ color: C.mut }}>DS LOG IN</Link>
            <Link to="/join" style={{ color: C.mut }}>JOIN</Link>
            <Link to="/scenarios" style={{ color: C.mut }}>SCENARIOS</Link>
            <Link to="/analytics" style={{ color: C.mut }}>ANALYTICS</Link>
          </div>
          <p style={{ margin: 0, maxWidth: 560, font: sans(400, 13, 1.5), color: '#A9A597' }}>Training simulation — synthetic data. All units, callsigns, terrain and events are fictional.</p>
        </div>
      </footer>
    </div>
  );
}
