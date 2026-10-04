import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import type { CommandAck, InstructorState, LobbyInfo, PerceivedPicture } from '@vanguard/shared';
import { openSocket, sendCmd } from '@/lib/socket';

interface Flash {
  id: number;
  kind: 'error' | 'ok';
  text: string;
}

interface SessionState {
  code: string | null;
  socket: Socket | null;
  connected: boolean;
  authError: string | null;
  actor: string | null;
  picture: PerceivedPicture | null;
  truth: InstructorState | null;
  viewAs: PerceivedPicture | null;
  lobby: LobbyInfo | null;
  ended: boolean;
  flash: Flash | null;
  connect: (code: string, token: string) => void;
  disconnect: () => void;
  cmd: (c: unknown, okText?: string) => Promise<CommandAck>;
  notify: (kind: Flash['kind'], text: string) => void;
}

let flashId = 0;

/**
 * Live session state — fed exclusively by the server over Socket.IO.
 * A refresh simply reconnects and the server pushes the full current picture again.
 */
export const useSession = create<SessionState>((set, get) => ({
  code: null,
  socket: null,
  connected: false,
  authError: null,
  actor: null,
  picture: null,
  truth: null,
  viewAs: null,
  lobby: null,
  ended: false,
  flash: null,

  connect: (code, token) => {
    const prev = get().socket;
    if (prev && get().code === code) return;
    prev?.close();
    const socket = openSocket(code, token);
    set({ code, socket, connected: false, authError: null, picture: null, truth: null, viewAs: null, lobby: null, ended: false });
    socket.on('connect', () => set({ connected: true, authError: null }));
    socket.on('disconnect', () => set({ connected: false }));
    socket.on('connect_error', (err) => {
      if (err.message === 'unauthorized') {
        set({ authError: 'This exercise is not available with your token — it may have ended on a restarted server, or your seat was released.' });
        socket.close();
      }
    });
    socket.on('hello', (h: { actor: string }) => set({ actor: h.actor }));
    socket.on('picture', (p: PerceivedPicture) => set({ picture: p, ended: p.phase === 'ENDED' || get().ended }));
    socket.on('ds:state', (t: InstructorState) => set({ truth: t, ended: t.phase === 'ENDED' || get().ended }));
    socket.on('ds:viewAs', (p: PerceivedPicture | null) => set({ viewAs: p }));
    socket.on('lobby', (l: LobbyInfo) => set({ lobby: l }));
    socket.on('ended', () => set({ ended: true }));
  },

  disconnect: () => {
    get().socket?.close();
    set({ socket: null, connected: false, code: null });
  },

  cmd: async (c, okText) => {
    const ack = await sendCmd(get().socket, c);
    if (!ack.ok) get().notify('error', ack.error ?? 'Rejected');
    else if (okText) get().notify('ok', okText);
    return ack;
  },

  notify: (kind, text) => {
    const id = ++flashId;
    set({ flash: { id, kind, text } });
    setTimeout(() => {
      if (get().flash?.id === id) set({ flash: null });
    }, 4000);
  },
}));
