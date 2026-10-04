import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InstructorState, LobbyInfo, PerceivedPicture } from '@vanguard/shared';
import { connect, createSession, join, startServer, type TestServer } from './helpers';

let srv: TestServer;
beforeAll(async () => {
  srv = await startServer({ tickHz: 5 });
});
afterAll(async () => {
  await srv.close();
});

describe('Socket.IO multiplayer (server-authoritative, cross-client)', () => {
  it('rejects sockets without a valid token', async () => {
    const { code } = await createSession(srv);
    await expect(connect(srv, code, 'nope-nope-nope-nope-nope')).rejects.toThrow(/unauthorized/);
    await expect(connect(srv, 'ZZZZZZ', 'x'.repeat(40))).rejects.toThrow(/unauthorized/);
  });

  it('DS starts; each trainee gets its own picture; clock advances', async () => {
    const { code, instructorToken } = await createSession(srv, ['CDR', 'PL_A', 'PL_B', 'ALO', 'EW']);
    const ds = await connect(srv, code, instructorToken);
    const cdrJ = await join(srv, code, 'CDR');
    const plbJ = await join(srv, code, 'PL_B');
    const cdr = await connect(srv, code, cdrJ.playerToken);
    const plb = await connect(srv, code, plbJ.playerToken);
    const lobby = await ds.waitFor<LobbyInfo>('lobby', (l) => l.roles.filter((r) => r.connected).length === 2);
    expect(lobby.roles.find((r) => r.id === 'CDR')!.takenBy).toBe('P CDR');

    // trainees cannot send DS commands
    expect((await cdr.cmd({ type: 'START' })).ok).toBe(false);
    expect(await ds.cmd({ type: 'START' })).toEqual({ ok: true });
    const pic = await plb.waitFor<PerceivedPicture>('picture', (p) => p.phase === 'RUNNING' && p.tMs >= 2000);
    expect(pic.role).toBe('PL_B');
    expect(pic.kind).toBe('perceived');
    const truth = await ds.waitFor<InstructorState>('ds:state', (s) => s.tMs >= 2000);
    expect(truth.kind).toBe('truth');
    expect(truth.units.some((u) => u.decoy)).toBe(true);

    // speed ×4 makes ticks faster
    expect((await ds.cmd({ type: 'SET_SPEED', speed: 4 })).ok).toBe(true);
    const t0 = (await cdr.waitFor<PerceivedPicture>('picture', (p) => p.speed === 4)).tMs;
    await new Promise((r) => setTimeout(r, 1000));
    const t1 = cdr.last<PerceivedPicture>('picture')!.tMs;
    // ×4 at 5 Hz ≈ 20 steps per wall second (×1 would be ≈ 5).
    expect(t1 - t0).toBeGreaterThanOrEqual(12_000);

    // pause stops the clock
    expect((await ds.cmd({ type: 'PAUSE' })).ok).toBe(true);
    const paused = await cdr.waitFor<PerceivedPicture>('picture', (p) => p.phase === 'PAUSED');
    await new Promise((r) => setTimeout(r, 200));
    expect(cdr.last<PerceivedPicture>('picture')!.tMs).toBe(paused.tMs);
    [ds, cdr, plb].forEach((c) => c.close());
  });

  it('player messages travel between machines through the degradation pipeline', async () => {
    const { code, instructorToken } = await createSession(srv, ['CDR', 'PL_A', 'PL_B']);
    const ds = await connect(srv, code, instructorToken);
    const a = await connect(srv, code, (await join(srv, code, 'PL_A')).playerToken);
    const c = await connect(srv, code, (await join(srv, code, 'CDR')).playerToken);
    await ds.cmd({ type: 'START' });
    await ds.cmd({ type: 'SET_SPEED', speed: 4 });
    const ack = await a.cmd({ type: 'SEND_MESSAGE', channel: 'CMD_NET', to: ['CDR'], text: 'KESTREL 1: contact D6, wait out' });
    expect(ack).toEqual({ ok: true });
    const got = await c.waitFor<PerceivedPicture>('picture', (p) => p.messages.some((m) => m.fromRole === 'PL_A'), 8000);
    expect(got.messages.find((m) => m.fromRole === 'PL_A')!.deliveredAtMs).toBeGreaterThan(0);
    // invalid trainee command is rejected with a reason
    const bad = await a.cmd({ type: 'SEND_MESSAGE', channel: 'SATCOM', to: ['CDR'], text: 'x' });
    expect(bad.ok).toBe(false);
    expect((await a.cmd({ type: 'NOPE' })).ok).toBe(false);
    [ds, a, c].forEach((x) => x.close());
  });

  it('view-as-role shows exactly the trainee picture; jammer cut-off reaches the trainee', async () => {
    const { code, instructorToken } = await createSession(srv, ['CDR', 'PL_A', 'PL_B']);
    const ds = await connect(srv, code, instructorToken);
    const plb = await connect(srv, code, (await join(srv, code, 'PL_B')).playerToken);
    await ds.cmd({ type: 'START' });
    await ds.cmd({ type: 'PLACE_JAMMER', jammer: { cell: 'G2', radius: 2, bands: ['VHF', 'HF'], power: 1, active: true } });
    const cut = await plb.waitFor<PerceivedPicture>('picture', (p) => p.cutOff, 5000);
    expect(cut.channels.find((ch) => ch.channel === 'CMD_NET')!.level).toBe('DENIED');
    await ds.cmd({ type: 'PAUSE' });
    await plb.waitFor<PerceivedPicture>('picture', (p) => p.phase === 'PAUSED');
    expect((await ds.cmd({ type: 'VIEW_AS', role: 'PL_B' })).ok).toBe(true);
    const viewAs = await ds.waitFor<PerceivedPicture>('ds:viewAs', (p) => p?.phase === 'PAUSED');
    const trainee = plb.last<PerceivedPicture>('picture')!;
    expect(viewAs).toEqual(trainee);
    expect((await ds.cmd({ type: 'VIEW_AS', role: null })).ok).toBe(true);
    [ds, plb].forEach((x) => x.close());
  });

  it('reconnect restores the full picture from the server (refresh-safe)', async () => {
    const { code, instructorToken } = await createSession(srv, ['CDR', 'PL_A']);
    const ds = await connect(srv, code, instructorToken);
    const tok = (await join(srv, code, 'PL_A')).playerToken;
    const a1 = await connect(srv, code, tok);
    await ds.cmd({ type: 'START' });
    await a1.cmd({ type: 'SEND_MESSAGE', channel: 'CMD_NET', to: ['CDR'], text: 'before refresh' });
    a1.close();
    const a2 = await connect(srv, code, tok);
    const pic = await a2.waitFor<PerceivedPicture>('picture');
    expect(pic.sent.some((m) => m.text === 'before refresh')).toBe(true);
    [ds, a2].forEach((x) => x.close());
  });

  it('SAGAT probe round-trip, MSEL control, release role and end', async () => {
    const { code, instructorToken } = await createSession(srv, ['CDR', 'PL_A']);
    const ds = await connect(srv, code, instructorToken);
    const a = await connect(srv, code, (await join(srv, code, 'PL_A')).playerToken);
    await ds.cmd({ type: 'START' });
    expect((await ds.cmd({ type: 'END_PROBE' })).ok).toBe(false);
    expect((await ds.cmd({ type: 'MSEL_SKIP', mselId: 'IB-01' })).ok).toBe(true);
    expect((await ds.cmd({ type: 'MSEL_EDIT', mselId: 'IB-02', atS: 5 })).ok).toBe(true);
    expect((await ds.cmd({ type: 'MSEL_FIRE_NOW', mselId: 'IB-03' })).ok).toBe(true);
    expect((await ds.cmd({ type: 'FIRE_INJECT', inject: { type: 'DELAY', channels: ['CMD_NET'], roles: [], durationS: 30, params: { delayS: 20 } } })).ok).toBe(true);
    expect((await ds.cmd({ type: 'TRIGGER_CYBER', cyber: { kind: 'C2_OUTAGE', durationS: 30 } })).ok).toBe(true);
    expect((await ds.cmd({ type: 'PLACE_JAMMER', jammer: { cell: 'A1', radius: 1, bands: ['VHF'] } })).ok).toBe(true);
    const st = await ds.waitFor<InstructorState>('ds:state', (s) => s.jammers.length > 0);
    const jid = st.jammers[0]!.id;
    expect((await ds.cmd({ type: 'MOVE_JAMMER', jammerId: jid, cell: 'B2' })).ok).toBe(true);
    expect((await ds.cmd({ type: 'TOGGLE_JAMMER', jammerId: jid, active: false })).ok).toBe(true);
    expect((await ds.cmd({ type: 'REMOVE_JAMMER', jammerId: jid })).ok).toBe(true);
    expect((await ds.cmd({ type: 'SET_INTENT', text: 'too late to change' })).ok).toBe(true);

    expect((await ds.cmd({ type: 'START_PROBE' })).ok).toBe(true);
    const q = await a.waitFor<PerceivedPicture>('picture', (p) => !!p.probe && p.phase === 'PROBE');
    const answers = Object.fromEntries(q.probe!.questions.map((x) => [x.id, 'UNKNOWN']));
    expect((await a.cmd({ type: 'ANSWER_PROBE', probeId: q.probe!.id, answers })).ok).toBe(true);
    await ds.waitFor<InstructorState>('ds:state', (s) => s.probes[0]?.results.find((r) => r.role === 'PL_A')?.submitted === true);
    expect((await ds.cmd({ type: 'END_PROBE' })).ok).toBe(true);
    expect((await ds.cmd({ type: 'RELEASE_ROLE', role: 'CDR' })).ok).toBe(false);
    expect((await ds.cmd({ type: 'RELEASE_ROLE', role: 'PL_A' })).ok).toBe(true);
    expect((await ds.cmd({ type: 'END' })).ok).toBe(true);
    await ds.waitFor('ended');
    expect((await srv.api('POST', `/api/sessions/${code}/join`, { roleId: 'CDR', callsign: 'LATE' })).status).toBe(409);
    [ds, a].forEach((x) => x.close());
  });
});
