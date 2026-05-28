import { Router, Request, Response, NextFunction } from 'express';
import {
  listUsers, getUserById, updateUser, deleteUser,
  uploadUserPhoto, getStudentAttendanceSummary, activateUser,
  listUsersValidators, updateUserValidators,
} from '../controllers/user.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireAdmin, requireTeacher } from '../middleware/role.middleware';
import { uploadPhoto, handleMulterError } from '../middleware/upload.middleware';
import { validate } from '../middleware/validate.middleware';
import { query as dbQuery } from '../config/database';
import { successResponse } from '../utils/response';
import { AuthRequest } from '../types';
import { UnauthorizedError, CustomError } from '../middleware/error.middleware';

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

// Classes taught by a teacher (uses subjects.teacher_id → classes join)
router.get('/:id/classes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) throw new UnauthorizedError();

    const { id } = req.params;
    const isAdmin = ['admin', 'super_admin'].includes(authReq.user.role);

    if (!isAdmin && authReq.user.userId !== id) {
      throw new CustomError('Access denied', 403);
    }

    const result = await dbQuery(
      `SELECT DISTINCT c.id, c.name, c.department, c.semester, c.academic_year
       FROM classes c
       JOIN subjects s ON s.class_id = c.id
       WHERE s.teacher_id = $1::uuid
       ORDER BY c.name`,
      [id]
    );

    successResponse(res, result.rows, 'Teacher classes retrieved');
  } catch (error) {
    next(error);
  }
});

export default router;
