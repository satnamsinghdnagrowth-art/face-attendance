import { Server } from 'socket.io';
import { AttendanceStatus, UserRole, SocketAttendancePayload, SocketSessionPayload } from '../types';
export declare const setSocketIO: (io: Server) => void;
export declare class NotificationService {
    notifyAttendanceMarked(classId: string, payload: SocketAttendancePayload): void;
    notifySessionStarted(classId: string, payload: SocketSessionPayload): void;
    notifySessionEnded(classId: string, payload: SocketSessionPayload): void;
    broadcastToRole(role: UserRole, event: string, data: unknown): void;
    broadcastToUser(userId: string, event: string, data: unknown): void;
    emitFaceScanResult(socketId: string, result: {
        matched: boolean;
        studentId?: string;
        studentName?: string;
        confidence: number;
        status?: AttendanceStatus;
    }): void;
    broadcastSystemAlert(message: string, level?: 'info' | 'warn' | 'error'): void;
    getConnectedCount(): number;
    getRoomSize(roomName: string): number;
}
export declare const notificationService: NotificationService;
export default notificationService;
//# sourceMappingURL=notification.service.d.ts.map