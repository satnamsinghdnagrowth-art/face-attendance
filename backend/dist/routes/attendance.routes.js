"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const attendance_controller_1 = require("../controllers/attendance.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const upload_middleware_1 = require("../middleware/upload.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.post('/sessions/start', role_middleware_1.requireTeacher, attendance_controller_1.startSessionValidators, validate_middleware_1.validate, attendance_controller_1.startSession);
router.post('/sessions/:id/end', role_middleware_1.requireTeacher, attendance_controller_1.endSession);
router.get('/sessions', attendance_controller_1.getTeacherSessions);
router.get('/sessions/active', attendance_controller_1.getActiveSessions);
router.get('/sessions/:id', attendance_controller_1.getSession);
const markAttendanceMiddleware = [
    role_middleware_1.requireTeacher,
    upload_middleware_1.uploadAttendanceImage.single('image'),
    upload_middleware_1.handleMulterError,
    attendance_controller_1.markAttendanceValidators,
    validate_middleware_1.validate,
    attendance_controller_1.markAttendance,
];
router.post('/mark', ...markAttendanceMiddleware);
router.post('/manual-mark', ...markAttendanceMiddleware);
router.post('/scan', role_middleware_1.requireTeacher, upload_middleware_1.uploadAttendanceImage.single('image'), upload_middleware_1.handleMulterError, attendance_controller_1.scanAttendanceValidators, validate_middleware_1.validate, attendance_controller_1.scanAttendance);
router.get('/history', attendance_controller_1.getAttendanceHistory);
router.get('/class/:classId', role_middleware_1.requireTeacher, attendance_controller_1.getClassAttendance);
router.put('/:id', role_middleware_1.requireTeacher, attendance_controller_1.updateAttendanceValidators, validate_middleware_1.validate, attendance_controller_1.updateAttendance);
router.get('/summary/:studentId', attendance_controller_1.getStudentSummary);
exports.default = router;
//# sourceMappingURL=attendance.routes.js.map