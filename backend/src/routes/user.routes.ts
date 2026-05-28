import { Router } from 'express';
import {
  listUsers, getUserById, updateUser, deleteUser,
  uploadUserPhoto, getStudentAttendanceSummary, activateUser,
  listUsersValidators, updateUserValidators,
} from '../controllers/user.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireAdmin, requireTeacher } from '../middleware/role.middleware';
import { uploadPhoto, handleMulterError } from '../middleware/upload.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

// All user routes require authentication
router.use(authenticateToken);

// List & create
router.get('/', requireTeacher, listUsersValidators, validate, listUsers);

// Individual user routes
router.get('/:id', getUserById);
router.put('/:id', updateUserValidators, validate, updateUser);
router.delete('/:id', requireAdmin, deleteUser);
router.patch('/:id/activate', requireAdmin, activateUser);

// Profile photo
router.post(
  '/:id/photo',
  uploadPhoto.single('photo'),
  handleMulterError,
  uploadUserPhoto
);

// Attendance summary
router.get('/:id/attendance-summary', requireTeacher, getStudentAttendanceSummary);

export default router;
