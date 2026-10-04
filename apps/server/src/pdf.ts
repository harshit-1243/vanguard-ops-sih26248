import PDFDocument from 'pdfkit';
import { formatAge, formatT, type AarReport, type DecisionRecord, type RoleId } from '@vanguard/shared';

/**
 * Server-side AAR PDF (US-AAR-8). Uses pdfkit's built-in Helvetica/Courier (offline, no font
 * files) and draws every chart as vector graphics.
 */

const C = {
  ink: '#111827',
  muted: '#6b7280',
  faint: '#9ca3af',
  line: '#d1d5db',
  panel: '#f3f4f6',
  accent: '#b7791f',
  blue: '#2563eb',
  red: '#c0392b',
  ok: '#2f855a',
  warn: '#b7791f',
  bad: '#c0392b',
};
const SOUND_COLOR = { SOUND: C.ok, RISKY: C.warn, UNSOUND: C.bad } as const;

/** Standard PDF fonts are WinAnsi: map the few non-Latin-1 symbols we use. */
export function pdfText(s: string): string {
  return s
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/ρ/g, 'rho')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/×/g, 'x')
    .replace(/[✓✔]/g, 'OK')
    .replace(/[✕✗✖]/g, 'X')
    .replace(/±/g, '+/-')
    .replace(/[^\t\n\r\x20-\x7e\xa0-\xff–—‘’“”•…]/g, '?');
}

type Doc = PDFKit.PDFDocument;
const M = 40;
const W = 595.28 - 2 * M;
const BOTTOM = 841.89 - 50;

function ensure(doc: Doc, h: number): void {
  if (doc.y + h > BOTTOM) doc.addPage();
}

function h1(doc: Doc, text: string): void {
  ensure(doc, 60);
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(15).fillColor(C.ink).text(pdfText(text), M, doc.y);
  const y = doc.y + 2;
  doc.moveTo(M, y).lineTo(M + W, y).lineWidth(1.2).strokeColor(C.accent).stroke();
  doc.moveDown(0.6);
}

function h2(doc: Doc, text: string): void {
  ensure(doc, 40);
  doc.moveDown(0.4).font('Helvetica-Bold').fontSize(11).fillColor(C.ink).text(pdfText(text), M, doc.y);
  doc.moveDown(0.25);
}

function para(doc: Doc, text: string, opts: { color?: string; size?: number; font?: string } = {}): void {
  doc
    .font(opts.font ?? 'Helvetica')
    .fontSize(opts.size ?? 9.5)
    .fillColor(opts.color ?? C.ink)
    .text(pdfText(text), M, doc.y, { width: W, lineGap: 1.5 });
}

function bullets(doc: Doc, items: string[], color = C.ink): void {
  if (items.length === 0) return para(doc, 'None identified.', { color: C.muted });
  for (const it of items) {
    ensure(doc, 20);
    doc.font('Helvetica').fontSize(9.5).fillColor(color).text(`•  ${pdfText(it)}`, M + 6, doc.y, { width: W - 6, lineGap: 1.5 });
  }
}

function table(doc: Doc, header: string[], rows: (string | number | null)[][], widths: number[], opts: { size?: number } = {}): void {
  const size = opts.size ?? 8;
  const pad = 3;
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = W / total;
  const ws = widths.map((w) => w * scale);
  const drawRow = (cells: (string | number | null)[], bold: boolean, fill?: string) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
    const texts = cells.map((c) => pdfText(c === null || c === undefined ? '—' : String(c)));
    const h = Math.max(...texts.map((t, i) => doc.heightOfString(t, { width: ws[i]! - 2 * pad }))) + 2 * pad;
    ensure(doc, h);
    const y = doc.y;
    if (fill) doc.rect(M, y, W, h).fill(fill);
    let x = M;
    texts.forEach((t, i) => {
      doc.fillColor(bold ? C.ink : C.ink).text(t, x + pad, y + pad, { width: ws[i]! - 2 * pad });
      x += ws[i]!;
    });
    doc.moveTo(M, y + h).lineTo(M + W, y + h).lineWidth(0.4).strokeColor(C.line).stroke();
    doc.y = y + h;
  };
  drawRow(header, true, C.panel);
  rows.forEach((r) => drawRow(r, false));
  doc.x = M;
  doc.moveDown(0.5);
}

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
const n2 = (n: number | null) => (n === null ? '—' : n.toFixed(2));

/** Swimlane timeline as vector graphics. */
function swimlanes(doc: Doc, aar: AarReport): void {
  const lanes: (RoleId | 'ALL')[] = ['ALL', ...aar.meta.roles.map((r) => r.role)];
  const laneH = 22;
  const labelW = 46;
  const h = lanes.length * laneH + 26;
  ensure(doc, h + 10);
  const top = doc.y;
  const x0 = M + labelW;
  const xw = W - labelW;
  const end = Math.max(aar.meta.endMs, 60_000);
  const X = (t: number) => x0 + (Math.min(t, end) / end) * xw;
  lanes.forEach((lane, i) => {
    const y = top + i * laneH;
    if (i % 2 === 0) doc.rect(x0, y, xw, laneH).fill('#f9fafb');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.muted).text(lane, M, y + 7, { width: labelW - 4 });
  });
  for (let m = 0; m <= end / 60_000; m += 5) {
    const x = X(m * 60_000);
    doc.moveTo(x, top).lineTo(x, top + lanes.length * laneH).lineWidth(0.3).strokeColor(C.line).stroke();
    doc.font('Helvetica').fontSize(6.5).fillColor(C.faint).text(`T+${m}`, x - 8, top + lanes.length * laneH + 3, { width: 30 });
  }
  for (const e of aar.q2.timeline) {
    const li = lanes.indexOf(e.lane);
    if (li < 0) continue;
    const y = top + li * laneH;
    if (e.kind === 'CUTOFF') {
      doc.rect(X(e.tMs), y + 3, Math.max(1.5, X(e.endMs ?? end) - X(e.tMs)), 4).fill(C.bad);
    } else if ((e.kind === 'INJECT' || e.kind === 'CYBER') && e.endMs) {
      doc.rect(X(e.tMs), y + (e.kind === 'CYBER' ? 15 : 9), Math.max(1.5, X(e.endMs) - X(e.tMs)), 3).fill(e.kind === 'CYBER' ? C.bad : C.warn);
    } else if (e.kind === 'DECISION') {
      const x = X(e.tMs);
      const cy = y + 13;
      doc.polygon([x, cy - 5], [x + 4, cy], [x, cy + 5], [x - 4, cy]).fill(SOUND_COLOR[e.soundness ?? 'RISKY']);
    } else if (e.kind === 'JAMMER' || e.kind === 'PROBE' || e.kind === 'FEATURE' || e.kind === 'STRIKE' || e.kind === 'ENGAGEMENT') {
      const x = X(e.tMs);
      doc.moveTo(x, y + 2).lineTo(x, y + laneH - 2).lineWidth(1).strokeColor(e.kind === 'PROBE' ? C.blue : e.kind === 'JAMMER' ? C.red : C.ink).stroke();
    } else if (e.kind === 'MSG_SENT' || e.kind === 'MSG_RECV' || e.kind === 'MSG_DROP') {
      const x = X(e.tMs);
      doc.circle(x, y + 19, 1.2).fill(e.kind === 'MSG_DROP' ? C.bad : C.faint);
    }
  }
  doc.y = top + h;
  doc.font('Helvetica').fontSize(7).fillColor(C.muted).text(
    'Legend: red bar = cut off · amber bar = inject · red thin bar = cyber · diamond = decision (green sound / amber risky / red unsound) · blue line = SA probe · red line = jammer · dots = messages (red = lost).',
    M, doc.y, { width: W },
  );
  doc.moveDown(0.6);
}

/** Horizontal bar chart (0..1 values). */
function bars(doc: Doc, title: string, rows: { label: string; value: number | null }[], color: string, invert = false): void {
  const rowH = 14;
  ensure(doc, rows.length * rowH + 24);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink).text(pdfText(title), M, doc.y);
  const top = doc.y + 4;
  const lw = 70;
  const bw = W / 2 - lw - 30;
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(r.label, M, y + 2, { width: lw });
    doc.rect(M + lw, y + 2, bw, 8).fill(C.panel);
    if (r.value !== null) doc.rect(M + lw, y + 2, Math.max(1, bw * Math.min(1, r.value)), 8).fill(color);
    doc.fillColor(C.ink).text(r.value === null ? '—' : invert ? r.value.toFixed(2) : `${Math.round(r.value * 100)}%`, M + lw + bw + 4, y + 2, { width: 40 });
  });
  doc.y = top + rows.length * rowH + 6;
  doc.x = M;
}

/** Circular node-link comms graph. */
function network(doc: Doc, aar: AarReport): void {
  const edges = aar.q3.comms.edges;
  const nodes = [...new Set([...aar.meta.roles.map((r) => r.role as string), ...edges.flatMap((e) => [e.from, e.to])])];
  const size = 210;
  ensure(doc, size + 30);
  const cx = M + W / 2;
  const cy = doc.y + size / 2 + 6;
  const R = size / 2 - 22;
  const pos = new Map(nodes.map((n, i) => [n, { x: cx + R * Math.cos((2 * Math.PI * i) / nodes.length - Math.PI / 2), y: cy + R * Math.sin((2 * Math.PI * i) / nodes.length - Math.PI / 2) }]));
  const maxSent = Math.max(1, ...edges.map((e) => e.sent));
  for (const e of edges) {
    const a = pos.get(e.from)!;
    const b = pos.get(e.to)!;
    const lossy = e.dropped / Math.max(1, e.sent);
    doc.moveTo(a.x, a.y).lineTo(b.x, b.y).lineWidth(0.6 + (3 * e.sent) / maxSent).strokeColor(lossy > 0.3 ? C.bad : lossy > 0 ? C.warn : C.ok).stroke();
    doc.font('Helvetica').fontSize(6.5).fillColor(C.ink).text(`${e.delivered}/${e.sent}`, (a.x * 0.35 + b.x * 0.65) - 10, (a.y * 0.35 + b.y * 0.65) - 4, { width: 30, align: 'center' });
  }
  for (const [n, p] of pos) {
    doc.circle(p.x, p.y, 14).fillAndStroke('#ffffff', C.blue);
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(C.blue).text(n, p.x - 14, p.y - 3, { width: 28, align: 'center' });
  }
  doc.y = cy + size / 2 + 4;
  doc.font('Helvetica').fontSize(7).fillColor(C.muted).text('Edge label = delivered/sent (player traffic). Green: no loss · amber: some loss · red: >30% lost. Width ~ volume.', M, doc.y, { width: W });
  doc.moveDown(0.5);
}

function decisionCard(doc: Doc, d: DecisionRecord, feedback?: { text: string; source: string }): void {
  const colW = (W - 12) / 2;
  const k = d.knowable;
  const knowLines = [
    `Believed position ${k.ownCell} · active ${k.activeChannel}${k.cutOff ? ' · CUT OFF' : ''}`,
    `Intent v${k.intentVersion}`,
    `Intel held: ${k.intel.length} items; open conflicts: ${k.openConflicts.length}; degraded nets: ${k.outages.map((o) => `${o.channel} ${o.level}`).join(', ') || 'none'}`,
    ...k.intel.filter((i) => d.basedOn.includes(i.id)).slice(0, 3).map((i) => `Cited ${i.id} (${formatAge(i.ageMs)} old, ${i.sourceLabel}): ${i.text}`),
    ...k.openConflicts.slice(0, 2).map((c) => `Conflict: ${c.reason}${c.flagged ? ' (flagged)' : ''}`),
    `Rationale: "${d.rationale}"`,
    `Confidence ${d.confidence}% · consistent with intent? ${d.intentSelf}`,
  ].map(pdfText);
  const t = d.truth;
  const truthLines = [
    `${d.adjudication.soundness} (rule ${d.adjudication.rule}): ${d.adjudication.reason}`,
    `True position ${t.ownCell} · strength ${t.ownStrength} · rho ${t.rho ?? '—'}`,
    `In target: ${t.hostilesInTarget.map((h) => `${h.count}x ${h.type}${h.decoy ? ' (DECOY)' : ''}`).join(', ') || 'no hostiles'}`,
    t.hostilesAdjacent.length ? `Adjacent: ${t.hostilesAdjacent.map((h) => `${h.count}x ${h.type}${h.decoy ? ' (DECOY)' : ''} ${h.cell}`).join(', ')}` : '',
    `Intent adherence score ${d.intentScore}`,
    ...d.effects.map((e) => `Effect: ${e}`),
  ].filter(Boolean).map(pdfText);
  doc.font('Helvetica').fontSize(7.5);
  const hk = knowLines.reduce((h, l) => h + doc.heightOfString(l, { width: colW - 10 }) + 1.5, 0);
  const ht = truthLines.reduce((h, l) => h + doc.heightOfString(l, { width: colW - 10 }) + 1.5, 0);
  const fbH = feedback ? doc.heightOfString(pdfText(feedback.text), { width: W - 12 }) + 14 : 0;
  const h = 22 + Math.max(hk, ht) + 18 + fbH;
  ensure(doc, h + 8);
  const y = doc.y;
  doc.rect(M, y, W, h).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.rect(M, y, 4, h).fill(SOUND_COLOR[d.adjudication.soundness]);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink).text(
    pdfText(`Decision ${d.id} · ${formatT(d.tMs)} · ${d.callsign} (${d.role}) · ${d.action}${d.targetCell ? ` ${d.targetCell}` : ''}${d.channel ? ` ${d.channel}` : ''}${d.cutOff ? ' · CUT OFF' : ''}`),
    M + 10, y + 6, { width: W - 20 },
  );
  const cy = y + 22;
  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.blue).text('AT DECISION TIME (KNOWABLE)', M + 10, cy);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.accent).text('GROUND TRUTH (REVEALED)', M + 10 + colW + 6, cy);
  let yy = cy + 11;
  doc.font('Helvetica').fontSize(7.5).fillColor(C.ink);
  for (const l of knowLines) {
    doc.text(l, M + 10, yy, { width: colW - 10 });
    yy = doc.y + 1.5;
  }
  yy = cy + 11;
  for (const l of truthLines) {
    doc.fillColor(C.ink).text(l, M + 10 + colW + 6, yy, { width: colW - 10 });
    yy = doc.y + 1.5;
  }
  if (feedback) {
    const fy = y + h - fbH - 4;
    doc.font('Helvetica-Bold').fontSize(7).fillColor(C.muted).text(feedback.source === 'ai' ? 'FEEDBACK — AI-GENERATED DRAFT' : 'FEEDBACK (TEMPLATE)', M + 10, fy);
    doc.font('Helvetica').fontSize(7.5).fillColor(C.ink).text(pdfText(feedback.text), M + 10, fy + 9, { width: W - 20 });
  }
  doc.y = y + h + 8;
  doc.x = M;
}

export function renderAarPdf(aar: AarReport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: M, bottom: 30, left: M, right: M },
    bufferPages: true,
    info: {
      Title: `AAR — ${aar.meta.scenarioTitle} (${aar.meta.sessionCode})`,
      Author: 'VANGUARD OPS',
      Subject: 'After-Action Review — training simulation, synthetic data',
      Keywords: 'AAR, SIH26248, synthetic',
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // Cover block
  doc.rect(0, 0, 595.28, 92).fill('#0d1217');
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#e5a940').text('VANGUARD OPS · AFTER-ACTION REVIEW', M, 26);
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#ffffff').text(pdfText(aar.meta.scenarioTitle), M, 40);
  doc.font('Helvetica').fontSize(9).fillColor('#c8d0d8').text(
    pdfText(`${aar.meta.theatre} · session ${aar.meta.sessionCode} · seed ${aar.meta.seed} · duration ${formatT(aar.meta.endMs)} · state ${aar.meta.stateHash}`),
    M, 66,
  );
  doc.y = 104;
  doc.rect(M, doc.y, W, 18).fill('#fdf3e1');
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.accent).text(pdfText(aar.disclaimer), M + 6, doc.y + 5, { width: W - 12 });
  doc.y += 26;

  h1(doc, 'Executive summary');
  para(doc, `Objective: ${aar.exec.objective}`);
  doc.moveDown(0.3);
  para(doc, `Outcome: ${aar.exec.outcome}`);
  h2(doc, 'Top sustains');
  bullets(doc, aar.exec.sustain, C.ok);
  h2(doc, 'Top improves');
  bullets(doc, aar.exec.improve, C.bad);

  h1(doc, '1. What was supposed to happen?');
  para(doc, `Situation: ${aar.q1.brief.situation}`);
  doc.moveDown(0.3);
  para(doc, `Mission: ${aar.q1.brief.mission}`);
  doc.moveDown(0.3);
  para(doc, `Commander's intent (${aar.q1.intent.priority}, deadline ${formatT(aar.q1.intent.deadlineS * 1000)}): ${aar.q1.intent.text}`);
  if (aar.q1.intent.finalVersion > 1) {
    doc.moveDown(0.3);
    para(doc, `Intent as refined (v${aar.q1.intent.finalVersion}): ${aar.q1.intent.finalText}`, { color: C.muted });
  }
  h2(doc, 'Master scenario events list (friction applied)');
  table(doc, ['Time', 'ID', 'Event', 'Effect', 'Status'], aar.q1.msel.map((m) => [formatT(m.atS * 1000), m.id, m.title, m.summary, m.status === 'FIRED' ? `fired ${formatT(m.firedAtMs!)}` : m.status]), [40, 34, 130, 190, 60], { size: 7 });

  h1(doc, '2. What actually happened?');
  para(doc, aar.q2.outcome.summary);
  doc.moveDown(0.3);
  table(doc, ['Objective', 'Cell', 'Held at end'], aar.q2.outcome.objectives.map((o) => [o.text, o.cell, o.held ? 'YES' : 'NO']), [260, 60, 80]);
  h2(doc, 'Swimlane timeline');
  swimlanes(doc, aar);

  h1(doc, '3. Why? — metrics');
  const t = aar.q3.team;
  table(doc, ['Team', 'Decisions', 'Sound / Risky / Unsound', 'Brier', 'Over-confidence', 'Verified contested', 'Intent when cut off', 'SA mean', 'SA divergence', 'Delivery'], [
    ['ALL', t.decisions, `${t.soundCounts.SOUND} / ${t.soundCounts.RISKY} / ${t.soundCounts.UNSOUND}`, n2(t.brier), n2(t.overconfidence), pct(t.verificationRate), pct(t.intentCutOff), pct(t.saMean), n2(t.divergenceMean), pct(t.deliveryRatio)],
  ], [34, 40, 66, 34, 50, 50, 50, 40, 46, 40], { size: 7 });
  table(doc, ['Role', 'Dec.', 'Latency mean/med (s)', 'No resp.', 'Verified', 'Brier', 'Intent (cut-off n)', 'Self-aware', 'SA', 'Msgs sent/deliv/drop', 'PACE sw.', 'Cut off (s)'], aar.q3.roleMetrics.map((r) => [
    `${r.role} ${r.callsign}`, r.decisions, `${n2(r.latency.meanS)} / ${n2(r.latency.medianS)}`, r.latency.noResponse,
    r.verification.contested ? `${r.verification.verified}/${r.verification.contested}` : '—', n2(r.calibration.brier),
    `${pct(r.intent.cutOff)} (${r.intent.cutOffN})`, pct(r.intent.selfAwareness), pct(r.sa.mean),
    `${r.comms.sent}/${r.comms.delivered}/${r.comms.dropped}`, r.comms.paceSwitches, r.cutOffTotalS,
  ]), [62, 26, 52, 28, 36, 30, 46, 36, 30, 52, 30, 36], { size: 6.8 });
  bars(doc, 'SA accuracy per role (SAGAT probes)', aar.q3.roleMetrics.map((r) => ({ label: r.callsign, value: r.sa.mean })), C.blue);
  bars(doc, 'Confidence calibration — Brier score (lower is better)', aar.q3.roleMetrics.map((r) => ({ label: r.callsign, value: r.calibration.brier })), C.accent, true);
  if (aar.q3.probes.length) {
    h2(doc, 'SA probes');
    table(doc, ['Probe', 'Time', ...aar.meta.roles.map((r) => r.role), 'Team divergence'], aar.q3.probes.map((p) => [
      `#${p.index + 1}`, formatT(p.startedAtMs), ...aar.meta.roles.map((r) => {
        const res = p.results.find((x) => x.role === r.role);
        return res?.submitted ? pct(res.accuracy) : '—';
      }), n2(p.divergence.team),
    ]), [30, 40, ...aar.meta.roles.map(() => 40), 60], { size: 7 });
  }
  h2(doc, 'Comms network');
  network(doc, aar);
  table(doc, ['Channel', 'Sent', 'Delivered', 'Dropped', 'Garbled', 'Links clear/degr/denied (end)'], aar.q3.comms.channels.filter((c) => c.sent > 0).map((c) => [c.channel, c.sent, c.delivered, c.dropped, c.corrupted, `${c.clearLinks}/${c.degradedLinks}/${c.deniedLinks}`]), [80, 40, 50, 50, 50, 120], { size: 7.5 });

  h1(doc, '3. Why? — decision cards (hindsight-safe)');
  para(doc, 'Each card shows first what the commander could know at the moment of decision, then the ground truth and adjudicated outcome. Judge the decision on the left column.', { color: C.muted, size: 8.5 });
  doc.moveDown(0.4);
  if (aar.q3.decisions.length === 0) para(doc, 'No decisions were recorded.', { color: C.muted });
  for (const d of aar.q3.decisions) decisionCard(doc, d, aar.q4.rationaleFeedback[d.id]);

  h1(doc, '4. What do we sustain / improve?');
  h2(doc, 'Sustain');
  bullets(doc, aar.q4.sustain, C.ok);
  h2(doc, 'Improve');
  bullets(doc, aar.q4.improve, C.bad);
  h2(doc, aar.q4.narrative.source === 'ai' ? `Narrative — AI-generated draft (${aar.q4.narrative.provider ?? 'LLM'}) — review before use` : 'Narrative (template draft)');
  para(doc, aar.q4.narrative.text, { size: 9 });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // footer sits below the content area — don't let pdfkit paginate
    doc.font('Helvetica').fontSize(7).fillColor(C.faint);
    doc.text(pdfText(`${aar.disclaimer}   ·   ${aar.meta.sessionCode}   ·   page ${i + 1} of ${range.count}`), M, 841.89 - 24, { width: W, align: 'center', lineBreak: false });
  }
  doc.end();
  return done;
}
