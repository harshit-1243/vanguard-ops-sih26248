import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import maplibregl, { type GeoJSONSource, type LngLatLike, type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Box, Crosshair, Map as MapIcon, RotateCcw } from 'lucide-react';
import { COL_LETTERS, TERRAIN_CODES, cellCentre, cellFromIndex, type TerrainCode } from '@vanguard/shared';
import { cn } from '@/lib/utils';
import { TacticalMap, type MapMarker, type TacticalMapProps } from './TacticalMap';

/**
 * MapLibre GL tactical map (D-016). The fictional 8×8 grid is drawn as local GeoJSON over a
 * blank style (no tiles, no glyphs, fully offline). Units are HTML markers that tween between
 * ticks; 3D mode tilts the camera and extrudes ridges/hills/urban blocks like a sand table.
 * Falls back to the SVG map when WebGL is unavailable (or ?map=svg).
 */

const D = 0.009; // degrees per cell (~1 km at the equator)
const toLngLat = (x: number, y: number): [number, number] => [x * D, -y * D];
const fromLngLat = (lng: number, lat: number) => ({ x: lng / D, y: -lat / D });

const TERRAIN_COLOR: Record<TerrainCode, string> = {
  '.': '#1b242d',
  F: '#1c3026',
  U: '#2a2f37',
  '~': '#1b3a55',
  '=': '#4b4f55',
  '^': '#3d3226',
  W: '#142d47',
  M: '#20302b',
  H: '#2c3329',
};
const TERRAIN_HEIGHT: Record<TerrainCode, number> = { '.': 0, F: 45, U: 70, '~': 0, '=': 10, '^': 380, W: 0, M: 0, H: 170 };
const SIDE_COLOR = { BLUE: '#63a2e6', RED: '#e5675a', UNK: '#d6bd55' };
const LEVEL_COLOR = { CLEAR: '#52b984', DEGRADED: '#e0a83c', DENIED: '#e5675a' };

export function webglAvailable(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('map') === 'svg') return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function cellPolygon(c: number, r: number, inset = 0) {
  const [x0, y0] = toLngLat(c + inset, r + inset);
  const [x1, y1] = toLngLat(c + 1 - inset, r + 1 - inset);
  return [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
}

function circle(x: number, y: number, radius: number, n = 64): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return toLngLat(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
  });
}

function symbolSvg(m: MapMarker): string {
  const color = SIDE_COLOR[m.side];
  const dash = m.decoy ? 'stroke-dasharray="3 3"' : '';
  let shape: string;
  if (m.negative) {
    shape = `<circle cx="20" cy="15" r="11" fill="none" stroke="${SIDE_COLOR.UNK}" stroke-width="1.6" stroke-dasharray="3 2"/><line x1="12" y1="23" x2="28" y2="7" stroke="${SIDE_COLOR.UNK}" stroke-width="1.6"/>`;
  } else if (m.side === 'BLUE') {
    shape = `<rect x="3" y="4" width="34" height="22" rx="2" fill="#16273a" stroke="${color}" stroke-width="1.8" ${dash}/>`;
  } else if (m.side === 'RED') {
    shape = `<rect x="9.5" y="-0.5" width="21" height="21" transform="rotate(45 20 10) translate(0 3)" fill="#3a1d1b" stroke="${color}" stroke-width="1.8" ${dash}/>`;
  } else {
    shape = `<circle cx="20" cy="15" r="12" fill="#3a3418" stroke="${color}" stroke-width="1.8"/>`;
  }
  const glyph = m.negative ? '' : `<text x="20" y="18.5" text-anchor="middle" font-size="${m.glyph.length > 3 ? 8 : 9}" font-family="IBM Plex Mono, monospace" font-weight="500" fill="#ece6d8">${esc(m.glyph)}</text>`;
  const ring = m.conflict ? `<rect x="-2" y="-1" width="44" height="32" rx="5" fill="none" stroke="#e0a83c" stroke-width="2" stroke-dasharray="5 3"/>` : '';
  const own = m.own ? `<rect x="0" y="1" width="40" height="28" rx="3" fill="none" stroke="${color}" stroke-width="1.4"/>` : '';
  const cross = m.destroyed ? `<line x1="8" y1="3" x2="32" y2="27" stroke="#ece6d8" stroke-width="2"/><line x1="32" y1="3" x2="8" y2="27" stroke="#ece6d8" stroke-width="2"/>` : '';
  const bang = m.conflict ? `<circle cx="41" cy="2" r="6.5" fill="#e0a83c"/><text x="41" y="5.5" text-anchor="middle" font-size="10" font-weight="700" fill="#1a1306">!</text>` : '';
  return `<svg width="48" height="34" viewBox="-4 -5 50 37" aria-hidden="true">${ring}${own}${shape}${glyph}${cross}${bang}</svg>`;
}

function markerElement(m: MapMarker & { crowded?: boolean }): HTMLElement {
  const el = document.createElement('div');
  el.className = 'vg-marker';
  el.title = m.title ?? `${m.label ?? m.glyph}${m.sub ? ` · ${m.sub}` : ''}`;
  updateMarkerElement(el, m);
  return el;
}

function updateMarkerElement(el: HTMLElement, m: MapMarker & { crowded?: boolean }): void {
  const key = JSON.stringify([m.side, m.glyph, m.label, m.sub, m.own, m.decoy, m.negative, m.conflict, m.faded, m.destroyed, m.crowded]);
  el.classList.toggle('vg-crowded', !!m.crowded);
  el.title = m.title ?? `${m.label ?? m.glyph}${m.sub ? ` · ${m.sub}` : ''}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.style.opacity = m.faded ? '0.5' : '1';
  el.innerHTML = `${symbolSvg(m)}${m.label ? `<div class="vg-label">${esc(m.label)}</div>` : ''}${m.sub ? `<div class="vg-sub">${esc(m.sub)}</div>` : ''}`;
}

/** Same layout rule as the SVG map: markers sharing a cell sit side-by-side, never merged. */
function spread(markers: MapMarker[]): (MapMarker & { px: number; py: number; crowded?: boolean })[] {
  const groups = new Map<string, MapMarker[]>();
  for (const m of markers) {
    const k = `${Math.floor(m.x)},${Math.floor(m.y)}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const out: (MapMarker & { px: number; py: number; crowded?: boolean })[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push({ ...list[0]!, px: list[0]!.x, py: list[0]!.y });
      continue;
    }
    const cols = list.length <= 4 ? 2 : 3;
    const rows = Math.ceil(list.length / cols);
    list.forEach((m, i) => {
      out.push({ ...m, crowded: true, px: Math.floor(m.x) + ((i % cols) + 0.5) / cols, py: Math.floor(m.y) + (Math.floor(i / cols) + 0.5) / rows });
    });
  }
  return out;
}

export interface MapViewProps extends TacticalMapProps {
  /** Tween duration for unit movement (≈ one tick of wall time). */
  animMs?: number;
  /** Extra lines for the sector popup (e.g., what this role knows about that sector). */
  describeCell?: (cell: string) => string[];
  testId?: string;
}

function featureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

export function MapView(props: MapViewProps) {
  const [gl] = useState(webglAvailable);
  if (!gl) return <TacticalMap {...props} />;
  return <GlMap {...props} />;
}

function GlMap(props: MapViewProps) {
  const { terrain, markers, onCellClick, selectedCell, pickMode, animMs = 800 } = props;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRefs = useRef(new Map<string, { mk: maplibregl.Marker; from: [number, number]; to: [number, number]; t0: number }>());
  const [ready, setReady] = useState(false);
  const [is3d, setIs3d] = useState(false);
  const [focus, setFocus] = useState<{ col: number; row: number }>({ col: 3, row: 3 });
  const [announce, setAnnounce] = useState('');
  const propsRef = useRef(props);
  propsRef.current = props;
  const bounds = useMemo(() => new maplibregl.LngLatBounds(toLngLat(-0.6, 8.6), toLngLat(8.6, -0.6)), []);

  // ---- create the map once
  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b0f13' } }] },
      bounds,
      fitBoundsOptions: { padding: 24 },
      maxBounds: new maplibregl.LngLatBounds(toLngLat(-4, 12), toLngLat(12, -4)),
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: true,
      maxPitch: 70,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('load', () => {
      const cells: GeoJSON.Feature[] = [];
      terrain.forEach((row, r) =>
        [...row].forEach((code, c) => {
          const cell = cellFromIndex(c, r);
          cells.push({ type: 'Feature', id: r * 8 + c, properties: { cell, code, height: TERRAIN_HEIGHT[code as TerrainCode] ?? 0, color: TERRAIN_COLOR[code as TerrainCode] ?? '#1b242d' }, geometry: { type: 'Polygon', coordinates: cellPolygon(c, r) } });
        }),
      );
      map.addSource('terrain', { type: 'geojson', data: featureCollection(cells) });
      map.addLayer({ id: 'terrain-fill', type: 'fill', source: 'terrain', paint: { 'fill-color': ['get', 'color'] } });
      map.addLayer({ id: 'terrain-3d', type: 'fill-extrusion', source: 'terrain', layout: { visibility: 'none' }, filter: ['>', ['get', 'height'], 0], paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0.92 } });
      map.addLayer({ id: 'terrain-texture', type: 'line', source: 'terrain', filter: ['in', ['get', 'code'], ['literal', ['^', 'H']]], paint: { 'line-color': '#b89a6a', 'line-opacity': 0.25, 'line-width': 1, 'line-dasharray': [1, 2] } });
      const grid: GeoJSON.Feature[] = [];
      for (let i = 0; i <= 8; i++) {
        grid.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [toLngLat(i, 0), toLngLat(i, 8)] } });
        grid.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [toLngLat(0, i), toLngLat(8, i)] } });
      }
      map.addSource('grid', { type: 'geojson', data: featureCollection(grid) });
      map.addLayer({ id: 'grid', type: 'line', source: 'grid', paint: { 'line-color': '#ece6d8', 'line-opacity': 0.12, 'line-width': 1 } });
      for (const id of ['objectives', 'jammers', 'jam-inner', 'links', 'moves', 'select', 'hover', 'relays']) {
        map.addSource(id, { type: 'geojson', data: featureCollection([]) });
      }
      map.addLayer({ id: 'jam-inner', type: 'fill', source: 'jam-inner', paint: { 'fill-color': '#e5675a', 'fill-opacity': ['case', ['get', 'active'], 0.16, 0.05] } });
      map.addLayer({ id: 'jammers', type: 'line', source: 'jammers', paint: { 'line-color': '#e5675a', 'line-width': 1.6, 'line-dasharray': [3, 2], 'line-opacity': ['case', ['get', 'active'], 0.95, 0.35] } });
      map.addLayer({ id: 'objectives', type: 'line', source: 'objectives', paint: { 'line-color': '#e5a940', 'line-width': 2.2, 'line-dasharray': [3, 2] } });
      // dasharray can't be data-driven: one solid layer for CLEAR, one dashed for DEGRADED/DENIED
      map.addLayer({ id: 'links', type: 'line', source: 'links', filter: ['==', ['get', 'level'], 'CLEAR'], paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-opacity': 0.85 } });
      map.addLayer({ id: 'links-bad', type: 'line', source: 'links', filter: ['!=', ['get', 'level'], 'CLEAR'], paint: { 'line-color': ['get', 'color'], 'line-width': 2.4, 'line-opacity': 0.9, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'moves', type: 'line', source: 'moves', paint: { 'line-color': '#b5afa0', 'line-width': 1.4, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'relays', type: 'circle', source: 'relays', paint: { 'circle-radius': 6, 'circle-color': 'transparent', 'circle-stroke-color': '#52b984', 'circle-stroke-width': 2, 'circle-stroke-opacity': ['case', ['get', 'active'], 1, 0.4] } });
      map.addLayer({ id: 'hover', type: 'line', source: 'hover', paint: { 'line-color': '#ece6d8', 'line-width': 1.5, 'line-opacity': 0.55 } });
      map.addLayer({ id: 'select', type: 'line', source: 'select', paint: { 'line-color': '#e5a940', 'line-width': 3.5 } });
      // edge labels A–H / 1–8 as lightweight HTML markers (no glyph server needed)
      for (let i = 0; i < 8; i++) {
        const top = document.createElement('div');
        top.className = 'vg-axis';
        top.textContent = COL_LETTERS[i]!;
        new maplibregl.Marker({ element: top }).setLngLat(toLngLat(i + 0.5, -0.25)).addTo(map);
        const left = document.createElement('div');
        left.className = 'vg-axis';
        left.textContent = String(i + 1);
        new maplibregl.Marker({ element: left }).setLngLat(toLngLat(-0.25, i + 0.5)).addTo(map);
      }
      setReady(true);
    });
    map.on('mousemove', (e) => {
      const p = fromLngLat(e.lngLat.lng, e.lngLat.lat);
      const c = Math.floor(p.x);
      const r = Math.floor(p.y);
      const src = map.getSource('hover') as GeoJSONSource | undefined;
      if (!src) return;
      src.setData(c >= 0 && c < 8 && r >= 0 && r < 8 ? featureCollection([{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: cellPolygon(c, r) } }]) : featureCollection([]));
      map.getCanvas().style.cursor = c >= 0 && c < 8 && r >= 0 && r < 8 ? (propsRef.current.pickMode ? 'crosshair' : 'pointer') : '';
    });
    map.on('click', (e) => {
      const p = fromLngLat(e.lngLat.lng, e.lngLat.lat);
      const c = Math.floor(p.x);
      const r = Math.floor(p.y);
      if (c < 0 || c > 7 || r < 0 || r > 7) return;
      const cell = cellFromIndex(c, r);
      setFocus({ col: c, row: r });
      showPopup(map, cell);
      propsRef.current.onCellClick?.(cell);
    });
    // Test/automation hook: screen point of a sector centre (used by Playwright to click for real).
    (box.current as HTMLElement & { __vgCellPoint?: (cell: string) => { x: number; y: number } }).__vgCellPoint = (cell: string) => {
      const ctr = cellCentre(cell);
      const pt = map.project(toLngLat(ctr.x, ctr.y) as LngLatLike);
      const rect = map.getCanvas().getBoundingClientRect();
      return { x: rect.left + pt.x, y: rect.top + pt.y };
    };
    const refs = markerRefs.current;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      refs.forEach(({ mk }) => mk.remove());
      refs.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showPopup = (map: MlMap, cell: string) => {
    const p = propsRef.current;
    const { col, row } = { col: COL_LETTERS.indexOf(cell[0]!), row: Number(cell[1]) - 1 };
    const code = (p.terrain[row]?.[col] ?? '.') as TerrainCode;
    const here = p.markers.filter((m) => Math.floor(m.x) === col && Math.floor(m.y) === row);
    const obj = p.objectives?.filter((o) => o.cell === cell) ?? [];
    const feats = p.features?.filter((f) => f.cell === cell) ?? [];
    const extra = p.describeCell?.(cell) ?? [];
    const lines = [
      ...obj.map((o) => `<div class="vg-pop-obj">OBJ · ${esc(o.text)}</div>`),
      ...feats.map((f) => `<div>${esc(f.label)}${f.intact === false ? ' — <b class="vg-bad">DESTROYED</b>' : ''}</div>`),
      ...here.map((m) => `<div><span class="vg-dot" style="background:${SIDE_COLOR[m.side]}"></span>${esc(m.label ?? m.glyph)}${m.sub ? ` <span class="vg-mut">· ${esc(m.sub)}</span>` : ''}${m.conflict ? ' <b class="vg-warn">⚠ conflict</b>' : ''}</div>`),
      ...extra.map((x) => `<div class="vg-mut">${esc(x)}</div>`),
    ];
    if (lines.length === 0) lines.push('<div class="vg-mut">Nothing reported in this sector.</div>');
    const pick = p.pickMode === 'target' ? '<div class="vg-pop-hint">Set as decision target</div>' : p.pickMode === 'place' ? '<div class="vg-pop-hint">Jammer placement…</div>' : '';
    const ctr = cellCentre(cell);
    new maplibregl.Popup({ closeButton: true, maxWidth: '260px', className: 'vg-popup', offset: 14 })
      .setLngLat(toLngLat(ctr.x, ctr.y))
      .setHTML(`<div class="vg-pop-h">${cell} · ${TERRAIN_CODES[code].toLowerCase()}</div>${lines.join('')}${pick}`)
      .addTo(map);
  };

  // ---- data layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const set = (id: string, f: GeoJSON.Feature[]) => (map.getSource(id) as GeoJSONSource).setData(featureCollection(f));
    set('objectives', (props.objectives ?? []).map((o) => {
      const p = cellCentre(o.cell);
      return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: cellPolygon(Math.floor(p.x), Math.floor(p.y), 0.07) } };
    }));
    set('jammers', (props.jammers ?? []).map((j) => ({ type: 'Feature', properties: { active: j.active }, geometry: { type: 'LineString', coordinates: circle(j.x, j.y, j.radius) } })));
    set('jam-inner', (props.jammers ?? []).filter((j) => !j.estimate).map((j) => ({ type: 'Feature', properties: { active: j.active }, geometry: { type: 'Polygon', coordinates: [circle(j.x, j.y, j.radius / 2)] } })));
    set('links', (props.links ?? []).map((l) => ({ type: 'Feature', properties: { level: l.level, color: LEVEL_COLOR[l.level] }, geometry: { type: 'LineString', coordinates: [toLngLat(l.x1, l.y1), toLngLat(l.x2, l.y2)] } })));
    set('moves', markers.filter((m) => m.destination).map((m) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [toLngLat(m.x, m.y), toLngLat(m.destination!.x, m.destination!.y)] } })));
    set('relays', (props.relays ?? []).map((r) => ({ type: 'Feature', properties: { active: r.active }, geometry: { type: 'Point', coordinates: toLngLat(r.x, r.y) } })));
  }, [ready, props.objectives, props.jammers, props.links, props.relays, markers]);

  // selection / keyboard focus outline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const sel = selectedCell ? cellCentre(selectedCell) : null;
    (map.getSource('select') as GeoJSONSource).setData(featureCollection(sel ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: cellPolygon(Math.floor(sel.x), Math.floor(sel.y)) } }] : []));
  }, [ready, selectedCell]);

  // ---- markers with tweening
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const now = performance.now();
    const laid = spread(markers);
    const seen = new Set<string>();
    for (const m of laid) {
      seen.add(m.id);
      const to = toLngLat(m.px, m.py);
      const cur = markerRefs.current.get(m.id);
      if (!cur) {
        const el = markerElement(m);
        const mk = new maplibregl.Marker({ element: el }).setLngLat(to).addTo(map);
        markerRefs.current.set(m.id, { mk, from: to, to, t0: now });
      } else {
        updateMarkerElement(cur.mk.getElement(), m);
        const ll = cur.mk.getLngLat();
        if (ll.lng !== to[0] || ll.lat !== to[1]) {
          cur.from = [ll.lng, ll.lat];
          cur.to = to;
          cur.t0 = now;
        }
      }
    }
    for (const [id, v] of markerRefs.current) {
      if (!seen.has(id)) {
        v.mk.remove();
        markerRefs.current.delete(id);
      }
    }
    let raf = 0;
    const step = () => {
      const t = performance.now();
      let active = false;
      for (const v of markerRefs.current.values()) {
        const f = Math.min(1, (t - v.t0) / animMs);
        if (f < 1) active = true;
        const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
        v.mk.setLngLat([v.from[0] + (v.to[0] - v.from[0]) * e, v.from[1] + (v.to[1] - v.from[1]) * e]);
      }
      if (active) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ready, markers, animMs]);

  const toggle3d = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3d;
    setIs3d(next);
    map.setLayoutProperty('terrain-3d', 'visibility', next ? 'visible' : 'none');
    map.easeTo({ pitch: next ? 55 : 0, bearing: next ? -18 : 0, duration: 700 });
  };
  const resetView = () => {
    mapRef.current?.fitBounds(bounds, { padding: 24, pitch: is3d ? 55 : 0, bearing: is3d ? -18 : 0, duration: 500 });
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const mv = d[e.key];
    if (mv) {
      e.preventDefault();
      const next = { col: Math.min(7, Math.max(0, focus.col + mv[0])), row: Math.min(7, Math.max(0, focus.row + mv[1])) };
      setFocus(next);
      const cell = cellFromIndex(next.col, next.row);
      const code = (terrain[next.row]?.[next.col] ?? '.') as TerrainCode;
      setAnnounce(`${cell} ${TERRAIN_CODES[code].toLowerCase()}`);
      const map = mapRef.current;
      (map?.getSource('hover') as GeoJSONSource | undefined)?.setData(featureCollection([{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: cellPolygon(next.col, next.row) } }]));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const cell = cellFromIndex(focus.col, focus.row);
      if (mapRef.current) showPopup(mapRef.current, cell);
      onCellClick?.(cell);
    }
  };

  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-md', props.className)} data-testid={props.testId ?? 'tactical-map'}>
      <div
        ref={box}
        className="vg-map h-full w-full"
        tabIndex={0}
        role="application"
        aria-label={`${props.ariaLabel} Arrow keys move between sectors, Enter selects.`}
        aria-roledescription="tactical map"
        onKeyDown={onKey}
        data-gl="maplibre"
      />
      <p className="sr-only" aria-live="polite">{announce}</p>
      <div className="absolute left-2 top-2 flex gap-1">
        <button type="button" onClick={toggle3d} aria-pressed={is3d} className={cn('flex items-center gap-1 rounded border px-2 py-1 text-[11px]', is3d ? 'border-accent bg-accent/20 text-ink' : 'border-line bg-panel/90 text-muted hover:text-ink')}>
          {is3d ? <Box size={12} /> : <MapIcon size={12} />} {is3d ? '3D sand table' : '2D'}
        </button>
        <button type="button" onClick={resetView} className="flex items-center gap-1 rounded border border-line bg-panel/90 px-2 py-1 text-[11px] text-muted hover:text-ink" aria-label="Reset map view">
          <RotateCcw size={12} /> reset
        </button>
        {pickMode && (
          <span className="flex items-center gap-1 rounded border border-accent/60 bg-panel/90 px-2 py-1 text-[11px] text-accent">
            <Crosshair size={12} /> click a sector
          </span>
        )}
      </div>
    </div>
  );
}
