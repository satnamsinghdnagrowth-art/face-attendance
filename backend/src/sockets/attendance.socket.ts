import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types';
import env from '../config/env';
import logger from '../utils/logger';
import { safeGet } from '../config/redis';

interface AuthenticatedSocket extends Socket {
  user?: JWTPayload;
}

const authenticateSocket = async (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void
): Promise<void> => {
  try {
    const token =
      (socket.handshake.auth['token'] as string | undefined) ||
      socket.handshake.headers['authorization']?.replace('Bearer ', '');

    if (!token) {
      next(new Error('Authentication token is required'));
      return;
    }

    // safeGet never throws — returns null when Redis is unavailable.
    // A Redis outage must never block socket authentication; the blacklist
    // check is skipped gracefully, matching the behaviour of the REST auth middleware.
    const isBlacklisted = await safeGet(`blacklist:${token}`);
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
      // This branch now only fires for unexpected errors, not Redis failures.
      logger.error('[Socket] Unexpected auth error', {
        error: error instanceof Error ? error.message : String(error),
      });
      next(new Error('Authentication failed'));
    }
  }
};

export const initializeSockets = (io: Server): void => {
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

    // Auto-join personal and role rooms on connect
    socket.join(`user:${user.userId}`);
    socket.join(`role:${user.role}`);

    // ─── Attendance (Class / Session) Rooms ────────────────────────────────

    const joinClassRoom = async (classId: string) => {
      const room = `class:${classId}`;
      await socket.join(room);
      const size = io.sockets.adapter.rooms.get(room)?.size ?? 0;
      socket.emit('joined_class_room', { class_id: classId, room, participant_count: size });
      logger.debug('Socket joined class room', { socketId: socket.id, userId: user.userId, classId });
    };

    socket.on('join_class', async (data: { class_id: string }) => {
      if (!data?.class_id) { socket.emit('error', { message: 'class_id is required' }); return; }
      await joinClassRoom(data.class_id);
    });

    socket.on('join-class-room', async (data: { classId?: string; class_id?: string }) => {
      const classId = data?.classId || data?.class_id;
      if (!classId) { socket.emit('error', { message: 'classId is required' }); return; }
      await joinClassRoom(classId);
    });

    socket.on('leave_class', async (data: { class_id: string }) => {
      if (!data?.class_id) return;
      await socket.leave(`class:${data.class_id}`);
      socket.emit('left_class_room', { class_id: data.class_id });
    });

    socket.on('leave-class-room', async (data: { classId?: string; class_id?: string }) => {
      const classId = data?.classId || data?.class_id;
      if (!classId) return;
      await socket.leave(`class:${classId}`);
    });

    socket.on('join_session', async (data: { session_id: string }) => {
      if (!data?.session_id) return;
      await socket.join(`session:${data.session_id}`);
      socket.emit('joined_session', { session_id: data.session_id });
    });

    socket.on('leave_session', async (data: { session_id: string }) => {
      if (!data?.session_id) return;
      await socket.leave(`session:${data.session_id}`);
    });

    // ─── Exam Monitoring Rooms ──────────────────────────────────────────────
    //
    // Room naming:
    //   exam:{examId}      — chief examiners + any authenticated user of this exam
    //   exam_hall:{hallId} — invigilators of a specific hall (subset of exam room)
    //
    // Who joins:
    //   chief_examiner → joins exam:{examId} to receive all alerts + verdicts
    //   hall_invigilator → joins exam:{examId} AND exam_hall:{hallId} for their hall

    /**
     * join_exam_room — joins the top-level exam room.
     * Payload: { exam_id: string }
     * Used by: chief_examiner to receive all alerts and verification events for the exam.
     */
    socket.on('join_exam_room', async (data: { exam_id: string }) => {
      if (!data?.exam_id) {
        socket.emit('error', { message: 'exam_id is required' });
        return;
      }
      const room = `exam:${data.exam_id}`;
      await socket.join(room);
      const size = io.sockets.adapter.rooms.get(room)?.size ?? 0;
      socket.emit('joined_exam_room', { exam_id: data.exam_id, participant_count: size });
      logger.debug('Socket joined exam room', { socketId: socket.id, userId: user.userId, examId: data.exam_id });
    });

    /**
     * leave_exam_room — leaves the exam room.
     * Payload: { exam_id: string }
     */
    socket.on('leave_exam_room', async (data: { exam_id: string }) => {
      if (!data?.exam_id) return;
      await socket.leave(`exam:${data.exam_id}`);
      socket.emit('left_exam_room', { exam_id: data.exam_id });
    });

    /**
     * join_exam_hall — joins the hall-specific sub-room within an exam.
     * Payload: { exam_id: string; hall_id: string }
     * Used by: hall_invigilator to receive verdicts from their hall only.
     * Also auto-joins the parent exam:{examId} room so alerts are received.
     */
    socket.on('join_exam_hall', async (data: { exam_id: string; hall_id: string }) => {
      if (!data?.exam_id || !data?.hall_id) {
        socket.emit('error', { message: 'exam_id and hall_id are required' });
        return;
      }
      // Join both the exam-level room and the hall-specific room
      const examRoom = `exam:${data.exam_id}`;
      const hallRoom = `exam_hall:${data.hall_id}`;
      await Promise.all([socket.join(examRoom), socket.join(hallRoom)]);
      socket.emit('joined_exam_hall', {
        exam_id: data.exam_id,
        hall_id: data.hall_id,
        exam_room: examRoom,
        hall_room: hallRoom,
      });
      logger.debug('Socket joined exam hall room', {
        socketId: socket.id,
        userId: user.userId,
        examId: data.exam_id,
        hallId: data.hall_id,
      });
    });

    /**
     * leave_exam_hall — leaves the hall-specific room.
     * Payload: { exam_id: string; hall_id: string }
     */
    socket.on('leave_exam_hall', async (data: { exam_id: string; hall_id: string }) => {
      if (!data?.exam_id || !data?.hall_id) return;
      await Promise.all([
        socket.leave(`exam:${data.exam_id}`),
        socket.leave(`exam_hall:${data.hall_id}`),
      ]);
    });

    // ─── Session state query ────────────────────────────────────────────────

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
      } catch {
        socket.emit('error', { message: 'Failed to fetch session state' });
      }
    });

    // ─── Ping/pong health check ─────────────────────────────────────────────

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // ─── Disconnect ─────────────────────────────────────────────────────────

    socket.on('disconnect', (reason: string) => {
      logger.info('Socket disconnected', { socketId: socket.id, userId: user.userId, reason });
    });

    socket.on('error', (error: Error) => {
      logger.error('Socket error', { socketId: socket.id, userId: user.userId, error: error.message });
    });
  });

  io.on('connect_error', (error: Error) => {
    logger.error('Socket.IO connection error', { error: error.message });
  });

  logger.info('Socket.IO initialized with attendance + exam monitoring handlers');
};
