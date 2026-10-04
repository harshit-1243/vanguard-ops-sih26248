import { describe, expect, it } from 'vitest';
import { replay, sessionParams } from '../src';
import { Driver, FIXTURE } from './fixtures';

/** A scripted exercise with every kind of input. */
function scripted(seed: number): Driver {
  const d = new Driver(FIXTURE, seed).joinAll().start();
  d.run(45);
  d.emit('DS', { type: 'SPEED_SET', payload: { speed: 4 } });
  d.emit('DS', { type: 'JAMMER_PLACED', payload: { jammer: { id: 'J1', cell: 'C6', radius: 2, bands: ['VHF', 'HF'], power: 1, active: true } } });
  d.run(10);
  d.emit('PL_A', { type: 'MESSAGE_SENT', payload: { channel: 'CMD_NET', to: ['CDR', 'PL_B'], text: 'Contact D2, armour, wait out' } });
  d.emit('DS', { type: 'INJECT_FIRED', payload: { injectId: 'X1', inject: { type: 'CONFLICT', channels: ['ISR_DATALINK'], roles: [], durationS: 120, params: {} } } });
  d.run(40);
  d.emit('PL_B', { type: 'DECISION_MADE', payload: { action: 'ADVANCE', targetCell: 'D6', confidence: 60, rationale: 'Cut off, acting on intent to close on bridge', basedOn: [], intentSelf: 'YES' } });
  d.emit('DS', { type: 'CYBER_TRIGGERED', payload: { cyberId: 'C1', cyber: { kind: 'GPS_SPOOF', role: 'PL_A', durationS: 100, driftCells: 1.5 } } });
  d.run(30);
  d.emit('DS', { type: 'EXERCISE_PAUSED', payload: {} });
  d.emit('DS', { type: 'PROBE_STARTED', payload: { probeId: 'P1' } });
  d.emit('CDR', { type: 'PROBE_ANSWERED', payload: { probeId: 'P1', answers: {} } });
  d.emit('DS', { type: 'PROBE_ENDED', payload: { probeId: 'P1' } });
  d.emit('DS', { type: 'EXERCISE_RESUMED', payload: {} });
  d.run(200);
  d.emit('DS', { type: 'EXERCISE_ENDED', payload: {} });
  return d;
}

describe('determinism (same seed + log ⇒ identical state)', () => {
  it('replaying the log reproduces the live state hash exactly', () => {
    const live = scripted(99);
    const replayed = replay(FIXTURE, live.log);
    expect(replayed.hash()).toBe(live.sim.hash());
    expect(replayed.state.journal).toEqual(live.s.journal);
    expect(replayed.state.decisions).toEqual(live.s.decisions);
  });

  it('two live runs with the same seed are identical; different seeds diverge', () => {
    expect(scripted(5).sim.hash()).toBe(scripted(5).sim.hash());
    expect(scripted(5).sim.hash()).not.toBe(scripted(6).sim.hash());
  });

  it('replay can continue to a later time and reports ticks', () => {
    const d = new Driver(FIXTURE, 3).joinAll().start();
    d.run(10);
    let steps = 0;
    const sim = replay(FIXTURE, d.log, { untilMs: 10_000, onTick: (_s, cause) => cause === 'step' && steps++ });
    expect(sim.hash()).toBe(d.sim.hash());
    expect(steps).toBe(10);
  });

  it('rejects malformed logs', () => {
    const d = scripted(1);
    expect(() => sessionParams(d.log.slice(1))).toThrow(/SESSION_CREATED/);
    const broken = d.log.filter((e) => e.type !== 'EXERCISE_STARTED');
    expect(() => replay(FIXTURE, broken)).toThrow(/Replay gap/);
  });
});
