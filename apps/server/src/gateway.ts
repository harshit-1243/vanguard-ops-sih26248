import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  DsCommandSchema,
  TraineeCommandSchema,
  type CommandAck,
  type PerceivedPicture,
  type RoleId,
} from '@vanguard/shared';
import type { SessionManager } from './manager';
import type { LiveSession, SessionActor } from './session';

interface SocketData {
  code: string;
  actor: SessionActor;
  viewAs: RoleId | null;
}

const dsRoom = (code: string) => `s:${code}:ds`;
const roleRoom = (code: string, role: RoleId) => `s:${code}:role:${role}`;
const allRoom = (code: string) => `s:${code}:all`;

/**
 * Socket.IO gateway. Each socket is bound to exactly one actor (DS or a role) resolved from its
 * token on the server — clients never choose their room. Trainee rooms only ever receive
 * `project()` output; truth goes to the DS room only.
 */
export function attachGateway(httpServer: HttpServer, manager: SessionManager, log: { error: (o: unknown, m?: string) => void }): Server {
  const io = new Server(httpServer, { path: '/socket.io', serveClient: false, cors: { origin: true } });
  const endedNotified = new Set<string>();

  io.use((socket, next) => {
    const { code, token } = (socket.handshake.auth ?? {}) as { code?: unknown; token?: unknown };
    const session = typeof code === 'string' ? manager.get(code) : undefined;
    const actor = session?.resolveToken(token) ?? null;
    if (!session || !actor) return next(new Error('unauthorized'));
    (socket.data as SocketData) = { code: session.code, actor, viewAs: null };
    next();
  });

  const broadcast = (session: LiveSession) => {
    const code = session.code;
    try {
      const pictureCache = new Map<RoleId, PerceivedPicture>();
      const pic = (role: RoleId) => {
        let p = pictureCache.get(role);
        if (!p) {
          p = session.picture(role);
          pictureCache.set(role, p);
        }
        return p;
      };
      for (const role of session.sim.state.enabledRoles) {
        const room = roleRoom(code, role);
        if ((io.sockets.adapter.rooms.get(room)?.size ?? 0) > 0) io.to(room).emit('picture', pic(role));
      }
      const ds = io.sockets.adapter.rooms.get(dsRoom(code));
      if (ds && ds.size > 0) {
        io.to(dsRoom(code)).emit('ds:state', session.truth());
        for (const id of ds) {
          const sock = io.sockets.sockets.get(id);
          const viewAs = (sock?.data as SocketData | undefined)?.viewAs;
          if (sock && viewAs) sock.emit('ds:viewAs', pic(viewAs));
        }
      }
      io.to(allRoom(code)).emit('lobby', session.lobby());
      if (session.phase === 'ENDED' && !endedNotified.has(code)) {
        endedNotified.add(code);
        io.to(allRoom(code)).emit('ended', { code });
      }
    } catch (err) {
      log.error(err, 'broadcast failed');
    }
  };
  manager.onChange = broadcast;

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;
    const session = manager.get(data.code);
    if (!session) return socket.disconnect(true);
    void socket.join(allRoom(data.code));
    void socket.join(data.actor === 'DS' ? dsRoom(data.code) : roleRoom(data.code, data.actor));
    socket.emit('hello', { actor: data.actor, code: data.code });
    session.setPresence(data.actor, 1);

    socket.on('cmd', (raw: unknown, ack?: (a: CommandAck) => void) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (data.actor === 'DS') {
          const parsed = DsCommandSchema.safeParse(raw);
          if (!parsed.success) return reply({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid command' });
          if (parsed.data.type === 'VIEW_AS') {
            data.viewAs = parsed.data.role;
            if (data.viewAs) socket.emit('ds:viewAs', session.picture(data.viewAs));
            else socket.emit('ds:viewAs', null);
            return reply({ ok: true });
          }
          return reply(session.dsCommand(parsed.data));
        }
        const parsed = TraineeCommandSchema.safeParse(raw);
        if (!parsed.success) return reply({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid command' });
        return reply(session.traineeCommand(data.actor, parsed.data));
      } catch (err) {
        log.error(err, 'command failed');
        reply({ ok: false, error: 'Server error' });
      }
    });

    socket.on('disconnect', () => session.setPresence(data.actor, -1));
  });

  return io;
}
