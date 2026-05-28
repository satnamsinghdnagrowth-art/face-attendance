"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateUser = exports.getStudentAttendanceSummary = exports.uploadUserPhoto = exports.deleteUser = exports.updateUser = exports.getUserById = exports.listUsers = exports.updateUserValidators = exports.listUsersValidators = void 0;
const express_validator_1 = require("express-validator");
const database_1 = require("../config/database");
const response_1 = require("../utils/response");
const error_middleware_1 = require("../middleware/error.middleware");
const storage_service_1 = require("../services/storage.service");
const attendance_service_1 = require("../services/attendance.service");
const logger_1 = __importDefault(require("../utils/logger"));
exports.listUsersValidators = [
    (0, express_validator_1.query)('role')
        .optional()
        .isIn(['super_admin', 'admin', 'teacher', 'student'])
        .withMessage('Invalid role filter'),
    (0, express_validator_1.query)('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be boolean'),
    (0, express_validator_1.query)('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    (0, express_validator_1.query)('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
];
exports.updateUserValidators = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid user ID'),
    (0, express_validator_1.body)('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 255 })
        .withMessage('Name must be between 2 and 255 characters'),
    (0, express_validator_1.body)('phone')
        .optional()
        .isMobilePhone('any')
        .withMessage('Invalid phone number'),
    (0, express_validator_1.body)('role')
        .optional()
        .isIn(['admin', 'teacher', 'student'])
        .withMessage('Invalid role'),
];
const listUsers = async (req, res, next) => {
    try {
        const { page, limit, offset } = (0, response_1.getPaginationParams)(req.query);
        const { role, isActive, search, classId } = req.query;
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        if (role) {
            conditions.push(`u.role = $${paramIndex++}`);
            params.push(role);
        }
        if (isActive !== undefined) {
            conditions.push(`u.is_active = $${paramIndex++}`);
            params.push(isActive === 'true');
        }
        if (search) {
            conditions.push(`(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }
        if (classId) {
            conditions.push(`EXISTS (
        SELECT 1 FROM class_enrollments ce
        WHERE ce.student_id = u.id AND ce.class_id = $${paramIndex++}
      )`);
            params.push(classId);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const [usersResult, countResult] = await Promise.all([
            (0, database_1.query)(`SELECT u.id, u.name, u.email, u.phone, u.role, u.photo_url,
                u.is_active, u.last_login, u.created_at
         FROM users u
         ${whereClause}
         ORDER BY u.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, limit, offset]),
            (0, database_1.query)(`SELECT COUNT(*) as count FROM users u ${whereClause}`, params),
        ]);
        const total = parseInt(countResult.rows[0]?.count || '0', 10);
        (0, response_1.paginatedResponse)(res, usersResult.rows, total, page, limit);
    }
    catch (error) {
        next(error);
    }
};
exports.listUsers = listUsers;
const getUserById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await (0, database_1.query)(`SELECT id, name, email, phone, role, photo_url, is_active, last_login, created_at
       FROM users WHERE id = $1`, [id]);
        if (result.rows.length === 0) {
            throw new error_middleware_1.NotFoundError('User');
        }
        (0, response_1.successResponse)(res, result.rows[0], 'User retrieved successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.getUserById = getUserById;
const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!req.user) {
            throw new error_middleware_1.UnauthorizedError();
        }
        const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
        if (!isAdmin && req.user.userId !== id) {
            throw new error_middleware_1.CustomError('You can only update your own profile', 403);
        }
        const { name, phone, role } = req.body;
        if (role && !isAdmin) {
            throw new error_middleware_1.CustomError('Only admins can change user roles', 403);
        }
        const setClauses = ['updated_at = NOW()'];
        const params = [];
        let paramIndex = 1;
        if (name) {
            setClauses.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        if (phone !== undefined) {
            setClauses.push(`phone = $${paramIndex++}`);
            params.push(phone || null);
        }
        if (role && isAdmin) {
            setClauses.push(`role = $${paramIndex++}`);
            params.push(role);
        }
        params.push(id);
        const result = await (0, database_1.query)(`UPDATE users
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, email, phone, role, photo_url, is_active, last_login, created_at`, params);
        if (result.rows.length === 0) {
            throw new error_middleware_1.NotFoundError('User');
        }
        logger_1.default.info('User updated', { userId: id, updatedBy: req.user.userId });
        (0, response_1.successResponse)(res, result.rows[0], 'User updated successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        if (req.user.userId === id) {
            throw new error_middleware_1.CustomError('You cannot delete your own account', 400);
        }
        const result = await (0, database_1.query)('UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            throw new error_middleware_1.NotFoundError('User');
        }
        logger_1.default.info('User soft-deleted', { userId: id, deletedBy: req.user.userId });
        (0, response_1.successResponse)(res, null, 'User deactivated successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.deleteUser = deleteUser;
const uploadUserPhoto = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
        if (!isAdmin && req.user.userId !== id) {
            throw new error_middleware_1.CustomError('You can only upload your own photo', 403);
        }
        if (!req.file) {
            throw new error_middleware_1.CustomError('No photo file provided', 400);
        }
        const oldResult = await (0, database_1.query)('SELECT photo_url FROM users WHERE id = $1', [id]);
        const photoUrl = await storage_service_1.storageService.saveFile(req.file, 'photos', {
            resize: { width: 400, height: 400 },
            quality: 85,
        });
        const oldPhoto = oldResult.rows[0]?.photo_url;
        if (oldPhoto) {
            await storage_service_1.storageService.deleteFile(oldPhoto).catch(() => { });
        }
        await (0, database_1.query)('UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2', [photoUrl, id]);
        logger_1.default.info('User photo uploaded', { userId: id });
        (0, response_1.successResponse)(res, { photoUrl }, 'Photo uploaded successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.uploadUserPhoto = uploadUserPhoto;
const getStudentAttendanceSummary = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const isAdmin = ['admin', 'super_admin', 'teacher'].includes(req.user.role);
        if (!isAdmin && req.user.userId !== id) {
            throw new error_middleware_1.CustomError('Access denied', 403);
        }
        const { classId, subjectId, dateFrom, dateTo } = req.query;
        const { summary } = await attendance_service_1.attendanceService.getStudentAttendance(id, {
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
exports.getStudentAttendanceSummary = getStudentAttendanceSummary;
const activateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await (0, database_1.query)('UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            throw new error_middleware_1.NotFoundError('User');
        }
        (0, response_1.successResponse)(res, null, 'User activated successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.activateUser = activateUser;
//# sourceMappingURL=user.controller.js.map