import { Server } from 'socket.io';
import {
  AttendanceStatus, UserRole,
  SocketAttendancePayload, SocketSessionPayload,
  SocketExamAlertPayload, SocketVerificationPayload,
} from '../types';
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

  // ─── Exam Monitoring Broadcasts ───────────────────────────────────────────

  /**
   * Broadcast an exam alert to all sockets in the exam room.
   * Room: exam:{examId}
   * Event: exam_alert
   * Listeners: chief examiners, hall invigilators of that exam
   */
  broadcastExamAlert(examId: string, payload: SocketExamAlertPayload): void {
    const io = getIO();
    if (!io) return;
    io.to(`exam:${examId}`).emit('exam_alert', payload);
    logger.debug('Exam alert broadcast', { examId, alertType: payload.alertType, severity: payload.severity });
  }

  /**
   * Broadcast a verification event to the exam room.
   * Room: exam:{examId}  AND  exam_hall:{hallId}
   * Event: verification_event
   * Listeners: chief examiner sees all; invigilator sees their hall only
   */
  broadcastVerificationEvent(examId: string, hallId: string, payload: SocketVerificationPayload): void {
    const io = getIO();
    if (!io) return;
    io.to(`exam:${examId}`).to(`exam_hall:${hallId}`).emit('verification_event', payload);
    logger.debug('Verification event broadcast', { examId, hallId, verdict: payload.verdict });
  }

  /**
   * Broadcast exam status change (started / cancelled) to the exam room.
   * Room: exam:{examId}
   * Event: exam_status_changed
   */
  broadcastExamStatusChange(examId: string, status: string, examCode: string): void {
    const io = getIO();
    if (!io) return;
    io.to(`exam:${examId}`).emit('exam_status_changed', {
      examId,
      examCode,
      status,
      changedAt: new Date().toISOString(),
    });
    logger.info('Exam status change broadcast', { examId, status });
  }

  /**
   * Broadcast hall session lifecycle events (started / ended) to the exam room.
   * Room: exam:{examId}
   * Event: hall_session_update
   */
  broadcastHallSessionUpdate(
    examId: string,
    payload: { hallId: string; sessionId: string; event: 'started' | 'ended'; hallName?: string }
  ): void {
    const io = getIO();
    if (!io) return;
    io.to(`exam:${examId}`).emit('hall_session_update', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
    logger.debug('Hall session update broadcast', { examId, ...payload });
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
