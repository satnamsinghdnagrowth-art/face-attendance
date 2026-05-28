"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSockets = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = __importDefault(require("../config/env"));
const logger_1 = __importDefault(require("../utils/logger"));
const redis_1 = require("../config/redis");
const authenticateSocket = async (socket, next) => {
    try {
        const token = socket.handshake.auth['token'] ||
            socket.handshake.headers['authorization']?.replace('Bearer ', '');
        if (!token) {
            next(new Error('Authentication token is required'));
            return;
        }
        const isBlacklisted = await redis_1.redisClient.get(`blacklist:${token}`);
        if (isBlacklisted) {
            next(new Error('Token has been revoked'));
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, env_1.default.JWT_ACCESS_SECRET);
        socket.user = decoded;
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            next(new Error('Token has expired'));
        }
        else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            next(new Error('Invalid token'));
        }
        else {
            next(new Error('Authentication failed'));
        }
    }
};
const initializeSockets = (io) => {
    io.use((socket, next) => {
        authenticateSocket(socket, next);
    });
    io.on('connection', (socket) => {
        const authSocket = socket;
        const user = authSocket.user;
        if (!user) {
            socket.disconnect(true);
            return;
        }
        logger_1.default.info('Socket connected', {
            socketId: socket.id,
            userId: user.userId,
            role: user.role,
        });
        socket.join(`user:${user.userId}`);
        socket.join(`role:${user.role}`);
        const joinClassRoom = async (classId) => {
            const room = `class:${classId}`;
            await socket.join(room);
            const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
            socket.emit('joined_class_room', { class_id: classId, room, participant_count: roomSize });
            logger_1.default.debug('Socket joined class room', { socketId: socket.id, userId: user.userId, classId });
        };
        socket.on('join_class', async (data) => {
            if (!data?.class_id) {
                socket.emit('error', { message: 'class_id is required' });
                return;
            }
            await joinClassRoom(data.class_id);
        });
        socket.on('join-class-room', async (data) => {
            const classId = data?.classId || data?.class_id;
            if (!classId) {
                socket.emit('error', { message: 'classId is required' });
                return;
            }
            await joinClassRoom(classId);
        });
        socket.on('leave_class', async (data) => {
            if (!data?.class_id)
                return;
            const room = `class:${data.class_id}`;
            await socket.leave(room);
            socket.emit('left_class_room', { class_id: data.class_id });
            logger_1.default.debug('Socket left class room', { socketId: socket.id, userId: user.userId, classId: data.class_id });
        });
        socket.on('leave-class-room', async (data) => {
            const classId = data?.classId || data?.class_id;
            if (!classId)
                return;
            await socket.leave(`class:${classId}`);
        });
        socket.on('join_session', async (data) => {
            if (!data?.session_id)
                return;
            const room = `session:${data.session_id}`;
            await socket.join(room);
            socket.emit('joined_session', { session_id: data.session_id });
        });
        socket.on('leave_session', async (data) => {
            if (!data?.session_id)
                return;
            await socket.leave(`session:${data.session_id}`);
        });
        socket.on('get-session-state', async (data) => {
            if (!data?.sessionId) {
                socket.emit('error', { message: 'sessionId is required' });
                return;
            }
            try {
                const { query } = await Promise.resolve().then(() => __importStar(require('../config/database')));
                const result = await query(`SELECT as2.*, COUNT(ar.id) as marked_count
           FROM attendance_sessions as2
           LEFT JOIN attendance_records ar ON ar.session_id = as2.id
           WHERE as2.id = $1
           GROUP BY as2.id`, [data.sessionId]);
                socket.emit('session-state', result.rows[0] || null);
            }
            catch (error) {
                socket.emit('error', { message: 'Failed to fetch session state' });
            }
        });
        socket.on('ping', () => {
            socket.emit('pong', { timestamp: new Date().toISOString() });
        });
        socket.on('disconnect', (reason) => {
            logger_1.default.info('Socket disconnected', {
                socketId: socket.id,
                userId: user.userId,
                reason,
            });
        });
        socket.on('error', (error) => {
            logger_1.default.error('Socket error', {
                socketId: socket.id,
                userId: user.userId,
                error: error.message,
            });
        });
    });
    io.on('connect_error', (error) => {
        logger_1.default.error('Socket.IO connection error', { error: error.message });
    });
    logger_1.default.info('Socket.IO initialized with attendance handlers');
};
exports.initializeSockets = initializeSockets;
//# sourceMappingURL=attendance.socket.js.map