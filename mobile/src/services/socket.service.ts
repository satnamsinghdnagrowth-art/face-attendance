import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { AttendanceSession, ScanResult, SocketExamAlertPayload, SocketVerificationPayload } from '@/types';

const SOCKET_URL = 'https://face-attendance-9kza.onrender.com';
// const SOCKET_URL = 'http://localhost:3030';

const AUTH_ERROR_PATTERNS = [
  'authentication failed',
  'unauthorized',
  'expired',
  'invalid token',
  'token',
  'auth',
  'forbidden',
];

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isHandlingAuthError = false;

  connect(token: string): void {
    if (this.socket?.connected) {
      return;
    }

    // Clean up any stale socket before creating a new one
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.isHandlingAuthError = false;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', async (error) => {
      console.warn('[Socket] Connection error:', error.message);
      this.reconnectAttempts++;

      if (this.isHandlingAuthError || this.reconnectAttempts > this.maxReconnectAttempts) {
        return;
      }

      const msgLower = error.message.toLowerCase();
      const isAuthError = AUTH_ERROR_PATTERNS.some((p) => msgLower.includes(p));

      if (isAuthError) {
        this.isHandlingAuthError = true;
        try {
          const freshToken = await SecureStore.getItemAsync('access_token');
          if (freshToken) {
            console.log('[Socket] Auth error detected — reconnecting with latest token');
            this.socket?.removeAllListeners();
            this.socket?.disconnect();
            this.socket = null;
            this.reconnectAttempts = 0;
            setTimeout(() => {
              this.isHandlingAuthError = false;
              this.connect(freshToken);
            }, 800);
          } else {
            this.isHandlingAuthError = false;
          }
        } catch {
          this.isHandlingAuthError = false;
        }
      }
    });

    this.socket.on('error', (error) => {
      console.warn('[Socket] Error:', error);
    });
  }

  /**
   * Called by the Axios token-refresh interceptor after a successful token refresh.
   * If the socket is disconnected/auth-failed, reconnects with the new token.
   */
  updateToken(newToken: string): void {
    if (this.socket?.connected) {
      return;
    }
    console.log('[Socket] Updating token after REST refresh — reconnecting');
    this.reconnectAttempts = 0;
    this.isHandlingAuthError = false;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connect(newToken);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinClassRoom(classId: string): void {
    this.socket?.emit('join_class', { class_id: classId });
  }

  leaveClassRoom(classId: string): void {
    this.socket?.emit('leave_class', { class_id: classId });
  }

  joinSession(sessionId: string): void {
    this.socket?.emit('join_session', { session_id: sessionId });
  }

  leaveSession(sessionId: string): void {
    this.socket?.emit('leave_session', { session_id: sessionId });
  }

  onAttendanceMarked(callback: (data: ScanResult) => void): void {
    this.socket?.on('attendance_marked', callback);
  }

  offAttendanceMarked(): void {
    this.socket?.off('attendance_marked');
  }

  onSessionStarted(callback: (session: AttendanceSession) => void): void {
    this.socket?.on('session_started', callback);
  }

  offSessionStarted(): void {
    this.socket?.off('session_started');
  }

  onSessionEnded(callback: (sessionId: string) => void): void {
    this.socket?.on('session_ended', (data: { session_id: string }) =>
      callback(data.session_id)
    );
  }

  offSessionEnded(): void {
    this.socket?.off('session_ended');
  }

  onStudentScanned(callback: (data: { student_id: string; status: string }) => void): void {
    this.socket?.on('student_scanned', callback);
  }

  offStudentScanned(): void {
    this.socket?.off('student_scanned');
  }

  onNotification(callback: (data: unknown) => void): void {
    this.socket?.on('notification', callback);
  }

  offNotification(): void {
    this.socket?.off('notification');
  }

  offAllListeners(): void {
    this.socket?.removeAllListeners();
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  emit(event: string, data?: unknown): void {
    this.socket?.emit(event, data);
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  // ─── Exam Monitoring Rooms ──────────────────────────────────────────────────
  //
  // Chief examiners join the exam room to receive all alerts + verdicts.
  // Hall invigilators join the exam hall room for their specific hall.

  joinExamRoom(examId: string): void {
    this.socket?.emit('join_exam_room', { exam_id: examId });
  }

  leaveExamRoom(examId: string): void {
    this.socket?.emit('leave_exam_room', { exam_id: examId });
  }

  joinExamHall(examId: string, hallId: string): void {
    this.socket?.emit('join_exam_hall', { exam_id: examId, hall_id: hallId });
  }

  leaveExamHall(examId: string, hallId: string): void {
    this.socket?.emit('leave_exam_hall', { exam_id: examId, hall_id: hallId });
  }

  // exam_alert — raised when a proxy, flagged, or rejected scan occurs
  onExamAlert(callback: (payload: SocketExamAlertPayload) => void): void {
    this.socket?.on('exam_alert', callback);
  }

  offExamAlert(): void {
    this.socket?.off('exam_alert');
  }

  // verification_event — fires after every scan (verdict + confidence)
  onVerificationEvent(callback: (payload: SocketVerificationPayload) => void): void {
    this.socket?.on('verification_event', callback);
  }

  offVerificationEvent(): void {
    this.socket?.off('verification_event');
  }

  // exam_status_changed — exam moved to active / cancelled / completed
  onExamStatusChanged(callback: (data: { examId: string; status: string; examCode: string }) => void): void {
    this.socket?.on('exam_status_changed', callback);
  }

  offExamStatusChanged(): void {
    this.socket?.off('exam_status_changed');
  }

  // hall_session_update — a hall session was started or ended
  onHallSessionUpdate(
    callback: (data: { hallId: string; sessionId: string; event: 'started' | 'ended'; hallName?: string }) => void
  ): void {
    this.socket?.on('hall_session_update', callback);
  }

  offHallSessionUpdate(): void {
    this.socket?.off('hall_session_update');
  }
}

export default new SocketService();
