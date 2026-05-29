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
  private currentToken: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  // Separate counter for auth-error recovery attempts — not reset on reconnect,
  // only on successful connection, so we can't loop indefinitely.
  private authRetryCount = 0;
  private maxAuthRetries = 2;
  private authRetryScheduled = false;

  private teardown(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  connect(token: string): void {
    if (this.socket?.connected) {
      return;
    }

    this.teardown();
    this.currentToken = token;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      // Disable socket.io's built-in reconnection — we manage auth-aware reconnection ourselves.
      reconnection: false,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.authRetryCount = 0;
      this.authRetryScheduled = false;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      // Reconnect for non-auth disconnects (server restart, network blip, etc.)
      if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'transport error') {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * this.reconnectAttempts, 5000);
          setTimeout(() => {
            if (this.currentToken) this.connect(this.currentToken);
          }, delay);
        }
      }
    });

    this.socket.on('connect_error', async (error) => {
      console.warn('[Socket] Connection error:', error.message);

      // Already scheduled a recovery — don't pile on.
      if (this.authRetryScheduled) return;

      const msgLower = error.message.toLowerCase();
      const isAuthError = AUTH_ERROR_PATTERNS.some((p) => msgLower.includes(p));

      if (!isAuthError) return;

      // Hard ceiling: if we've already tried maxAuthRetries times with a fresh token
      // and still failing, stop looping. updateToken() will re-enable recovery when
      // the Axios interceptor provides a genuinely new token.
      if (this.authRetryCount >= this.maxAuthRetries) {
        console.warn('[Socket] Auth recovery limit reached — waiting for token refresh via REST');
        return;
      }

      try {
        const freshToken = await SecureStore.getItemAsync('access_token');

        if (!freshToken) {
          // No token — user is logged out, nothing to do.
          return;
        }

        if (freshToken !== this.currentToken) {
          // A newer token is already in store (Axios refreshed it) — reconnect now.
          console.log('[Socket] Newer token found — reconnecting immediately');
          this.authRetryCount++;
          this.authRetryScheduled = true;
          this.teardown();
          this.reconnectAttempts = 0;
          setTimeout(() => {
            this.authRetryScheduled = false;
            this.connect(freshToken);
          }, 300);
        } else {
          // Same expired token — wait once for Axios to refresh it, then retry.
          // If it's still the same after the wait, give up and rely on updateToken().
          this.authRetryCount++;
          this.authRetryScheduled = true;
          const delay = 3000 * this.authRetryCount;
          console.log(`[Socket] Same token still failing — waiting ${delay}ms for REST refresh`);
          setTimeout(async () => {
            this.authRetryScheduled = false;
            const latestToken = await SecureStore.getItemAsync('access_token');
            if (latestToken && latestToken !== this.currentToken) {
              console.log('[Socket] Token refreshed during wait — reconnecting');
              this.teardown();
              this.reconnectAttempts = 0;
              this.connect(latestToken);
            } else {
              console.log('[Socket] Token unchanged after wait — standing by for REST refresh');
            }
          }, delay);
        }
      } catch {
        this.authRetryScheduled = false;
      }
    });

    this.socket.on('error', (error) => {
      console.warn('[Socket] Error:', error);
    });
  }

  /**
   * Called by the Axios interceptor after a successful token refresh.
   * Reconnects the socket with the new token regardless of current state.
   */
  updateToken(newToken: string): void {
    if (this.socket?.connected && newToken === this.currentToken) {
      return;
    }
    console.log('[Socket] Token refreshed via REST — reconnecting socket');
    this.authRetryCount = 0;
    this.authRetryScheduled = false;
    this.reconnectAttempts = 0;
    this.teardown();
    this.connect(newToken);
  }

  disconnect(): void {
    this.currentToken = null;
    this.authRetryCount = 0;
    this.authRetryScheduled = false;
    this.reconnectAttempts = 0;
    this.teardown();
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
