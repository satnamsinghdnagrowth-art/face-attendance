"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const report_controller_1 = require("../controllers/report.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.get('/daily', role_middleware_1.requireTeacher, report_controller_1.getDailyReport);
router.get('/monthly', role_middleware_1.requireTeacher, report_controller_1.getMonthlyReport);
router.get('/student/:studentId', report_controller_1.getStudentReport);
router.get('/defaulters', role_middleware_1.requireTeacher, report_controller_1.getDefaulters);
router.get('/analytics/overview', role_middleware_1.requireAdmin, report_controller_1.getAnalyticsOverview);
router.get('/export/csv', role_middleware_1.requireTeacher, report_controller_1.exportCSV);
exports.default = router;
//# sourceMappingURL=report.routes.js.map