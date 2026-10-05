import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Glasses, Smartphone, X } from 'lucide-react';
import { COL_LETTERS, type TerrainCode } from '@vanguard/shared';
import type { MapJammer, MapLink, MapMarker } from './TacticalMap';

/**
 * 3D "sand-model" view (PRD §18, now in scope). Same per-role data as the 2D map — a trainee sees
 * only their perceived picture, the DS sees truth. Orbit on desktop; on WebXR devices the table is
 * placed in front of the user (VR) or in the room (AR). Fully offline (three.js bundled).
 */

export interface SandTableProps {
  terrain: string[];
  markers: MapMarker[];
  jammers?: MapJammer[];
  links?: MapLink[];
  objectives?: { cell: string; text: string }[];
  title: string;
  animMs?: number;
}

const HEIGHT: Record<TerrainCode, number> = { '.': 0.12, F: 0.24, U: 0.28, '~': 0.03, '=': 0.1, '^': 0.8, W: 0.02, M: 0.07, H: 0.46 };
const COLOR: Record<TerrainCode, number> = {
  '.': 0x6b6450,
  F: 0x3f5a3a,
  U: 0x6c6c70,
  '~': 0x2e5f86,
  '=': 0x8a8a8a,
  '^': 0x8a6f4e,
  W: 0x24476b,
  M: 0x4f5f45,
  H: 0x7b6f52,
};
const SIDE: Record<MapMarker['side'], number> = { BLUE: 0x63a2e6, RED: 0xe5675a, UNK: 0xd6bd55 };
const LEVEL: Record<MapLink['level'], number> = { CLEAR: 0x52b984, DEGRADED: 0xe0a83c, DENIED: 0xe5675a };

const W = (x: number) => x - 4;
const Z = (y: number) => y - 4;

function terrainHeight(terrain: string[], x: number, y: number): number {
  const c = Math.min(7, Math.max(0, Math.floor(x)));
  const r = Math.min(7, Math.max(0, Math.floor(y)));
  return HEIGHT[(terrain[r]?.[c] ?? '.') as TerrainCode] ?? 0.12;
}

function textSprite(text: string, color = '#ece6d8', size = 0.22): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = '600 44px "IBM Plex Mono", monospace';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  canvas.width = w;
  canvas.height = 64;
  ctx.font = font;
  ctx.fillStyle = 'rgba(13,18,23,0.72)';
  ctx.fillRect(0, 6, w, 52);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 12, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set((size * w) / 64, size, 1);
  sprite.renderOrder = 10;
  return sprite;
}

interface Token {
  group: THREE.Group;
  key: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t0: number;
}

function buildToken(m: MapMarker, crowded = false): THREE.Group {
  const g = new THREE.Group();
  const color = m.destroyed ? 0x6a7784 : SIDE[m.side];
  let body: THREE.Mesh;
  if (m.negative) {
    body = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 24), new THREE.MeshStandardMaterial({ color: SIDE.UNK }));
    body.rotation.x = Math.PI / 2;
  } else if (m.side === 'BLUE') {
    body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.24), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  } else if (m.side === 'RED') {
    body = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), new THREE.MeshStandardMaterial({ color, roughness: 0.45, wireframe: !!m.decoy }));
  } else {
    body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshStandardMaterial({ color }));
  }
  body.position.y = 0.12;
  body.castShadow = true;
  g.add(body);
  if (m.own) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.29, 32), new THREE.MeshBasicMaterial({ color: 0x63a2e6, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    g.add(ring);
  }
  if (m.conflict) {
    const warn = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.34, 32), new THREE.MeshBasicMaterial({ color: 0xe0a83c, side: THREE.DoubleSide }));
    warn.rotation.x = -Math.PI / 2;
    warn.position.y = 0.015;
    g.add(warn);
  }
  const full = `${m.label ?? m.glyph}${m.sub ? ` · ${m.sub}` : ''}`;
  const short = (m.label ?? m.glyph).length > 11 ? `${(m.label ?? m.glyph).slice(0, 10)}…` : (m.label ?? m.glyph);
  const label = textSprite(crowded ? short : full, m.side === 'RED' ? '#f4a198' : m.side === 'BLUE' ? '#a9cdf3' : '#e9d98f', 0.16);
  label.position.y = 0.48;
  g.add(label);
  if (m.faded) g.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (mat) {
      mat.transparent = true;
      mat.opacity = 0.5;
    }
  });
  return g;
}

function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((m) => {
      (m as THREE.SpriteMaterial).map?.dispose();
      m.dispose();
    });
  });
}

export default function SandTable3D(props: SandTableProps) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    table: THREE.Group;
    dynamic: THREE.Group;
    tokens: Map<string, Token>;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
  } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [xr, setXr] = useState<{ vr: boolean; ar: boolean }>({ vr: false, ar: false });
  const [inXr, setInXr] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  // ---- scene setup (once)
  useEffect(() => {
    const el = box.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.xr.enabled = true;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1217);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
    camera.position.set(0, 9.5, 8.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0.3);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 3;
    controls.maxDistance = 22;
    scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x2a2016, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-6, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 });
    scene.add(sun);

    // The table: base, terrain blocks, grid, axis labels, objectives
    const table = new THREE.Group();
    scene.add(table);
    const base = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.3, 9.2), new THREE.MeshStandardMaterial({ color: 0x22201c, roughness: 0.9 }));
    base.position.y = -0.15;
    base.receiveShadow = true;
    table.add(base);
    const { terrain } = propsRef.current;
    terrain.forEach((row, r) =>
      [...row].forEach((code, c) => {
        const h = HEIGHT[code as TerrainCode] ?? 0.12;
        const geo = code === '^' ? new THREE.ConeGeometry(0.62, h, 4, 1) : new THREE.BoxGeometry(0.98, h, 0.98);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: COLOR[code as TerrainCode] ?? 0x6b6450, roughness: 0.95, flatShading: code === '^' || code === 'H' }));
        mesh.position.set(W(c + 0.5), h / 2, Z(r + 0.5));
        if (code === '^') mesh.rotation.y = Math.PI / 4;
        mesh.receiveShadow = true;
        mesh.castShadow = code === '^' || code === 'H' || code === 'U';
        table.add(mesh);
        if (code === '^') {
          // ridge plinth so the ridge reads as a wall across the cell
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.12, 0.98), new THREE.MeshStandardMaterial({ color: 0x6f5a3f, roughness: 1 }));
          plinth.position.set(W(c + 0.5), 0.06, Z(r + 0.5));
          plinth.receiveShadow = true;
          table.add(plinth);
        }
      }),
    );
    const gridMat = new THREE.LineBasicMaterial({ color: 0xdce3ea, transparent: true, opacity: 0.18 });
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      pts.push(new THREE.Vector3(W(i), 0.31, Z(0)), new THREE.Vector3(W(i), 0.31, Z(8)));
      pts.push(new THREE.Vector3(W(0), 0.31, Z(i)), new THREE.Vector3(W(8), 0.31, Z(i)));
    }
    table.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    for (let i = 0; i < 8; i++) {
      const col = textSprite(COL_LETTERS[i]!, '#b5afa0', 0.3);
      col.position.set(W(i + 0.5), 0.35, Z(-0.45));
      table.add(col);
      const row = textSprite(String(i + 1), '#b5afa0', 0.3);
      row.position.set(W(-0.45), 0.35, Z(i + 0.5));
      table.add(row);
    }
    const dynamic = new THREE.Group();
    table.add(dynamic);
    const tokens = new Map<string, Token>();
    api.current = { renderer, scene, table, dynamic, tokens, camera, controls };

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // click → identify token
    const ray = new THREE.Raycaster();
    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects([...tokens.values()].map((t) => t.group), true)[0];
      if (!hit) return setPicked(null);
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.markerId) o = o.parent;
      const m = propsRef.current.markers.find((x) => x.id === o?.userData.markerId);
      setPicked(m ? (m.title ?? `${m.label ?? m.glyph}${m.sub ? ` · ${m.sub}` : ''}`) : null);
    };
    renderer.domElement.addEventListener('click', onClick);

    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dur = propsRef.current.animMs ?? 800;
      for (const t of tokens.values()) {
        const f = Math.min(1, (now - t.t0) / dur);
        const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
        t.group.position.lerpVectors(t.from, t.to, e);
      }
      if (!renderer.xr.isPresenting) controls.update();
      renderer.render(scene, camera);
    });

    // WebXR capability
    const nav = navigator as Navigator & { xr?: { isSessionSupported: (m: string) => Promise<boolean> } };
    if (nav.xr) {
      Promise.all([nav.xr.isSessionSupported('immersive-vr').catch(() => false), nav.xr.isSessionSupported('immersive-ar').catch(() => false)]).then(([vr, ar]) => setXr({ vr, ar }));
    }
    return () => {
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener('click', onClick);
      ro.disconnect();
      tokens.forEach((t) => disposeGroup(t.group));
      disposeGroup(scene);
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
  }, []);  

  // ---- dynamic content: tokens (tweened), jammer domes, links, objectives
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const { markers, terrain } = props;
    const now = performance.now();
    const seen = new Set<string>();
    const byCell = new Map<string, MapMarker[]>();
    for (const m of markers) {
      const k = `${Math.floor(m.x)},${Math.floor(m.y)}`;
      byCell.set(k, [...(byCell.get(k) ?? []), m]);
    }
    for (const list of byCell.values()) {
      list.forEach((m, i) => {
        seen.add(m.id);
        const n = list.length;
        const off = n === 1 ? { dx: 0, dz: 0 } : { dx: ((i % 2) - 0.5) * 0.42, dz: (Math.floor(i / 2) - (Math.ceil(n / 2) - 1) / 2) * 0.42 };
        const x = n === 1 ? m.x : Math.floor(m.x) + 0.5 + off.dx;
        const y = n === 1 ? m.y : Math.floor(m.y) + 0.5 + off.dz;
        const target = new THREE.Vector3(W(x), terrainHeight(terrain, x, y), Z(y));
        const key = JSON.stringify([m.side, m.glyph, m.label, m.sub, m.own, m.decoy, m.negative, m.conflict, m.faded, m.destroyed, n > 1]);
        const cur = a.tokens.get(m.id);
        if (!cur || cur.key !== key) {
          const pos = cur ? cur.group.position.clone() : target.clone();
          if (cur) {
            a.dynamic.remove(cur.group);
            disposeGroup(cur.group);
          }
          const g = buildToken(m, n > 1);
          g.userData.markerId = m.id;
          g.position.copy(pos);
          a.dynamic.add(g);
          a.tokens.set(m.id, { group: g, key, from: pos, to: target, t0: now });
        } else if (!cur.to.equals(target)) {
          cur.from = cur.group.position.clone();
          cur.to = target;
          cur.t0 = now;
        }
      });
    }
    for (const [id, t] of a.tokens) {
      if (!seen.has(id)) {
        a.dynamic.remove(t.group);
        disposeGroup(t.group);
        a.tokens.delete(id);
      }
    }
    // static-ish overlays rebuilt each update (few objects)
    const overlay = a.table.getObjectByName('overlay');
    if (overlay) {
      a.table.remove(overlay);
      disposeGroup(overlay);
    }
    const ov = new THREE.Group();
    ov.name = 'overlay';
    for (const j of props.jammers ?? []) {
      const r = Math.max(0.2, j.radius);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(r, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xe5675a, transparent: true, opacity: j.active ? (j.estimate ? 0.08 : 0.12) : 0.04, depthWrite: false, side: THREE.DoubleSide }),
      );
      dome.position.set(W(j.x), 0.02, Z(j.y));
      ov.add(dome);
      if (!j.estimate) {
        const inner = new THREE.Mesh(
          new THREE.SphereGeometry(r / 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0xe5675a, transparent: true, opacity: j.active ? 0.22 : 0.06, depthWrite: false }),
        );
        inner.position.copy(dome.position);
        ov.add(inner);
      }
      const lbl = textSprite(j.label, '#f4a198', 0.17);
      lbl.position.set(W(j.x), r * 0.9 + 0.3, Z(j.y));
      ov.add(lbl);
    }
    for (const l of props.links ?? []) {
      const p1 = new THREE.Vector3(W(l.x1), 0.7, Z(l.y1));
      const p2 = new THREE.Vector3(W(l.x2), 0.7, Z(l.y2));
      const mid = p1.clone().add(p2).multiplyScalar(0.5);
      mid.y = 1.1;
      const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
      const mat = l.level === 'CLEAR' ? new THREE.LineBasicMaterial({ color: LEVEL[l.level] }) : new THREE.LineDashedMaterial({ color: LEVEL[l.level], dashSize: 0.12, gapSize: 0.08 });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), mat);
      line.computeLineDistances();
      ov.add(line);
    }
    for (const o of props.objectives ?? []) {
      const c = COL_LETTERS.indexOf(o.cell[0]!);
      const r = Number(o.cell[1]) - 1;
      const h = terrainHeight(props.terrain, c + 0.5, r + 0.5) + 0.02;
      const sq = [
        [c + 0.08, r + 0.08],
        [c + 0.92, r + 0.08],
        [c + 0.92, r + 0.92],
        [c + 0.08, r + 0.92],
        [c + 0.08, r + 0.08],
      ].map(([x, y]) => new THREE.Vector3(W(x!), h, Z(y!)));
      ov.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sq), new THREE.LineBasicMaterial({ color: 0xe5a940 })));
      const flag = textSprite('OBJ', '#e5a940', 0.2);
      flag.position.set(W(c + 0.5), h + 0.75, Z(r + 0.5));
      ov.add(flag);
    }
    a.table.add(ov);
  }, [props]);

  const enter = async (mode: 'immersive-vr' | 'immersive-ar') => {
    const a = api.current;
    const nav = navigator as Navigator & { xr?: { requestSession: (m: string, o: object) => Promise<XRSession> } };
    if (!a || !nav.xr) return;
    const session = await nav.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'bounded-floor'] });
    // Table-top scale: 8 cells ≈ 1.2 m, placed in front of the user.
    a.table.scale.setScalar(0.15);
    a.table.position.set(0, mode === 'immersive-ar' ? -0.45 : 0.8, -1.1);
    a.scene.background = mode === 'immersive-ar' ? null : new THREE.Color(0x0d1217);
    a.renderer.xr.setReferenceSpaceType(mode === 'immersive-ar' ? 'local' : 'local-floor');
    await a.renderer.xr.setSession(session);
    setInXr(true);
    session.addEventListener('end', () => {
      a.table.scale.setScalar(1);
      a.table.position.set(0, 0, 0);
      a.scene.background = new THREE.Color(0x0d1217);
      setInXr(false);
    });
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md bg-bg" data-testid="sand-table">
      <div ref={box} className="h-full w-full" role="img" aria-label={`3D sand table: ${props.title}. Drag to orbit, scroll to zoom.`} />
      <ul className="sr-only">
        {props.markers.map((m) => (
          <li key={m.id}>{`${m.label ?? m.glyph} at ${COL_LETTERS[Math.floor(m.x)]}${Math.floor(m.y) + 1}${m.sub ? `, ${m.sub}` : ''}`}</li>
        ))}
      </ul>
      <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1">
        <span className="rounded border border-line bg-panel/90 px-2 py-1 text-[11px] text-muted">3D sand table · drag to orbit · scroll to zoom</span>
        {xr.vr && !inXr && (
          <button type="button" onClick={() => void enter('immersive-vr')} className="flex items-center gap-1 rounded border border-accent bg-accent/20 px-2 py-1 text-[11px] text-ink">
            <Glasses size={12} /> Enter VR
          </button>
        )}
        {xr.ar && !inXr && (
          <button type="button" onClick={() => void enter('immersive-ar')} className="flex items-center gap-1 rounded border border-accent bg-accent/20 px-2 py-1 text-[11px] text-ink">
            <Smartphone size={12} /> Enter AR
          </button>
        )}
        {!xr.vr && !xr.ar && (
          <span className="rounded border border-line bg-panel/90 px-2 py-1 text-[11px] text-faint" title="Open this page in a WebXR browser (e.g. Meta Quest Browser, Android Chrome) to view the table in VR/AR.">
            VR/AR: open on a WebXR headset or phone
          </span>
        )}
      </div>
      {picked && (
        <div className="absolute bottom-2 left-2 flex max-w-sm items-start gap-2 rounded border border-line bg-panel/95 px-3 py-2 text-xs" role="status">
          <span>{picked}</span>
          <button type="button" aria-label="Close" onClick={() => setPicked(null)} className="text-muted hover:text-ink"><X size={12} /></button>
        </div>
      )}
    </div>
  );
}
