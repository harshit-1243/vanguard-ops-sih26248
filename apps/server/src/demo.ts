import type { DecisionPayload, RoleId, TraineeCommand } from '@vanguard/shared';
import type { SessionManager } from './manager';
import type { LiveSession } from './session';

/** Scripted, fully synthetic demo run of Iron Bridge so the AAR can be shown instantly. */
export const DEMO_PLAYERS: Record<RoleId, string> = {
  CDR: 'ARJUN',
  PL_A: 'MEERA',
  PL_B: 'KABIR',
  ALO: 'ZARA',
  EW: 'VIKRAM',
  NLO: 'ISHAAN',
};

type Step =
  | { at: number; role: RoleId; cmd: TraineeCommand }
  | { at: number; ds: 'PROBE'; answers: Partial<Record<RoleId, 'truth' | 'mixed' | 'wrong'>> };

const decide = (d: Partial<DecisionPayload> & Pick<DecisionPayload, 'action'>): TraineeCommand => ({
  type: 'MAKE_DECISION',
  decision: { confidence: 60, rationale: 'Acting on the picture available now', basedOn: [], intentSelf: 'YES', ...d },
});

const SCRIPT: Step[] = [
  { at: 50, role: 'PL_A', cmd: { type: 'SEND_MESSAGE', channel: 'CMD_NET', to: ['CDR'], text: 'KESTREL 1 in position B3, moving on axis WEST when ordered.' } },
  { at: 90, role: 'ALO', cmd: decide({ action: 'REQUEST_RECON', targetCell: 'E6', confidence: 75, rationale: 'Retask KITE-3 over the bridgehead to find the real armour.' }) },
  { at: 140, role: 'PL_A', cmd: decide({ action: 'ADVANCE', targetCell: 'C4', confidence: 70, rationale: 'Close on the bridge from the west while the D6 picture is unclear.' }) },
  { at: 200, role: 'CDR', cmd: { type: 'UPDATE_INTENT', text: 'Seize IRON BRIDGE intact by T+20. KESTREL 1 west, KESTREL 2 east. D6 armour may be decoys — confirm before committing air.' } },
  { at: 250, role: 'CDR', cmd: { type: 'SEND_MESSAGE', channel: 'CMD_NET', to: ['PL_B'], text: 'KESTREL 2, move to F4 and observe the bridge. Report.' } },
  { at: 330, ds: 'PROBE', answers: { CDR: 'mixed', PL_A: 'truth', PL_B: 'mixed', ALO: 'truth', EW: 'wrong' } },
  { at: 390, role: 'PL_B', cmd: decide({ action: 'ADVANCE', targetCell: 'F4', confidence: 55, rationale: 'Comms down with KESTREL 6. Intent is to seize the bridge, so I close on F4.', intentSelf: 'YES' }) },
  { at: 410, role: 'EW', cmd: { type: 'FREQ_HOP', channel: 'CMD_NET' } },
  { at: 430, role: 'EW', cmd: decide({ action: 'RELAY', targetCell: 'F3', confidence: 50, rationale: 'Push the rebro east to try and reach KESTREL 2 through the jamming.' }) },
  { at: 500, role: 'CDR', cmd: decide({ action: 'CALL_AIR', targetCell: 'D6', confidence: 80, rationale: 'UAV shows five armour at D6 threatening the bridge — strike them.' }) },
  { at: 540, role: 'ALO', cmd: decide({ action: 'CALL_AIR', targetCell: 'E6', confidence: 70, rationale: 'Request CAS on the bridge guard at E6; air available from T+15.' }) },
  { at: 600, role: 'PL_A', cmd: decide({ action: 'ADVANCE', targetCell: 'E5', confidence: 85, rationale: 'UGS says no vehicles in D6; bridge looks lightly held. Seize it.' }) },
  { at: 640, role: 'CDR', cmd: { type: 'SWITCH_PACE', channel: 'SATCOM' } },
  { at: 700, role: 'PL_B', cmd: decide({ action: 'HOLD', confidence: 40, rationale: 'Still cut off; holding F4 to overwatch the bridge for KESTREL 1.', intentSelf: 'UNSURE' }) },
  { at: 800, role: 'CDR', cmd: decide({ action: 'SWITCH_CHANNEL', channel: 'HF_NET', confidence: 65, rationale: 'C2 outage has taken SATCOM down; HF is our contingency.' }) },
  { at: 900, ds: 'PROBE', answers: { CDR: 'truth', PL_A: 'mixed', PL_B: 'wrong', ALO: 'truth', EW: 'mixed' } },
  { at: 1000, role: 'PL_B', cmd: decide({ action: 'ADVANCE', targetCell: 'E6', confidence: 75, rationale: 'Jammer off air, KESTREL 1 on the bridge — establish the bridgehead at E6.' }) },
  { at: 1100, role: 'CDR', cmd: { type: 'SEND_MESSAGE', channel: 'HF_NET', to: ['PL_A', 'PL_B'], text: 'Well done. Consolidate on E5/E6, report strength.' } },
];

function answer(session: LiveSession, role: RoleId, quality: 'truth' | 'mixed' | 'wrong'): Record<string, string> {
  const probe = session.sim.state.probes.find((p) => p.endedAtMs === null);
  const qs = probe?.questions[role] ?? [];
  const out: Record<string, string> = {};
  qs.forEach((q, i) => {
    const wrong = quality === 'wrong' || (quality === 'mixed' && i % 2 === 1);
    if (!wrong) out[q.id] = q.truth;
    else if (q.input === 'number') out[q.id] = String(Number(q.truth) + 4);
    else if (q.input === 'cell') out[q.id] = q.truth === 'A1' ? 'H8' : 'A1';
    else out[q.id] = q.options.find((o) => o !== q.truth) ?? 'UNKNOWN';
  });
  return out;
}

export async function seedDemo(
  manager: SessionManager,
  endAtS = 1260,
): Promise<{ code: string; pin: string; instructorToken: string; skipped: string[] }> {
  const skipped: string[] = [];
  const roles: RoleId[] = ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW'];
  const { session, pin, instructorToken } = await manager.create('iron-bridge', undefined, roles);
  for (const r of roles) await session.join(r, DEMO_PLAYERS[r]);
  session.dsCommand({ type: 'START' });
  session.stopClock();
  const run = (toS: number) => {
    while (session.phase === 'RUNNING' && session.sim.state.tMs < toS * 1000) session.sim.step();
  };
  for (const step of SCRIPT) {
    run(step.at);
    if ('ds' in step) {
      session.dsCommand({ type: 'START_PROBE' });
      for (const [role, q] of Object.entries(step.answers) as [RoleId, 'truth' | 'mixed' | 'wrong'][]) {
        const probe = session.sim.state.probes.find((p) => p.endedAtMs === null)!;
        session.traineeCommand(role, { type: 'ANSWER_PROBE', probeId: probe.id, answers: answer(session, role, q) });
      }
      session.dsCommand({ type: 'END_PROBE' });
    } else {
      const cmd = step.cmd;
      if (cmd.type === 'MAKE_DECISION') {
        // Cite the freshest reports about the target sector, else the latest contacts.
        const intel = session.sim.state.roles[step.role]!.intel;
        const about = intel.filter((i) => i.cell === cmd.decision.targetCell && i.kind !== 'POSREP');
        const contacts = intel.filter((i) => i.kind === 'CONTACT' || i.kind === 'NEGATIVE' || i.kind === 'RECON');
        cmd.decision.basedOn = (about.length ? about : contacts).slice(-2).map((i) => i.id);
      }
      const r = session.traineeCommand(step.role, cmd);
      // Some scripted actions may be impossible under degradation (that is realistic) — record and move on.
      if (!r.ok) skipped.push(`T+${step.at}s ${step.role} ${cmd.type}: ${r.error}`);
    }
  }
  run(endAtS);
  session.dsCommand({ type: 'END' });
  await session.flush();
  return { code: session.code, pin, instructorToken, skipped };
}
