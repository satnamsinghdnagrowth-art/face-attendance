import { Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { AuthRequest, Class, Subject } from '../types';
import { query } from '../config/database';
import {
  successResponse,
  createdResponse,
  paginatedResponse,
  getPaginationParams,
  noContentResponse,
} from '../utils/response';
import { CustomError, UnauthorizedError, NotFoundError, ConflictError } from '../middleware/error.middleware';
import logger from '../utils/logger';

// ─── Validators ───────────────────────────────────────────────────────────────
export const createClassValidators = [
  body('name').trim().notEmpty().isLength({ min: 2, max: 255 }).withMessage('Class name required'),
  body('department').trim().notEmpty().withMessage('Department is required'),
  body('semester').optional().isString(),
  body('academic_year').optional().isString().isLength({ max: 20 }),
];

export const createSubjectValidators = [
  body('name').trim().notEmpty().isLength({ min: 2, max: 255 }).withMessage('Subject name required'),
  body('code').trim().notEmpty().isLength({ min: 1, max: 50 }).withMessage('Subject code required'),
  body('teacherId').optional().isUUID().withMessage('Invalid teacher ID'),
];

export const enrollStudentValidators = [
  body('studentId').notEmpty().isUUID().withMessage('Valid student ID is required'),
];

// ─── Class Controllers ────────────────────────────────────────────────────────
export const listClasses = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { department, academicYear, search } = req.query as {
      department?: string;
      academicYear?: string;
      search?: string;
    };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (department) {
      conditions.push(`c.department ILIKE $${paramIndex++}`);
      params.push(`%${department}%`);
    }

    if (academicYear) {
      conditions.push(`c.academic_year = $${paramIndex++}`);
      params.push(academicYear);
    }

    if (search) {
      conditions.push(`(c.name ILIKE $${paramIndex} OR c.department ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [classesResult, countResult] = await Promise.all([
      query<Class & { student_count: string; subject_count: string }>(
        `SELECT c.*,
                (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id) as student_count,
                (SELECT COUNT(*) FROM subjects s WHERE s.class_id = c.id) as subject_count
         FROM classes c
         ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM classes c ${whereClause}`,
        params
      ),
    ]);

    const total = parseInt(countResult.rows[0]?.count || '0', 10);
    paginatedResponse(res, classesResult.rows, total, page, limit);
  } catch (error) {
    next(error);
  }
};

export const getClassById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query<Class & { student_count: string }>(
      `SELECT c.*,
              u.name as admin_name,
              (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id = c.id) as student_count,
              (SELECT COUNT(*) FROM subjects s WHERE s.class_id = c.id) as subject_count
       FROM classes c
       LEFT JOIN users u ON u.id = c.admin_id
       WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Class');
    }

    const subjectsResult = await query<Subject>(
      `SELECT s.*, u.name as teacher_name
       FROM subjects s
       LEFT JOIN users u ON u.id = s.teacher_id
       WHERE s.class_id = $1
       ORDER BY s.name`,
      [id]
    );

    successResponse(res, {
      ...result.rows[0],
      subjects: subjectsResult.rows,
    }, 'Class retrieved');
  } catch (error) {
    next(error);
  }
};

export const createClass = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { name, department, semester, academic_year } = req.body as {
      name: string;
      department: string;
      semester?: string;
      academic_year?: string;
    };

    const result = await query<Class>(
      `INSERT INTO classes (name, department, semester, academic_year, admin_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, department, semester, academic_year, req.user.userId]
    );

    const newClass = result.rows[0];
    if (!newClass) throw new CustomError('Failed to create class', 500);

    logger.info('Class created', { classId: newClass.id, name, createdBy: req.user.userId });
    createdResponse(res, newClass, 'Class created successfully');
  } catch (error) {
    next(error);
  }
};

export const updateClass = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, department, semester, academic_year } = req.body as {
      name?: string;
      department?: string;
      semester?: string;
      academic_year?: string;
    };

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (name) { setClauses.push(`name = $${paramIndex++}`); params.push(name); }
    if (department) { setClauses.push(`department = $${paramIndex++}`); params.push(department); }
    if (semester !== undefined) { setClauses.push(`semester = $${paramIndex++}`); params.push(semester); }
    if (academic_year !== undefined) { setClauses.push(`academic_year = $${paramIndex++}`); params.push(academic_year); }

    if (setClauses.length === 0) {
      successResponse(res, null, 'No changes provided');
      return;
    }

    params.push(id);
    const result = await query<Class>(
      `UPDATE classes SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) throw new NotFoundError('Class');
    successResponse(res, result.rows[0], 'Class updated');
  } catch (error) {
    next(error);
  }
};

export const deleteClass = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM classes WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rowCount === 0) throw new NotFoundError('Class');
    noContentResponse(res);
  } catch (error) {
    next(error);
  }
};

// ─── Subject Controllers ──────────────────────────────────────────────────────
export const getClassSubjects = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: classId } = req.params;

    const result = await query<Subject & { teacher_name: string | null }>(
      `SELECT s.*, u.name as teacher_name
       FROM subjects s
       LEFT JOIN users u ON u.id = s.teacher_id
       WHERE s.class_id = $1
       ORDER BY s.name`,
      [classId]
    );

    successResponse(res, result.rows, 'Subjects retrieved');
  } catch (error) {
    next(error);
  }
};

export const createSubject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: classId } = req.params;
    const { name, code, teacherId } = req.body as {
      name: string;
      code: string;
      teacherId?: string;
    };

    // Verify class exists
    const classCheck = await query<{ id: string }>(
      'SELECT id FROM classes WHERE id = $1', [classId]
    );
    if (classCheck.rows.length === 0) throw new NotFoundError('Class');

    const result = await query<Subject>(
      `INSERT INTO subjects (name, code, class_id, teacher_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, code.toUpperCase(), classId, teacherId || null]
    );

    const subject = result.rows[0];
    if (!subject) throw new CustomError('Failed to create subject', 500);

    createdResponse(res, subject, 'Subject created');
  } catch (error) {
    next(error);
  }
};

export const updateSubject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { subjectId } = req.params;
    const { name, code, teacherId } = req.body as {
      name?: string;
      code?: string;
      teacherId?: string | null;
    };

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (name) { setClauses.push(`name = $${paramIndex++}`); params.push(name); }
    if (code) { setClauses.push(`code = $${paramIndex++}`); params.push(code.toUpperCase()); }
    if (teacherId !== undefined) { setClauses.push(`teacher_id = $${paramIndex++}`); params.push(teacherId || null); }

    if (setClauses.length === 0) {
      successResponse(res, null, 'No changes');
      return;
    }

    params.push(subjectId);
    const result = await query<Subject>(
      `UPDATE subjects SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) throw new NotFoundError('Subject');
    successResponse(res, result.rows[0], 'Subject updated');
  } catch (error) {
    next(error);
  }
};

export const deleteSubject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { subjectId } = req.params;
    const result = await query('DELETE FROM subjects WHERE id = $1 RETURNING id', [subjectId]);
    if (result.rowCount === 0) throw new NotFoundError('Subject');
    noContentResponse(res);
  } catch (error) {
    next(error);
  }
};

// ─── Enrollment Controllers ───────────────────────────────────────────────────
export const getClassStudents = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: classId } = req.params;
    const { page, limit, offset } = getPaginationParams(req.query);

    const [studentsResult, countResult] = await Promise.all([
      query(
        `SELECT u.id, u.name, u.email, u.phone, u.photo_url, u.is_active,
                ce.enrolled_at,
                EXISTS(
                  SELECT 1 FROM face_embeddings fe
                  WHERE fe.user_id = u.id AND fe.is_active = true
                ) as has_face_registered
         FROM class_enrollments ce
         JOIN users u ON u.id = ce.student_id
         WHERE ce.class_id = $1
         ORDER BY u.name
         LIMIT $2 OFFSET $3`,
        [classId, limit, offset]
      ),
      query<{ count: string }>(
        'SELECT COUNT(*) as count FROM class_enrollments WHERE class_id = $1',
        [classId]
      ),
    ]);

    const total = parseInt(countResult.rows[0]?.count || '0', 10);
    paginatedResponse(res, studentsResult.rows, total, page, limit);
  } catch (error) {
    next(error);
  }
};

export const enrollStudent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: classId } = req.params;
    const { studentId } = req.body as { studentId: string };

    // Verify student exists and has student role
    const studentCheck = await query<{ id: string; role: string }>(
      "SELECT id, role FROM users WHERE id = $1 AND is_active = true",
      [studentId]
    );

    if (studentCheck.rows.length === 0) throw new NotFoundError('Student');
    if (studentCheck.rows[0]!.role !== 'student') {
      throw new CustomError('User is not a student', 400);
    }

    // Verify class exists
    const classCheck = await query<{ id: string }>(
      'SELECT id FROM classes WHERE id = $1', [classId]
    );
    if (classCheck.rows.length === 0) throw new NotFoundError('Class');

    const result = await query(
      `INSERT INTO class_enrollments (student_id, class_id)
       VALUES ($1, $2)
       ON CONFLICT (student_id, class_id) DO NOTHING
       RETURNING *`,
      [studentId, classId]
    );

    if (result.rowCount === 0) {
      throw new ConflictError('Student is already enrolled in this class');
    }

    logger.info('Student enrolled', { studentId, classId });
    createdResponse(res, result.rows[0], 'Student enrolled successfully');
  } catch (error) {
    next(error);
  }
};

export const removeStudent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: classId, studentId } = req.params;

    const result = await query(
      'DELETE FROM class_enrollments WHERE class_id = $1 AND student_id = $2 RETURNING id',
      [classId, studentId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Enrollment');
    }

    logger.info('Student removed from class', { studentId, classId });
    noContentResponse(res);
  } catch (error) {
    next(error);
  }
};
