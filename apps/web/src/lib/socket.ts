import { io, type Socket } from 'socket.io-client';
import type { CommandAck } from '@vanguard/shared';

/** Real multiplayer: one Socket.IO connection per tab to the server (no browser-storage sync). */
export function openSocket(code: string, token: string): Socket {
  return io({
    path: '/socket.io',
    auth: { code, token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });
}

export function sendCmd(socket: Socket | null, cmd: unknown): Promise<CommandAck> {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) return resolve({ ok: false, error: 'Not connected to server' });
    const timer = setTimeout(() => resolve({ ok: false, error: 'Server did not acknowledge' }), 8000);
    socket.emit('cmd', cmd, (ack: CommandAck) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}
