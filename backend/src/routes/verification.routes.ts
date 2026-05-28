import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { uploadAttendanceImage, handleMulterError } from '../middleware/upload.middleware';
import { validate } from '../middleware/validate.middleware';
import * as verifyCtrl from '../controllers/verification.controller';

const router = Router();
router.use(authenticateToken);

const requireInvigilator = requireRole(
  'admin',
  'super_admin',
  'hall_invigilator',
  'teacher',
  'chief_examiner'
);

router.post(
  '/entry',
  requireInvigilator,
  uploadAttendanceImage.single('face_image'),
  handleMulterError,
  verifyCtrl.entryVerifyValidators,
  validate,
  verifyCtrl.verifyEntry
);

router.post(
  '/re-check',
  requireInvigilator,
  uploadAttendanceImage.single('face_image'),
  handleMulterError,
  verifyCtrl.reVerifyValidators,
  validate,
  verifyCtrl.reVerify
);

router.get('/events/:sessionId', verifyCtrl.getVerificationEvents);
router.get('/student/:studentId/exam/:examId', verifyCtrl.getStudentEvents);

export default router;
