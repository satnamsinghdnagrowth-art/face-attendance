"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const response_1 = require("../utils/response");
const database_1 = require("../config/database");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.get('/stats', async (req, res, next) => {
    try {
        const authReq = req;
        if (!authReq.user)
            throw new error_middleware_1.UnauthorizedError();
        const [studentsRes, teachersRes, classesRes, sessionsRes] = await Promise.all([
            (0, database_1.query)(`SELECT COUNT(*) as count FROM users WHERE role = 'student' AND is_active = true`),
            (0, database_1.query)(`SELECT COUNT(*) as count FROM users WHERE role = 'teacher' AND is_active = true`),
            (0, database_1.query)(`SELECT COUNT(*) as count FROM classes`),
            (0, database_1.query)(`SELECT COUNT(*) as count FROM attendance_sessions WHERE status = 'active'`),
        ]);
        const todayRes = await (0, database_1.query)(`
      SELECT
        COUNT(ar.id) as total,
        COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present
      FROM attendance_records ar
      JOIN attendance_sessions ases ON ases.id = ar.session_id
      WHERE ases.created_at::date = CURRENT_DATE
    `);
        const todayStats = todayRes.rows[0];
        const total = parseInt(todayStats?.total || '0');
        const present = parseInt(todayStats?.present || '0');
        const todayRate = total > 0 ? Math.round((present / total) * 100) : 0;
        (0, response_1.successResponse)(res, {
            total_students: parseInt(studentsRes.rows[0]?.count || '0'),
            total_teachers: parseInt(teachersRes.rows[0]?.count || '0'),
            total_classes: parseInt(classesRes.rows[0]?.count || '0'),
            today_attendance_rate: todayRate,
            active_sessions: parseInt(sessionsRes.rows[0]?.count || '0'),
            unread_notifications: 0,
        }, 'Dashboard stats retrieved');
    }
    catch (error) {
        next(error);
    }
});
router.get('/activity', async (req, res, next) => {
    try {
        const authReq = req;
        if (!authReq.user)
            throw new error_middleware_1.UnauthorizedError();
        const limit = parseInt(req.query['limit'] || '10');
        const result = await (0, database_1.query)(`
      SELECT
        ar.id,
        u.name as student_name,
        ar.status,
        ar.marked_at,
        ases.class_id,
        c.name as class_name
      FROM attendance_records ar
      JOIN users u ON u.id = ar.student_id
      JOIN attendance_sessions ases ON ases.id = ar.session_id
      JOIN classes c ON c.id = ases.class_id
      ORDER BY ar.marked_at DESC
      LIMIT $1
    `, [limit]);
        (0, response_1.successResponse)(res, result.rows, 'Recent activity retrieved');
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map