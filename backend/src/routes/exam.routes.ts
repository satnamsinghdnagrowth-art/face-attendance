import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireAdmin, requireRole } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import * as examCtrl from '../controllers/exam.controller';

const router = Router();
router.use(authenticateToken);

// Chief examiner or admin can manage exams
const requireExamAdmin = requireRole('admin', 'super_admin', 'chief_examiner');

// ─── Session routes — must come BEFORE /:examId to prevent param collision ───
router.post(
  '/sessions/:sessionId/end',
  requireRole('admin', 'super_admin', 'hall_invigilator'),
  examCtrl.endHallSession
);
router.get('/sessions/:sessionId/students', examCtrl.getHallStudents);

// ─── Alert routes — must come BEFORE /:examId ────────────────────────────────
router.patch('/alerts/:alertId/resolve', requireExamAdmin, examCtrl.resolveAlert);

// ─── Event review route — must come BEFORE /:examId ──────────────────────────
router.patch('/events/:eventId/review', requireExamAdmin, examCtrl.reviewVerificationEvent);

// ─── Exam CRUD ────────────────────────────────────────────────────────────────
router.post(
  '/',
  requireAdmin,
  examCtrl.createExamValidators,
  validate,
  examCtrl.createExam
);
router.get('/', examCtrl.listExams);
router.get('/:examId/stats', examCtrl.getExamStats);
router.get('/:examId/alerts', examCtrl.getActiveAlerts);
router.get('/:examId/enrollments', examCtrl.getEnrollments);
router.get('/:examId', examCtrl.getExam);
router.patch('/:examId', requireAdmin, examCtrl.updateExam);

// ─── Hall management ──────────────────────────────────────────────────────────
router.post(
  '/:examId/halls',
  requireAdmin,
  examCtrl.createHallValidators,
  validate,
  examCtrl.createHall
);
router.get('/:examId/halls', examCtrl.getHalls);
router.post(
  '/:examId/halls/:hallId/enroll',
  requireAdmin,
  examCtrl.enrollStudentsValidators,
  validate,
  examCtrl.enrollStudents
);
router.post(
  '/:examId/halls/:hallId/session/start',
  requireRole('admin', 'super_admin', 'hall_invigilator'),
  examCtrl.startHallSession
);

export default router;
