"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = exports.NotificationService = exports.setSocketIO = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
let ioInstance = null;
const setSocketIO = (io) => {
    ioInstance = io;
    logger_1.default.info('Socket.IO instance set in notification service');
};
exports.setSocketIO = setSocketIO;
const getIO = () => ioInstance;
class NotificationService {
    notifyAttendanceMarked(classId, payload) {
        const io = getIO();
        if (!io)
            return;
        io.to(`class:${classId}`).emit('attendance_marked', payload);
        logger_1.default.debug('Attendance marked notification sent', { classId, studentId: payload.studentId });
    }
    notifySessionStarted(classId, payload) {
        const io = getIO();
        if (!io)
            return;
        io.to(`class:${classId}`).emit('session_started', payload);
        logger_1.default.debug('Session started notification sent', { classId, sessionId: payload.sessionId });
    }
    notifySessionEnded(classId, payload) {
        const io = getIO();
        if (!io)
            return;
        io.to(`class:${classId}`).emit('session_ended', payload);
        logger_1.default.debug('Session ended notification sent', { classId, sessionId: payload.sessionId });
    }
    broadcastToRole(role, event, data) {
        const io = getIO();
        if (!io)
            return;
        io.to(`role:${role}`).emit(event, data);
        logger_1.default.debug('Role broadcast sent', { role, event });
    }
    broadcastToUser(userId, event, data) {
        const io = getIO();
        if (!io)
            return;
        io.to(`user:${userId}`).emit(event, data);
        logger_1.default.debug('User notification sent', { userId, event });
    }
    emitFaceScanResult(socketId, result) {
        const io = getIO();
        if (!io)
            return;
        io.to(socketId).emit('face-scan-result', result);
        logger_1.default.debug('Face scan result emitted', { socketId, matched: result.matched });
    }
    broadcastSystemAlert(message, level = 'info') {
        const io = getIO();
        if (!io)
            return;
        io.emit('system-alert', { message, level, timestamp: new Date() });
        logger_1.default.info('System alert broadcast', { message, level });
    }
    getConnectedCount() {
        const io = getIO();
        if (!io)
            return 0;
        return io.engine.clientsCount;
    }
    getRoomSize(roomName) {
        const io = getIO();
        if (!io)
            return 0;
        return io.sockets.adapter.rooms.get(roomName)?.size || 0;
    }
}
exports.NotificationService = NotificationService;
exports.notificationService = new NotificationService();
exports.default = exports.notificationService;
//# sourceMappingURL=notification.service.js.map