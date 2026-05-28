import { Router } from 'express';
import {
  startSession, endSession, getSession, getTeacherSessions, getActiveSessions,
  markAttendance, scanAttendance, getAttendanceHistory,
  getClassAttendance, updateAttendance, getStudentSummary,
  startSessionValidators, markAttendanceValidators,
  scanAttendanceValidators, updateAttendanceValidators,
} from '../controllers/attendance.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireTeacher, requireAdmin } from '../middleware/role.middleware';
import { uploadAttendanceImage, handleMulterError } from '../middleware/upload.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

// All attendance routes require authentication
router.use(authenticateToken);

// Session management (teachers & admins)
router.post('/sessions/start', requireTeacher, startSessionValidators, validate, startSession);
router.post('/sessions/:id/end', requireTeacher, endSession);
router.get('/sessions', getTeacherSessions);
router.get('/sessions/active', getActiveSessions);
router.get('/sessions/:id', getSession);

// Mark attendance (teacher or admin) — /mark and /manual-mark are the same handler
const markAttendanceMiddleware = [
  requireTeacher,
  uploadAttendanceImage.single('image'),
  handleMulterError,
  markAttendanceValidators,
  validate,
  markAttendance,
];
router.post('/mark', ...markAttendanceMiddleware);
router.post('/manual-mark', ...markAttendanceMiddleware);

// Face scan & auto-identify student
router.post(
  '/scan',
  requireTeacher,
  uploadAttendanceImage.single('image'),
  handleMulterError,
  scanAttendanceValidators,
  validate,
  scanAttendance
);

// View attendance history (students see own, teachers/admins see any)
router.get('/history', getAttendanceHistory);

// Class-level attendance report
router.get('/class/:classId', requireTeacher, getClassAttendance);

// Manual override
router.put('/:id', requireTeacher, updateAttendanceValidators, validate, updateAttendance);

// Student summary
router.get('/summary/:studentId', getStudentSummary);

export default router;
