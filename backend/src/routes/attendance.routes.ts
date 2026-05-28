import { Router } from 'express';
import {
  startSession, endSession, getSession, getTeacherSessions, getActiveSessions,
  markAttendance, scanAttendance, getAttendanceHistory,
  getClassAttendance, updateAttendance, getStudentSummary,
  startSessionValidators, markAttendanceValidators,
  scanAttendanceValidators, updateAttendanceValidators,
  getAttendanceTrend, getAttendanceDefaulters, exportAttendanceReport,
} from '../controllers/attendance.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireTeacher } from '../middleware/role.middleware';
import { uploadAttendanceImage, handleMulterError } from '../middleware/upload.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

// All attendance routes require authentication
router.use(authenticateToken);

// ─── Analytics (must come before /:id to avoid param conflicts) ───────────────
router.get('/trend', getAttendanceTrend);
router.get('/defaulters', getAttendanceDefaulters);
router.get('/export', exportAttendanceReport);

// ─── Session management ───────────────────────────────────────────────────────
router.post('/sessions/start', requireTeacher, startSessionValidators, validate, startSession);
router.post('/sessions/:id/end', requireTeacher, endSession);
router.get('/sessions/active', getActiveSessions);
router.get('/sessions', getTeacherSessions);
router.get('/sessions/:id', getSession);

// ─── Mark attendance (teacher) ────────────────────────────────────────────────
const markMiddleware = [
  requireTeacher,
  uploadAttendanceImage.single('image'),
  handleMulterError,
  markAttendanceValidators,
  validate,
  markAttendance,
];
router.post('/mark', ...markMiddleware);
router.post('/manual-mark', ...markMiddleware);

// ─── Face scan & auto-identify ────────────────────────────────────────────────
router.post(
  '/scan',
  requireTeacher,
  uploadAttendanceImage.single('image'),
  handleMulterError,
  scanAttendanceValidators,
  validate,
  scanAttendance
);

// ─── History (my-history is an alias for student-facing history) ──────────────
router.get('/my-history', getAttendanceHistory);
router.get('/history', getAttendanceHistory);

// ─── Class-level report ───────────────────────────────────────────────────────
router.get('/class/:classId', requireTeacher, getClassAttendance);

// ─── Student summary ──────────────────────────────────────────────────────────
router.get('/summary/:studentId', getStudentSummary);

// ─── Manual override (must come after named routes) ───────────────────────────
router.put('/:id', requireTeacher, updateAttendanceValidators, validate, updateAttendance);

export default router;
