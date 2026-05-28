import { Router } from 'express';
import {
  getDailyReport, getMonthlyReport, getStudentReport,
  getDefaulters, getAnalyticsOverview, exportCSV,
} from '../controllers/report.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireAdmin, requireTeacher } from '../middleware/role.middleware';

const router = Router();

// All report routes require authentication
router.use(authenticateToken);

// Reports (teachers and admins)
router.get('/daily', requireTeacher, getDailyReport);
router.get('/monthly', requireTeacher, getMonthlyReport);
router.get('/student/:studentId', getStudentReport);
router.get('/defaulters', requireTeacher, getDefaulters);

// Analytics (admin only)
router.get('/analytics/overview', requireAdmin, getAnalyticsOverview);

// Export
router.get('/export/csv', requireTeacher, exportCSV);

export default router;
