"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSelfOrAdmin = exports.requireSelf = exports.requireStudent = exports.requireSuperAdmin = exports.requireTeacher = exports.requireAdmin = exports.requireRole = void 0;
const response_1 = require("../utils/response");
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            (0, response_1.unauthorizedResponse)(res, 'Authentication required');
            return;
        }
        if (!roles.includes(req.user.role)) {
            (0, response_1.forbiddenResponse)(res, `Access denied. Required roles: ${roles.join(', ')}. Your role: ${req.user.role}`);
            return;
        }
        next();
    };
};
exports.requireRole = requireRole;
exports.requireAdmin = (0, exports.requireRole)('admin', 'super_admin');
exports.requireTeacher = (0, exports.requireRole)('teacher', 'admin', 'super_admin');
exports.requireSuperAdmin = (0, exports.requireRole)('super_admin');
exports.requireStudent = (0, exports.requireRole)('student');
const requireSelf = (userIdExtractor) => {
    return (req, res, next) => {
        if (!req.user) {
            (0, response_1.unauthorizedResponse)(res, 'Authentication required');
            return;
        }
        const targetUserId = userIdExtractor(req);
        const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
        const isSelf = req.user.userId === targetUserId;
        if (!isAdmin && !isSelf) {
            (0, response_1.forbiddenResponse)(res, 'You can only access your own resources');
            return;
        }
        next();
    };
};
exports.requireSelf = requireSelf;
const requireSelfOrAdmin = (userIdParam = 'id') => {
    return (0, exports.requireSelf)((req) => req.params[userIdParam] || '');
};
exports.requireSelfOrAdmin = requireSelfOrAdmin;
//# sourceMappingURL=role.middleware.js.map