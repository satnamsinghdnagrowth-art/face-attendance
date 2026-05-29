import { Response, NextFunction } from 'express';
import { body, query as queryValidator, param } from 'express-validator';
import { AuthRequest, UserRole, PublicUser } from '../types';
import { validateUUID } from '../utils/uuid.validator';
import { query } from '../config/database';
import {
  successResponse,
  paginatedResponse,
  getPaginationParams,
  noContentResponse,
  notFoundResponse,
} from '../utils/response';
import { NotFoundError, CustomError, UnauthorizedError } from '../middleware/error.middleware';
import { storageService } from '../services/storage.service';
import { attendanceService } from '../services/attendance.service';
import logger from '../utils/logger';

// ─── Validators ───────────────────────────────────────────────────────────────
export const listUsersValidators = [
  queryValidator('role')
    .optional()
    .isIn(['super_admin', 'admin', 'teacher', 'student'])
    .withMessage('Invalid role filter'),
  queryValidator('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
  queryValidator('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  queryValidator('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];

export const updateUserValidators = [
  param('id').custom(validateUUID('id')),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Invalid phone number'),
  body('role')
    .optional()
    .isIn(['admin', 'teacher', 'student'])
    .withMessage('Invalid role'),
];

// ─── Controllers ──────────────────────────────────────────────────────────────
export const listUsers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { role, isActive, search, classId } = req.query as {
      role?: UserRole;
      isActive?: string;
      search?: string;
      classId?: string;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (role) {
      conditions.push(`u.role = $${paramIndex++}`);
      params.push(role);
    }

    if (isActive !== undefined) {
      conditions.push(`u.is_active = $${paramIndex++}`);
      params.push(isActive === 'true');
    }

    if (search) {
      conditions.push(`(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (classId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM class_enrollments ce
        WHERE ce.student_id = u.id AND ce.class_id = $${paramIndex++}
      )`);
      params.push(classId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [usersResult, countResult] = await Promise.all([
      query<PublicUser>(
        `SELECT u.id, u.name, u.email, u.phone, u.role, u.photo_url,
                u.is_active, u.last_login, u.created_at
         FROM users u
         ${whereClause}
         ORDER BY u.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM users u ${whereClause}`,
        params
      ),
    ]);

    const total = parseInt(countResult.rows[0]?.count || '0', 10);
    paginatedResponse(res, usersResult.rows, total, page, limit);
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query<PublicUser>(
      `SELECT id, name, email, phone, role, photo_url, is_active, last_login, created_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    successResponse(res, result.rows[0], 'User retrieved successfully');
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      throw new UnauthorizedError();
    }

    // Users can only update their own profile, admins can update anyone
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    if (!isAdmin && req.user.userId !== id) {
      throw new CustomError('You can only update your own profile', 403);
    }

    const { name, phone, role } = req.body as {
      name?: string;
      phone?: string;
      role?: string;
    };

    // Only admins can change roles
    if (role && !isAdmin) {
      throw new CustomError('Only admins can change user roles', 403);
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (name) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(name);
    }

    if (phone !== undefined) {
      setClauses.push(`phone = $${paramIndex++}`);
      params.push(phone || null);
    }

    if (role && isAdmin) {
      setClauses.push(`role = $${paramIndex++}`);
      params.push(role);
    }

    params.push(id);
    const result = await query<PublicUser>(
      `UPDATE users
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, email, phone, role, photo_url, is_active, last_login, created_at`,
      params
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User');
    }

    logger.info('User updated', { userId: id, updatedBy: req.user.userId });
    successResponse(res, result.rows[0], 'User updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) throw new UnauthorizedError();

    // Prevent self-deletion
    if (req.user.userId === id) {
      throw new CustomError('You cannot delete your own account', 400);
    }

    const result = await query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('User');
    }

    logger.info('User soft-deleted', { userId: id, deletedBy: req.user.userId });
    successResponse(res, null, 'User deactivated successfully');
  } catch (error) {
    next(error);
  }
};

export const uploadUserPhoto = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) throw new UnauthorizedError();

    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    if (!isAdmin && req.user.userId !== id) {
      throw new CustomError('You can only upload your own photo', 403);
    }

    if (!req.file) {
      throw new CustomError('No photo file provided', 400);
    }

    // Get old photo to delete
    const oldResult = await query<{ photo_url: string | null }>(
      'SELECT photo_url FROM users WHERE id = $1',
      [id]
    );

    const photoUrl = await storageService.saveFile(req.file, 'photos', {
      resize: { width: 400, height: 400 },
      quality: 85,
    });

    // Delete old photo
    const oldPhoto = oldResult.rows[0]?.photo_url;
    if (oldPhoto) {
      await storageService.deleteFile(oldPhoto).catch(() => {});
    }

    await query(
      'UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2',
      [photoUrl, id]
    );

    logger.info('User photo uploaded', { userId: id });
    successResponse(res, { photoUrl }, 'Photo uploaded successfully');
  } catch (error) {
    next(error);
  }
};

export const getStudentAttendanceSummary = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) throw new UnauthorizedError();

    // Students can only view their own summary
    const isAdmin = ['admin', 'super_admin', 'teacher'].includes(req.user.role);
    if (!isAdmin && req.user.userId !== id) {
      throw new CustomError('Access denied', 403);
    }

    const { classId, subjectId, dateFrom, dateTo } = req.query as {
      classId?: string;
      subjectId?: string;
      dateFrom?: string;
      dateTo?: string;
    };

    const { summary } = await attendanceService.getStudentAttendance(id, {
      classId,
      subjectId,
      dateFrom,
      dateTo,
    });

    successResponse(res, summary, 'Attendance summary retrieved');
  } catch (error) {
    next(error);
  }
};

export const activateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query(
      'UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('User');
    }

    successResponse(res, null, 'User activated successfully');
  } catch (error) {
    next(error);
  }
};
