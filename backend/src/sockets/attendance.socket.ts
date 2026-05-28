import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWTPayload, UserRole } from '../types';
import env from '../config/env';
import logger from '../utils/logger';
import { redisClient } from '../config/redis';

interface AuthenticatedSocket extends Socket {
  user?: JWTPayload;
}

const authenticateSocket = async (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void
): Promise<void> => {
  try {
    const token =
      socket.handshake.auth['token'] as string | undefined ||
      socket.handshake.headers['authorization']?.replace('Bearer ', '');

    if (!token) {
      next(new Error('Authentication token is required'));
      return;
    }

    // Check if token is blacklisted
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      next(new Error('Token has been revoked'));
      return;
    }

    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JWTPayload;
    socket.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new Error('Token has expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new Error('Invalid token'));
    } else {
      next(new Error('Authentication failed'));
    }
  }
};

export const initializeSockets = (io: Server): void => {
  // Apply JWT authentication middleware to all socket connections
  io.use((socket, next) => {
    authenticateSocket(socket as AuthenticatedSocket, next);
  });

  io.on('connection', (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const user = authSocket.user;

    if (!user) {
      socket.disconnect(true);
      return;
    }

    logger.info('Socket connected', {
      socketId: socket.id,
      userId: user.userId,
      role: user.role,
    });

    // Auto-join personal room
    socket.join(`user:${user.userId}`);

    // Auto-join role room
    socket.join(`role:${user.role}`);

    // ─── Event Handlers ─────────────────────────────────────────────────────

    const joinClassRoom = async (classId: string) => {
      const room = `class:${classId}`;
      await socket.join(room);
      const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
      socket.emit('joined_class_room', { class_id: classId, room, participant_count: roomSize });
      logger.debug('Socket joined class room', { socketId: socket.id, userId: user.userId, classId });
    };

    // Mobile emits: join_class with { class_id }
    socket.on('join_class', async (data: { class_id: string }) => {
      if (!data?.class_id) { socket.emit('error', { message: 'class_id is required' }); return; }
      await joinClassRoom(data.class_id);
    });

    // Legacy event name support
    socket.on('join-class-room', async (data: { classId?: string; class_id?: string }) => {
      const classId = data?.classId || data?.class_id;
      if (!classId) { socket.emit('error', { message: 'classId is required' }); return; }
      await joinClassRoom(classId);
    });

    // Mobile emits: leave_class with { class_id }
    socket.on('leave_class', async (data: { class_id: string }) => {
      if (!data?.class_id) return;
      const room = `class:${data.class_id}`;
      await socket.leave(room);
      socket.emit('left_class_room', { class_id: data.class_id });
      logger.debug('Socket left class room', { socketId: socket.id, userId: user.userId, classId: data.class_id });
    });

    socket.on('leave-class-room', async (data: { classId?: string; class_id?: string }) => {
      const classId = data?.classId || data?.class_id;
      if (!classId) return;
      await socket.leave(`class:${classId}`);
    });

    // Mobile emits: join_session with { session_id }
    socket.on('join_session', async (data: { session_id: string }) => {
      if (!data?.session_id) return;
      const room = `session:${data.session_id}`;
      await socket.join(room);
      socket.emit('joined_session', { session_id: data.session_id });
    });

    // Mobile emits: leave_session with { session_id }
    socket.on('leave_session', async (data: { session_id: string }) => {
      if (!data?.session_id) return;
      await socket.leave(`session:${data.session_id}`);
    });

    /**
     * Request current session state for a class room.
     * Event: get-session-state
     * Payload: { sessionId: string }
     */
    socket.on('get-session-state', async (data: { sessionId: string }) => {
      if (!data?.sessionId) {
        socket.emit('error', { message: 'sessionId is required' });
        return;
      }

      try {
        const { query } = await import('../config/database');
        const result = await query(
          `SELECT as2.*, COUNT(ar.id) as marked_count
           FROM attendance_sessions as2
           LEFT JOIN attendance_records ar ON ar.session_id = as2.id
           WHERE as2.id = $1
           GROUP BY as2.id`,
          [data.sessionId]
        );

        socket.emit('session-state', result.rows[0] || null);
      } catch (error) {
        socket.emit('error', { message: 'Failed to fetch session state' });
      }
    });

    /**
     * Ping/pong for connection health check.
     * Event: ping
     */
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // ─── Disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', (reason: string) => {
      logger.info('Socket disconnected', {
        socketId: socket.id,
        userId: user.userId,
        reason,
      });
    });

    socket.on('error', (error: Error) => {
      logger.error('Socket error', {
        socketId: socket.id,
        userId: user.userId,
        error: error.message,
      });
    });
  });

  // Connection error handler
  io.on('connect_error', (error: Error) => {
    logger.error('Socket.IO connection error', { error: error.message });
  });

  logger.info('Socket.IO initialized with attendance handlers');
};
