import { Server } from 'socket.io';
import { AttendanceStatus, UserRole, SocketAttendancePayload, SocketSessionPayload } from '../types';
import logger from '../utils/logger';

let ioInstance: Server | null = null;

export const setSocketIO = (io: Server): void => {
  ioInstance = io;
  logger.info('Socket.IO instance set in notification service');
};

const getIO = (): Server | null => ioInstance;

export class NotificationService {
  notifyAttendanceMarked(
    classId: string,
    payload: SocketAttendancePayload
  ): void {
    const io = getIO();
    if (!io) return;

    io.to(`class:${classId}`).emit('attendance_marked', payload);
    logger.debug('Attendance marked notification sent', { classId, studentId: payload.studentId });
  }

  notifySessionStarted(classId: string, payload: SocketSessionPayload): void {
    const io = getIO();
    if (!io) return;

    io.to(`class:${classId}`).emit('session_started', payload);
    logger.debug('Session started notification sent', { classId, sessionId: payload.sessionId });
  }

  notifySessionEnded(classId: string, payload: SocketSessionPayload): void {
    const io = getIO();
    if (!io) return;

    io.to(`class:${classId}`).emit('session_ended', payload);
    logger.debug('Session ended notification sent', { classId, sessionId: payload.sessionId });
  }

  broadcastToRole(role: UserRole, event: string, data: unknown): void {
    const io = getIO();
    if (!io) return;

    io.to(`role:${role}`).emit(event, data);
    logger.debug('Role broadcast sent', { role, event });
  }

  broadcastToUser(userId: string, event: string, data: unknown): void {
    const io = getIO();
    if (!io) return;

    io.to(`user:${userId}`).emit(event, data);
    logger.debug('User notification sent', { userId, event });
  }

  emitFaceScanResult(
    socketId: string,
    result: {
      matched: boolean;
      studentId?: string;
      studentName?: string;
      confidence: number;
      status?: AttendanceStatus;
    }
  ): void {
    const io = getIO();
    if (!io) return;

    io.to(socketId).emit('face-scan-result', result);
    logger.debug('Face scan result emitted', { socketId, matched: result.matched });
  }

  broadcastSystemAlert(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const io = getIO();
    if (!io) return;

    io.emit('system-alert', { message, level, timestamp: new Date() });
    logger.info('System alert broadcast', { message, level });
  }

  getConnectedCount(): number {
    const io = getIO();
    if (!io) return 0;
    return io.engine.clientsCount;
  }

  getRoomSize(roomName: string): number {
    const io = getIO();
    if (!io) return 0;
    return io.sockets.adapter.rooms.get(roomName)?.size || 0;
  }
}

export const notificationService = new NotificationService();
export default notificationService;
