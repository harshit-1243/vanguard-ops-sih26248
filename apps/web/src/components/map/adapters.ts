import {
  STALE_AFTER_MS,
  cellCentre,
  formatAge,
  type InstructorState,
  type PerceivedPicture,
  type UnitType,
} from '@vanguard/shared';
import type { MapJammer, MapLink, MapMarker } from './TacticalMap';

const GLYPH: Partial<Record<UnitType, string>> = {
  ARMOUR: 'ARM',
  MECH: 'MECH',
  INFANTRY: 'INF',
  RECCE: 'REC',
  HQ: 'HQ',
  ENGINEER: 'ENG',
  EW_DET: 'EW',
  TACP: 'TAC',
  SHIP: 'SHIP',
  CONVOY: 'CVY',
  ARTILLERY: 'ART',
  UAV: 'UAV',
  AIR: 'AIR',
  DECOY: 'DCY?',
  UNKNOWN: '?',
};
export const glyph = (t: string | null | undefined): string => (t ? (GLYPH[t as UnitType] ?? t.slice(0, 4)) : '?');

const shortSource = (s: string) => s.replace(/\(.*?\)/g, '').replace(/\s+via\s+/i, '→').trim().slice(0, 14);

/** Trainee (perceived) picture → map layers. Only uses what the role knows. */
export function perceivedLayers(p: PerceivedPicture): { markers: MapMarker[]; jammers: MapJammer[] } {
  const markers: MapMarker[] = [];
  const own = p.ownUnit;
  markers.push({
    id: 'own',
    side: 'BLUE',
    x: own.pos.x,
    y: own.pos.y,
    glyph: glyph(own.type),
    label: own.callsign,
    sub: `${own.strengthPct}%${own.actingRelay ? ' · RELAY' : ''}`,
    own: true,
    destroyed: own.status === 'DESTROYED',
    destination: own.destination ? cellCentre(own.destination) : null,
    title: `You (${own.callsign}) — GPS position ${own.cell}`,
  });
  for (const f of p.friendlies) {
    if (!f.pos) continue;
    const age = p.tMs - f.observedAtMs;
    markers.push({
      id: `f-${f.role}`,
      side: 'BLUE',
      x: f.pos.x,
      y: f.pos.y,
      glyph: 'FR',
      label: f.callsign,
      sub: `POSREP ${formatAge(age)}`,
      faded: age > STALE_AFTER_MS,
      title: `${f.callsign} reported at ${f.cell} ${formatAge(age)} ago (${f.sourceLabel})`,
    });
  }
  for (const c of p.contacts) {
    const age = p.tMs - c.observedAtMs;
    const pos = cellCentre(c.cell);
    const neg = c.kind === 'NEGATIVE' || (c.kind === 'RECON' && c.count === 0);
    markers.push({
      id: c.itemId,
      side: neg ? 'UNK' : c.unitType === 'DECOY' || c.unitType === 'UNKNOWN' ? 'UNK' : 'RED',
      x: pos.x,
      y: pos.y,
      glyph: glyph(c.unitType),
      negative: neg,
      label: neg ? 'NO CONTACT' : `${c.count ?? '?'}× ${glyph(c.unitType)}${c.cellUncertain ? ' (grid?)' : ''}`,
      sub: `${shortSource(c.sourceLabel)} · ${formatAge(age)}`,
      conflict: c.inConflict,
      faded: age > STALE_AFTER_MS,
      title: `${c.kind} ${c.cell}: ${c.count ?? '?'}× ${c.unitType ?? 'unknown'} — ${c.sourceLabel}, ${formatAge(age)} old, confidence ${c.confidence}${c.inConflict ? ' — IN CONFLICT' : ''}`,
    });
  }
  const jammers: MapJammer[] = (p.spectrum ?? []).map((s) => {
    const c = cellCentre(s.approxCell);
    return { id: s.label, x: c.x, y: c.y, radius: 1, active: true, label: `${s.label}? ${s.bands.join('/')}`, estimate: true };
  });
  return { markers, jammers };
}

/** DS ground-truth view → map layers. */
export function truthLayers(t: InstructorState): { markers: MapMarker[]; jammers: MapJammer[]; links: MapLink[]; relays: { id: string; x: number; y: number; label: string; active: boolean }[] } {
  const enabled = new Set(t.roles.filter((r) => r.enabled).map((r) => r.role));
  // Units of roles not in play (e.g. optional NLO) are hidden to keep the god view uncluttered.
  const markers: MapMarker[] = t.units.filter((u) => !u.ownerRole || enabled.has(u.ownerRole)).map((u) => ({
    id: u.id,
    side: u.side,
    x: u.pos.x,
    y: u.pos.y,
    glyph: glyph(u.type),
    label: u.decoy ? `DECOY ${u.count}×` : u.callsign,
    sub: `${u.strengthPct}%${u.ownerRole ? ` · ${u.ownerRole}` : ''}`,
    decoy: u.decoy,
    destroyed: u.status === 'DESTROYED',
    faded: u.status !== 'ACTIVE',
    destination: u.destination ? cellCentre(u.destination) : null,
    title: `${u.callsign} (${u.type}${u.decoy ? ', DECOY' : ''}) ${u.cell} · ${u.strengthPct}% · ${u.status}`,
  }));
  const jammers: MapJammer[] = t.jammers.map((j) => {
    const c = cellCentre(j.cell);
    return { id: j.id, x: c.x, y: c.y, radius: j.effectiveRadius, active: j.active, label: `${j.label} [${j.bands.join('/')}]` };
  });
  const unitOf = (role: string) => t.units.find((u) => u.ownerRole === role);
  const links: MapLink[] = [];
  const seen = new Set<string>();
  for (const l of t.links) {
    if (l.b === 'HHQ') continue;
    const a = unitOf(l.a);
    const b = unitOf(l.b);
    if (!a || !b) continue;
    // One line per role pair: worst link among PACE channels shown by best level (cut-off = all denied).
    const key = `${l.a}-${l.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pair = t.links.filter((x) => x.a === l.a && x.b === l.b);
    const best = pair.some((x) => x.level === 'CLEAR') ? 'CLEAR' : pair.some((x) => x.level === 'DEGRADED') ? 'DEGRADED' : 'DENIED';
    links.push({
      id: key,
      x1: a.pos.x,
      y1: a.pos.y,
      x2: b.pos.x,
      y2: b.pos.y,
      level: best,
      title: pair.map((x) => `${x.channel}: ${x.level}${x.causes.length ? ` (${x.causes.join(', ')})` : ''}`).join('\n'),
    });
  }
  const relays = t.relays.map((r) => ({ id: r.id, x: r.pos.x, y: r.pos.y, label: r.label, active: r.active }));
  return { markers, jammers, links, relays };
}
