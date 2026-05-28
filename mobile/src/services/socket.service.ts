import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { AttendanceSession, ScanResult } from '@/types';

const SOCKET_URL = 'https://face-attendance-9kza.onrender.com';

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(token: string): void {
    if (this.socket?.connected) {
      return;
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
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', async (error) => {
      console.warn('[Socket] Connection error:', error.message);
      this.reconnectAttempts++;

      // If token expired, grab the latest token (may have been refreshed by axios) and reconnect
      if (error.message.includes('expired') || error.message.includes('Token')) {
        const freshToken = await SecureStore.getItemAsync('access_token');
        if (freshToken && freshToken !== token) {
          console.log('[Socket] Reconnecting with refreshed token');
          this.socket?.disconnect();
          this.socket = null;
          setTimeout(() => this.connect(freshToken), 500);
        }
      }
    });

    this.socket.on('error', (error) => {
      console.warn('[Socket] Error:', error);
    });
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
}

export default new SocketService();
