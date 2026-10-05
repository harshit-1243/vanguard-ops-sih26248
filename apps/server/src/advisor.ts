import { formatT, vecToCell, type DsCommand, type NarrativeBlock, type RoleId } from '@vanguard/shared';
import { roleUnit, unitPos, verificationFor } from '@vanguard/sim';
import type { LlmProvider } from './llm';
import type { LiveSession } from './session';

/**
 * AI inject advisor (Smart Automation). Deterministic rules read the live ground truth and the
 * trainees' behaviour so far and propose the next friction that targets a training objective.
 * An LLM (when configured) only adds a short DS briefing — suggestions never depend on it.
 */
export interface AdvisorSuggestion {
  id: string;
  title: string;
  objective: string;
  why: string;
  command: DsCommand;
}

export interface AdvisorResponse {
  tMs: number;
  suggestions: AdvisorSuggestion[];
  briefing: NarrativeBlock | null;
}

export function adviseRules(session: LiveSession): AdvisorSuggestion[] {
  const ctx = session.sim.ctx;
  const s = ctx.s;
  const t = s.tMs;
  const roles = s.enabledRoles;
  const callsign = (r: RoleId) => ctx.roleSpec[r]!.callsign;
  const fired = (kind: string) => s.injects.some((i) => i.spec.type === kind) || s.cyber.some((c) => c.spec.kind === kind);
  const out: AdvisorSuggestion[] = [];

  // 1. Mission command: nobody has been cut off yet.
  if (!roles.some((r) => s.roles[r]!.cutOffSpans.length > 0)) {
    const target = (['PL_B', 'PL_A', 'EW', 'ALO', 'NLO'] as RoleId[]).find((r) => roles.includes(r));
    if (target) {
      const cell = vecToCell(unitPos(roleUnit(ctx, target), t));
      out.push({
        id: 'mission-command',
        title: `Jam ${callsign(target)} (VHF + HF) at ${cell}`,
        objective: 'Mission command — acting on intent when cut off',
        why: `No role has been isolated yet. Cutting ${callsign(target)} off forces a decision on the commander's intent alone.`,
        command: { type: 'PLACE_JAMMER', jammer: { cell, radius: 2, bands: ['VHF', 'HF'], power: 1, active: true, label: 'Advisor: isolation test' } },
      });
    }
  }

  // 2. Verification behaviour: someone acted on contested intel without flagging / verifying.
  const careless = s.decisions.filter((d) => {
    const v = verificationFor(ctx, d);
    return v.contested && !v.verified;
  });
  if (careless.length > 0) {
    const d = careless[careless.length - 1]!;
    const obj = ctx.sc.intent.objectiveCells[0]!;
    out.push({
      id: 'verification',
      title: `Contradictory reports on ${obj} to ${d.callsign}`,
      objective: 'Verification before action',
      why: `${d.callsign} acted at ${formatT(d.tMs)} on contested intel without flagging or verifying it. Present a fresh contradiction at the objective and watch whether they check first.`,
      command: { type: 'FIRE_INJECT', inject: { type: 'CONFLICT', channels: ['CMD_NET', 'ISR_DATALINK'], roles: [d.role], durationS: 120, params: { targetCell: obj }, label: 'Advisor: verification test' } },
    });
  }

  // 3. PACE discipline: a role has never switched off its primary net.
  const lazy = roles.find((r) => {
    const rs = s.roles[r]!;
    return r !== 'CDR' && rs.paceSwitches.length === 0 && !rs.cutOff && ctx.roleSpec[r]!.pace[0] === rs.activeChannel;
  });
  if (lazy) {
    const ch = s.roles[lazy]!.activeChannel;
    out.push({
      id: 'pace',
      title: `Drop ${callsign(lazy)}'s primary net (${ch}) for 2 min`,
      objective: 'PACE discipline — switching to the alternate',
      why: `${callsign(lazy)} has not exercised their PACE plan. A visible dropout on ${ch} tests how fast they move to the alternate.`,
      command: { type: 'FIRE_INJECT', inject: { type: 'DROPOUT', channels: [ch], roles: [lazy], durationS: 120, params: {}, label: 'Advisor: PACE test' } },
    });
  }

  // 4. Situational awareness: no probe for a while.
  const lastProbe = s.probes.at(-1)?.startedAtMs ?? -Infinity;
  if (t >= 300_000 && t - lastProbe >= 480_000 && session.phase !== 'PROBE') {
    out.push({
      id: 'sa-probe',
      title: 'Freeze and run an SA probe',
      objective: 'Measure situational awareness and team divergence',
      why: s.probes.length === 0 ? 'No SAGAT probe has been run yet — establish a baseline now that friction has built up.' : `Last probe was at ${formatT(lastProbe)} — measure how the pictures have drifted since.`,
      command: { type: 'START_PROBE' },
    });
  }

  // 5. Navigation under GPS spoofing: a platoon is on the move.
  if (!fired('GPS_SPOOF')) {
    const mover = roles.find((r) => r !== 'CDR' && session.sim.state.units.find((u) => u.id === s.roles[r]!.unitId)!.orderedCell !== null);
    if (mover) {
      out.push({
        id: 'gps',
        title: `GPS-spoof ${callsign(mover)} while manoeuvring`,
        objective: 'Navigation discipline and cross-checking own position',
        why: `${callsign(mover)} is moving. A 1.5 km GPS drift will show whether they cross-check their position before reporting or calling fire.`,
        command: { type: 'TRIGGER_CYBER', cyber: { kind: 'GPS_SPOOF', role: mover, durationS: 300, driftCells: 1.5 } },
      });
    }
  }

  // 6. Dependence on digital C2.
  const digital = (['SATCOM', 'ISR_DATALINK', 'GROUND_SENSOR'] as const).reduce((n, c) => n + (s.stats.channels[c]?.delivered ?? 0), 0);
  const radio = (['CMD_NET', 'PL_NET_A', 'PL_NET_B', 'HF_NET'] as const).reduce((n, c) => n + (s.stats.channels[c]?.delivered ?? 0), 0);
  if (!fired('C2_OUTAGE') && digital > radio) {
    out.push({
      id: 'c2',
      title: 'C2 outage for 90 s',
      objective: 'Resilience when digital C2 fails',
      why: `The team is leaning on digital feeds (${digital} deliveries vs ${radio} by voice). A short outage tests whether they fall back to voice nets.`,
      command: { type: 'TRIGGER_CYBER', cyber: { kind: 'C2_OUTAGE', durationS: 90 } },
    });
  }

  // 7. Stale intel at the CP.
  if (!fired('STALE') && roles.includes('CDR')) {
    out.push({
      id: 'stale',
      title: 'Make the CP’s ISR feed 4 minutes stale',
      objective: 'Reading report age before acting',
      why: 'Stale imagery looks current unless the commander checks its age — a classic trap under degraded links.',
      command: { type: 'FIRE_INJECT', inject: { type: 'STALE', channels: ['ISR_DATALINK'], roles: ['CDR'], durationS: 240, params: { staleS: 240 }, label: 'Advisor: stale-intel test' } },
    });
  }
  return out.slice(0, 3);
}

export async function advise(session: LiveSession, llm: LlmProvider | null): Promise<AdvisorResponse> {
  const suggestions = adviseRules(session);
  let briefing: NarrativeBlock | null = null;
  if (llm && suggestions.length > 0) {
    const s = session.sim.state;
    const facts = {
      time: formatT(s.tMs),
      intent: s.intent.text,
      decisions: s.decisions.slice(-6).map((d) => ({ by: d.callsign, action: d.action, target: d.targetCell, outcome: d.adjudication.soundness, cutOff: d.cutOff })),
      cutOff: s.enabledRoles.filter((r) => s.roles[r]!.cutOff),
      suggestions: suggestions.map((x) => ({ title: x.title, objective: x.objective })),
    };
    try {
      const text = await llm.generate(
        'You advise the Directing Staff of a FICTIONAL, synthetic staff-college wargame. Use only the facts given. Plain text, at most 3 sentences, no real-world units or technical EW detail.',
        `Explain to the DS which of these suggested injects to fire next and why, given the exercise so far:\n${JSON.stringify(facts)}`,
      );
      briefing = { text: text.slice(0, 900), source: 'ai', provider: llm.name };
    } catch {
      briefing = null;
    }
  }
  return { tMs: session.sim.state.tMs, suggestions, briefing };
}
