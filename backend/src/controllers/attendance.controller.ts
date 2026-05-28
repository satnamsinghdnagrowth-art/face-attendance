import { Response, NextFunction } from 'express';
import { body, param, query as queryValidator } from 'express-validator';
import { AuthRequest, AttendanceStatus, GPSLocation } from '../types';
import { attendanceService } from '../services/attendance.service';
import { faceService } from '../services/face.service';
import { notificationService } from '../services/notification.service';
import { validateEmbedding } from '../utils/face.utils';
import {
  successResponse,
  errorResponse,
  createdResponse,
  paginatedResponse,
  getPaginationParams,
} from '../utils/response';
import { computeImageEmbedding } from '../utils/face.utils';
import { CustomError, UnauthorizedError, NotFoundError } from '../middleware/error.middleware';
import logger from '../utils/logger';

// ─── Validators ───────────────────────────────────────────────────────────────
export const startSessionValidators = [
  body('class_id').notEmpty().isUUID().withMessage('Valid class ID is required'),
  body('subject_id').notEmpty().isUUID().withMessage('Valid subject ID is required'),
  body('location.latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('location.longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('notes').optional().isString().isLength({ max: 500 }),
];

export const markAttendanceValidators = [
  body('session_id').notEmpty().isUUID().withMessage('Valid session ID is required'),
  body('student_id').notEmpty().isUUID().withMessage('Valid student ID is required'),
  body('status')
    .optional()
    .isIn(['present', 'absent', 'late', 'leave', 'manual_override'])
    .withMessage('Invalid attendance status'),
];

export const scanAttendanceValidators = [
  body('session_id').notEmpty().isUUID().withMessage('Valid session ID is required'),
  body('embedding').notEmpty().withMessage('Face embedding is required'),
];

export const updateAttendanceValidators = [
  param('id').isUUID().withMessage('Invalid attendance record ID'),
  body('status')
    .isIn(['present', 'absent', 'late', 'leave', 'manual_override'])
    .withMessage('Invalid status'),
];

// ─── Controllers ──────────────────────────────────────────────────────────────
export const startSession = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { class_id, subject_id, location: loc, notes } = req.body as {
      class_id: string;
      subject_id: string;
      location?: { latitude: number; longitude: number };
      notes?: string;
    };

    const location: GPSLocation | undefined =
      loc?.latitude !== undefined && loc?.longitude !== undefined
        ? { latitude: loc.latitude, longitude: loc.longitude }
        : undefined;

    const session = await attendanceService.startSession(
      req.user.userId,
      class_id,
      subject_id,
      location,
      notes
    );

    // Notify class via Socket.IO
    notificationService.notifySessionStarted(class_id, {
      sessionId: session.id,
      classId: class_id,
      subjectId: subject_id,
      teacherId: req.user.userId,
      startTime: session.start_time,
    });

    logger.info('Session started by teacher', { sessionId: session.id, teacherId: req.user.userId });
    createdResponse(res, session, 'Attendance session started');
  } catch (error) {
    next(error);
  }
};

export const endSession = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { id: sessionId } = req.params;

    // Get session details before ending (for notification)
    const session = await attendanceService.getSessionById(sessionId);

    // Admins can end any session
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const teacherId = isAdmin ? session.teacher_id : req.user.userId;

    await attendanceService.endSession(sessionId, teacherId);

    notificationService.notifySessionEnded(session.class_id, {
      sessionId,
      classId: session.class_id,
      subjectId: session.subject_id,
      teacherId: session.teacher_id,
      endTime: new Date(),
    });

    successResponse(res, null, 'Session ended. Absent students have been auto-marked.');
  } catch (error) {
    next(error);
  }
};

export const getSession = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const session = await attendanceService.getSessionById(id);
    const records = await attendanceService.getSessionAttendance(id);
    successResponse(res, { session, records }, 'Session retrieved');
  } catch (error) {
    next(error);
  }
};

export const getActiveSessions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { query: dbQuery } = await import('../config/database');

    // Students see only sessions for their enrolled classes; teachers/admins see all active sessions
    const isStudent = req.user.role === 'student';
    let result;

    if (isStudent) {
      result = await dbQuery(
        `SELECT ases.*, c.name as class_name, s.name as subject_name
         FROM attendance_sessions ases
         JOIN classes c ON c.id = ases.class_id
         LEFT JOIN subjects s ON s.id = ases.subject_id
         JOIN class_enrollments ce ON ce.class_id = ases.class_id AND ce.student_id = $1
         WHERE ases.status = 'active'
         ORDER BY ases.start_time DESC`,
        [req.user.userId]
      );
    } else {
      result = await dbQuery(
        `SELECT ases.*, c.name as class_name, s.name as subject_name
         FROM attendance_sessions ases
         JOIN classes c ON c.id = ases.class_id
         LEFT JOIN subjects s ON s.id = ases.subject_id
         WHERE ases.status = 'active'
         ORDER BY ases.start_time DESC`
      );
    }

    successResponse(res, result.rows, 'Active sessions retrieved');
  } catch (error) {
    next(error);
  }
};

export const getTeacherSessions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { page, limit } = getPaginationParams(req.query);
    const { classId, status } = req.query as { classId?: string; status?: string };

    // Admins see all sessions, teachers see only theirs
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const teacherId = isAdmin && (req.query['teacherId'] as string | undefined)
      ? (req.query['teacherId'] as string)
      : req.user.userId;

    const { sessions, total } = await attendanceService.getTeacherSessions(
      isAdmin ? (req.query['teacherId'] as string || req.user.userId) : req.user.userId,
      { classId, status, page, limit }
    );

    paginatedResponse(res, sessions, total, page, limit);
  } catch (error) {
    next(error);
  }
};

export const markAttendance = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { session_id, student_id, confidence = 1.0, status, location } = req.body as {
      session_id: string;
      student_id: string;
      confidence?: number;
      status?: AttendanceStatus;
      location?: GPSLocation;
    };
    const sessionId = session_id;
    const studentId = student_id;

    let imageUrl: string | undefined;
    if (req.file) {
      const { storageService: ss } = await import('../services/storage.service');
      imageUrl = await ss.saveFile(req.file, 'attendance');
    }

    const record = await attendanceService.markAttendance(
      sessionId,
      studentId,
      confidence,
      imageUrl,
      location,
      req.user.userId
    );

    // Get student info for notification
    const { query: dbQuery } = await import('../config/database');
    const studentResult = await dbQuery<{ name: string; class_id: string }>(
      'SELECT u.name, ar.class_id FROM users u JOIN attendance_records ar ON ar.student_id = u.id WHERE u.id = $1 AND ar.id = $2',
      [studentId, record.id]
    );

    if (studentResult.rows.length > 0) {
      const studentInfo = studentResult.rows[0]!;
      notificationService.notifyAttendanceMarked(studentInfo.class_id, {
        sessionId,
        studentId,
        studentName: studentInfo.name,
        status: record.status,
        confidence,
        markedAt: record.marked_at,
      });
    }

    successResponse(res, record, 'Attendance marked successfully');
  } catch (error) {
    next(error);
  }
};

export const scanAttendance = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { session_id, embedding: rawEmbedding, location } = req.body as {
      session_id: string;
      embedding: string | number[];
      location?: GPSLocation;
    };
    const sessionId = session_id;

    // Compute embedding server-side from scan image (preferred over client zero-vectors)
    let embedding: number[];
    let imageUrl: string | undefined;

    if (req.file) {
      try {
        embedding = await computeImageEmbedding(req.file.path);
      } catch (imgErr) {
        logger.warn('Scan image embedding failed, falling back to client embedding', { error: imgErr });
        const raw = typeof rawEmbedding === 'string' ? JSON.parse(rawEmbedding) as number[] : rawEmbedding;
        embedding = raw;
      }
      const { storageService: ss } = await import('../services/storage.service');
      imageUrl = await ss.saveFile(req.file, 'attendance');
    } else {
      embedding = typeof rawEmbedding === 'string'
        ? JSON.parse(rawEmbedding) as number[]
        : rawEmbedding;
    }

    const validation = validateEmbedding(embedding);
    if (!validation.valid) {
      errorResponse(res, validation.error || 'Invalid embedding', 400);
      return;
    }

    // Get session details to find class
    const session = await attendanceService.getSessionById(sessionId);

    if (session.status !== 'active') {
      errorResponse(res, 'Session is not active', 400);
      return;
    }

    // Find matching student
    const match = await faceService.findMatchingStudent(session.class_id, embedding);

    if (!match) {
      successResponse(res, {
        success: false,
        student_id: null,
        student_name: null,
        confidence: 0,
        message: 'No matching student found',
      }, 'Face scan completed - no match');
      return;
    }

    // imageUrl already set above when file was uploaded

    // Mark attendance for the matched student
    const record = await attendanceService.markAttendance(
      sessionId,
      match.student.id,
      match.confidence,
      imageUrl,
      location,
      req.user.userId
    );

    // Notify via Socket.IO
    notificationService.notifyAttendanceMarked(session.class_id, {
      sessionId,
      studentId: match.student.id,
      studentName: match.student.name,
      status: record.status,
      confidence: match.confidence,
      markedAt: record.marked_at,
    });

    successResponse(res, {
      success: true,
      student_id: match.student.id,
      student_name: match.student.name,
      confidence: match.confidence,
      status: record.status,
      record_id: record.id,
      message: 'Student identified and attendance marked',
    }, 'Student identified and attendance marked');
  } catch (error) {
    next(error);
  }
};

export const getAttendanceHistory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { page, limit } = getPaginationParams(req.query);
    const { classId, subjectId, dateFrom, dateTo, status } = req.query as {
      classId?: string;
      subjectId?: string;
      dateFrom?: string;
      dateTo?: string;
      status?: AttendanceStatus;
    };

    // Students see only their own history
    const isAdmin = ['admin', 'super_admin', 'teacher'].includes(req.user.role);
    const studentId = isAdmin && req.query['studentId']
      ? req.query['studentId'] as string
      : req.user.userId;

    const { records, total } = await attendanceService.getStudentAttendance(studentId, {
      classId,
      subjectId,
      dateFrom,
      dateTo,
      status,
      page,
      limit,
    });

    paginatedResponse(res, records, total, page, limit);
  } catch (error) {
    next(error);
  }
};

export const getClassAttendance = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { classId } = req.params;
    const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

    const records = await attendanceService.getClassAttendance(classId, dateFrom, dateTo);
    successResponse(res, records, 'Class attendance retrieved');
  } catch (error) {
    next(error);
  }
};

export const updateAttendance = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { id } = req.params;
    const { status } = req.body as { status: AttendanceStatus };

    await attendanceService.updateAttendanceStatus(id, status, req.user.userId);
    successResponse(res, null, 'Attendance updated successfully');
  } catch (error) {
    next(error);
  }
};

export const getStudentSummary = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { studentId } = req.params;
    const { classId, subjectId, dateFrom, dateTo } = req.query as {
      classId?: string;
      subjectId?: string;
      dateFrom?: string;
      dateTo?: string;
    };

    const isAdmin = ['admin', 'super_admin', 'teacher'].includes(req.user.role);
    if (!isAdmin && req.user.userId !== studentId) {
      throw new CustomError('Access denied', 403);
    }

    const { summary } = await attendanceService.getStudentAttendance(studentId, {
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
