import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireAdmin, requireRole } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { uploadPhoto, handleMulterError } from '../middleware/upload.middleware';
import * as examCtrl from '../controllers/exam.controller';

const router = Router();
router.use(authenticateToken);

const requireExamAdmin = requireRole('admin', 'super_admin', 'chief_examiner');

// ─── Session routes — BEFORE /:examId to prevent param collision ──────────────
router.post(
  '/sessions/:sessionId/end',
  requireRole('admin', 'super_admin', 'hall_invigilator'),
  examCtrl.endHallSession
);
router.get('/sessions/:sessionId/students', examCtrl.getHallStudents);

// ─── Alert routes — BEFORE /:examId ──────────────────────────────────────────
router.patch('/alerts/:alertId/resolve', requireExamAdmin, examCtrl.resolveAlert);

// ─── Event review route — BEFORE /:examId ────────────────────────────────────
router.patch('/events/:eventId/review', requireExamAdmin, examCtrl.reviewVerificationEvent);

// ─── Exam CRUD ────────────────────────────────────────────────────────────────
router.post('/', requireAdmin, examCtrl.createExamValidators, validate, examCtrl.createExam);
router.get('/', examCtrl.listExams);
router.get('/:examId/stats', examCtrl.getExamStats);
// ─── Compliance report export (Phase 2) — BEFORE /:examId to avoid collision ─
// GET /api/v2/exams/:examId/export?format=csv|pdf
router.get('/:examId/export', examCtrl.exportExamReport);
router.get('/:examId/alerts', examCtrl.getActiveAlerts);
router.get('/:examId/enrollments', examCtrl.getEnrollments);
router.get('/:examId', examCtrl.getExam);
router.patch('/:examId', requireAdmin, examCtrl.updateExam);

// ─── Exam status transition ───────────────────────────────────────────────────
// PATCH /api/v2/exams/:examId/status  { status: 'active' | 'completed' | 'cancelled' }
router.patch(
  '/:examId/status',
  requireExamAdmin,
  examCtrl.updateExamStatusValidators,
  validate,
  examCtrl.updateExamStatus
);

// ─── Hall management ──────────────────────────────────────────────────────────
router.post('/:examId/halls', requireAdmin, examCtrl.createHallValidators, validate, examCtrl.createHall);
router.get('/:examId/halls', examCtrl.getHalls);

// JSON enrollment
router.post(
  '/:examId/halls/:hallId/enroll',
  requireAdmin,
  examCtrl.enrollStudentsValidators,
  validate,
  examCtrl.enrollStudents
);

// CSV enrollment — accepts a CSV file with columns: student_email, seat_number?, roll_number?
router.post(
  '/:examId/halls/:hallId/enroll/csv',
  requireAdmin,
  uploadPhoto.single('file'),
  handleMulterError,
  examCtrl.enrollFromCSV
);

router.post(
  '/:examId/halls/:hallId/session/start',
  requireRole('admin', 'super_admin', 'hall_invigilator'),
  examCtrl.startHallSession
);

// ─── Push token registration (Phase 2) ───────────────────────────────────────
router.post('/push/register', examCtrl.registerPushToken);
router.delete('/push/register', examCtrl.unregisterPushToken);

// ─── SIS webhook (Phase 3 stub) ───────────────────────────────────────────────
router.post('/sis/webhook', requireAdmin, examCtrl.handleSISWebhook);

export default router;
