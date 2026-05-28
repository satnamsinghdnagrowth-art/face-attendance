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
exports.getStudentSummary = exports.updateAttendance = exports.getClassAttendance = exports.getAttendanceHistory = exports.scanAttendance = exports.markAttendance = exports.getTeacherSessions = exports.getActiveSessions = exports.getSession = exports.endSession = exports.startSession = exports.updateAttendanceValidators = exports.scanAttendanceValidators = exports.markAttendanceValidators = exports.startSessionValidators = void 0;
const express_validator_1 = require("express-validator");
const attendance_service_1 = require("../services/attendance.service");
const face_service_1 = require("../services/face.service");
const notification_service_1 = require("../services/notification.service");
const face_utils_1 = require("../utils/face.utils");
const response_1 = require("../utils/response");
const face_utils_2 = require("../utils/face.utils");
const error_middleware_1 = require("../middleware/error.middleware");
const logger_1 = __importDefault(require("../utils/logger"));
exports.startSessionValidators = [
    (0, express_validator_1.body)('class_id').notEmpty().isUUID().withMessage('Valid class ID is required'),
    (0, express_validator_1.body)('subject_id').notEmpty().isUUID().withMessage('Valid subject ID is required'),
    (0, express_validator_1.body)('location.latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    (0, express_validator_1.body)('location.longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    (0, express_validator_1.body)('notes').optional().isString().isLength({ max: 500 }),
];
exports.markAttendanceValidators = [
    (0, express_validator_1.body)('session_id').notEmpty().isUUID().withMessage('Valid session ID is required'),
    (0, express_validator_1.body)('student_id').notEmpty().isUUID().withMessage('Valid student ID is required'),
    (0, express_validator_1.body)('status')
        .optional()
        .isIn(['present', 'absent', 'late', 'leave', 'manual_override'])
        .withMessage('Invalid attendance status'),
];
exports.scanAttendanceValidators = [
    (0, express_validator_1.body)('session_id').notEmpty().isUUID().withMessage('Valid session ID is required'),
    (0, express_validator_1.body)('embedding').notEmpty().withMessage('Face embedding is required'),
];
exports.updateAttendanceValidators = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid attendance record ID'),
    (0, express_validator_1.body)('status')
        .isIn(['present', 'absent', 'late', 'leave', 'manual_override'])
        .withMessage('Invalid status'),
];
const startSession = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { class_id, subject_id, location: loc, notes } = req.body;
        const location = loc?.latitude !== undefined && loc?.longitude !== undefined
            ? { latitude: loc.latitude, longitude: loc.longitude }
            : undefined;
        const session = await attendance_service_1.attendanceService.startSession(req.user.userId, class_id, subject_id, location, notes);
        notification_service_1.notificationService.notifySessionStarted(class_id, {
            sessionId: session.id,
            classId: class_id,
            subjectId: subject_id,
            teacherId: req.user.userId,
            startTime: session.start_time,
        });
        logger_1.default.info('Session started by teacher', { sessionId: session.id, teacherId: req.user.userId });
        (0, response_1.createdResponse)(res, session, 'Attendance session started');
    }
    catch (error) {
        next(error);
    }
};
exports.startSession = startSession;
const endSession = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { id: sessionId } = req.params;
        const session = await attendance_service_1.attendanceService.getSessionById(sessionId);
        const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
        const teacherId = isAdmin ? session.teacher_id : req.user.userId;
        await attendance_service_1.attendanceService.endSession(sessionId, teacherId);
        notification_service_1.notificationService.notifySessionEnded(session.class_id, {
            sessionId,
            classId: session.class_id,
            subjectId: session.subject_id,
            teacherId: session.teacher_id,
            endTime: new Date(),
        });
        (0, response_1.successResponse)(res, null, 'Session ended. Absent students have been auto-marked.');
    }
    catch (error) {
        next(error);
    }
};
exports.endSession = endSession;
const getSession = async (req, res, next) => {
    try {
        const { id } = req.params;
        const session = await attendance_service_1.attendanceService.getSessionById(id);
        const records = await attendance_service_1.attendanceService.getSessionAttendance(id);
        (0, response_1.successResponse)(res, { session, records }, 'Session retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getSession = getSession;
const getActiveSessions = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { query: dbQuery } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const isStudent = req.user.role === 'student';
        let result;
        if (isStudent) {
            result = await dbQuery(`SELECT ases.*, c.name as class_name, s.name as subject_name
         FROM attendance_sessions ases
         JOIN classes c ON c.id = ases.class_id
         LEFT JOIN subjects s ON s.id = ases.subject_id
         JOIN class_enrollments ce ON ce.class_id = ases.class_id AND ce.student_id = $1
         WHERE ases.status = 'active'
         ORDER BY ases.start_time DESC`, [req.user.userId]);
        }
        else {
            result = await dbQuery(`SELECT ases.*, c.name as class_name, s.name as subject_name
         FROM attendance_sessions ases
         JOIN classes c ON c.id = ases.class_id
         LEFT JOIN subjects s ON s.id = ases.subject_id
         WHERE ases.status = 'active'
         ORDER BY ases.start_time DESC`);
        }
        (0, response_1.successResponse)(res, result.rows, 'Active sessions retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getActiveSessions = getActiveSessions;
const getTeacherSessions = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { page, limit } = (0, response_1.getPaginationParams)(req.query);
        const { classId, status } = req.query;
        const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
        const teacherId = isAdmin && req.query['teacherId']
            ? req.query['teacherId']
            : req.user.userId;
        const { sessions, total } = await attendance_service_1.attendanceService.getTeacherSessions(isAdmin ? (req.query['teacherId'] || req.user.userId) : req.user.userId, { classId, status, page, limit });
        (0, response_1.paginatedResponse)(res, sessions, total, page, limit);
    }
    catch (error) {
        next(error);
    }
};
exports.getTeacherSessions = getTeacherSessions;
const markAttendance = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { session_id, student_id, confidence = 1.0, status, location } = req.body;
        const sessionId = session_id;
        const studentId = student_id;
        let imageUrl;
        if (req.file) {
            const { storageService: ss } = await Promise.resolve().then(() => __importStar(require('../services/storage.service')));
            imageUrl = await ss.saveFile(req.file, 'attendance');
        }
        const record = await attendance_service_1.attendanceService.markAttendance(sessionId, studentId, confidence, imageUrl, location, req.user.userId);
        const { query: dbQuery } = await Promise.resolve().then(() => __importStar(require('../config/database')));
        const studentResult = await dbQuery('SELECT u.name, ar.class_id FROM users u JOIN attendance_records ar ON ar.student_id = u.id WHERE u.id = $1 AND ar.id = $2', [studentId, record.id]);
        if (studentResult.rows.length > 0) {
            const studentInfo = studentResult.rows[0];
            notification_service_1.notificationService.notifyAttendanceMarked(studentInfo.class_id, {
                sessionId,
                studentId,
                studentName: studentInfo.name,
                status: record.status,
                confidence,
                markedAt: record.marked_at,
            });
        }
        (0, response_1.successResponse)(res, record, 'Attendance marked successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.markAttendance = markAttendance;
const scanAttendance = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { session_id, embedding: rawEmbedding, location } = req.body;
        const sessionId = session_id;
        let embedding;
        let imageUrl;
        if (req.file) {
            try {
                embedding = await (0, face_utils_2.computeImageEmbedding)(req.file.path);
            }
            catch (imgErr) {
                logger_1.default.warn('Scan image embedding failed, falling back to client embedding', { error: imgErr });
                const raw = typeof rawEmbedding === 'string' ? JSON.parse(rawEmbedding) : rawEmbedding;
                embedding = raw;
            }
            const { storageService: ss } = await Promise.resolve().then(() => __importStar(require('../services/storage.service')));
            imageUrl = await ss.saveFile(req.file, 'attendance');
        }
        else {
            embedding = typeof rawEmbedding === 'string'
                ? JSON.parse(rawEmbedding)
                : rawEmbedding;
        }
        const validation = (0, face_utils_1.validateEmbedding)(embedding);
        if (!validation.valid) {
            (0, response_1.errorResponse)(res, validation.error || 'Invalid embedding', 400);
            return;
        }
        const session = await attendance_service_1.attendanceService.getSessionById(sessionId);
        if (session.status !== 'active') {
            (0, response_1.errorResponse)(res, 'Session is not active', 400);
            return;
        }
        const match = await face_service_1.faceService.findMatchingStudent(session.class_id, embedding);
        if (!match) {
            (0, response_1.successResponse)(res, {
                success: false,
                student_id: null,
                student_name: null,
                confidence: 0,
                message: 'No matching student found',
            }, 'Face scan completed - no match');
            return;
        }
        const record = await attendance_service_1.attendanceService.markAttendance(sessionId, match.student.id, match.confidence, imageUrl, location, req.user.userId);
        notification_service_1.notificationService.notifyAttendanceMarked(session.class_id, {
            sessionId,
            studentId: match.student.id,
            studentName: match.student.name,
            status: record.status,
            confidence: match.confidence,
            markedAt: record.marked_at,
        });
        (0, response_1.successResponse)(res, {
            success: true,
            student_id: match.student.id,
            student_name: match.student.name,
            confidence: match.confidence,
            status: record.status,
            record_id: record.id,
            message: 'Student identified and attendance marked',
        }, 'Student identified and attendance marked');
    }
    catch (error) {
        next(error);
    }
};
exports.scanAttendance = scanAttendance;
const getAttendanceHistory = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { page, limit } = (0, response_1.getPaginationParams)(req.query);
        const { classId, subjectId, dateFrom, dateTo, status } = req.query;
        const isAdmin = ['admin', 'super_admin', 'teacher'].includes(req.user.role);
        const studentId = isAdmin && req.query['studentId']
            ? req.query['studentId']
            : req.user.userId;
        const { records, total } = await attendance_service_1.attendanceService.getStudentAttendance(studentId, {
            classId,
            subjectId,
            dateFrom,
            dateTo,
            status,
            page,
            limit,
        });
        (0, response_1.paginatedResponse)(res, records, total, page, limit);
    }
    catch (error) {
        next(error);
    }
};
exports.getAttendanceHistory = getAttendanceHistory;
const getClassAttendance = async (req, res, next) => {
    try {
        const { classId } = req.params;
        const { dateFrom, dateTo } = req.query;
        const records = await attendance_service_1.attendanceService.getClassAttendance(classId, dateFrom, dateTo);
        (0, response_1.successResponse)(res, records, 'Class attendance retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getClassAttendance = getClassAttendance;
const updateAttendance = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { id } = req.params;
        const { status } = req.body;
        await attendance_service_1.attendanceService.updateAttendanceStatus(id, status, req.user.userId);
        (0, response_1.successResponse)(res, null, 'Attendance updated successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.updateAttendance = updateAttendance;
const getStudentSummary = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { studentId } = req.params;
        const { classId, subjectId, dateFrom, dateTo } = req.query;
        const isAdmin = ['admin', 'super_admin', 'teacher'].includes(req.user.role);
        if (!isAdmin && req.user.userId !== studentId) {
            throw new error_middleware_1.CustomError('Access denied', 403);
        }
        const { summary } = await attendance_service_1.attendanceService.getStudentAttendance(studentId, {
            classId,
            subjectId,
            dateFrom,
            dateTo,
        });
        (0, response_1.successResponse)(res, summary, 'Attendance summary retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getStudentSummary = getStudentSummary;
//# sourceMappingURL=attendance.controller.js.map