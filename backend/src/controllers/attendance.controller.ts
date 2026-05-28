import { Response, NextFunction } from 'express';
import { body, param, query as queryValidator } from 'express-validator';
import { AuthRequest, AttendanceStatus, GPSLocation } from '../types';
import { query as dbQuery } from '../config/database';
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
        embedding = await computeImageEmbedding(req.file.buffer || req.file.path);
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

// ─── GET /attendance/trend ────────────────────────────────────────────────────
export const getAttendanceTrend = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { from, to, class_id, subject_id, student_id } = req.query as Record<string, string>;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromDate = from || thirtyDaysAgo.toISOString().split('T')[0]!;

    const params: unknown[] = [fromDate];
    const conditions = ['ar.date >= $1'];

    if (to) { params.push(to); conditions.push(`ar.date <= $${params.length}`); }
    if (class_id) { params.push(class_id); conditions.push(`ar.class_id = $${params.length}::uuid`); }
    if (subject_id) { params.push(subject_id); conditions.push(`ar.subject_id = $${params.length}::uuid`); }
    if (student_id) { params.push(student_id); conditions.push(`ar.student_id = $${params.length}::uuid`); }

    const result = await dbQuery<{
      date: string;
      total: string;
      present: string;
      percentage: string;
    }>(
      `SELECT
         ar.date::text                                                           AS date,
         COUNT(*)::int                                                           AS total,
         COUNT(*) FILTER (WHERE ar.status IN ('present','late','manual_override'))::int AS present,
         COALESCE(ROUND(
           COUNT(*) FILTER (WHERE ar.status IN ('present','late','manual_override'))
           * 100.0 / NULLIF(COUNT(*), 0), 2
         ), 0)::float                                                            AS percentage
       FROM attendance_records ar
       WHERE ${conditions.join(' AND ')}
       GROUP BY ar.date
       ORDER BY ar.date ASC`,
      params
    );

    const rows = result.rows.map((r) => ({
      date: r.date,
      total: Number(r.total),
      present: Number(r.present),
      percentage: Number(r.percentage),
    }));

    successResponse(res, rows, 'Attendance trend retrieved');
  } catch (error) {
    next(error);
  }
};

// ─── GET /attendance/defaulters ───────────────────────────────────────────────
export const getAttendanceDefaulters = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { threshold = '75', class_id } = req.query as Record<string, string>;
    const thresholdNum = Math.min(100, Math.max(0, parseFloat(threshold) || 75));

    const params: unknown[] = [thresholdNum];
    const joinConditions: string[] = [];
    const whereExtras: string[] = [];

    if (class_id) {
      params.push(class_id);
      joinConditions.push(`AND ar.class_id = $${params.length}::uuid`);
    }

    const result = await dbQuery<{
      id: string;
      name: string;
      email: string;
      photo_url: string | null;
      total_sessions: string;
      attended_sessions: string;
      percentage: string;
    }>(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.photo_url,
         COUNT(DISTINCT ar.session_id)::int                                         AS total_sessions,
         COUNT(DISTINCT ar.session_id)
           FILTER (WHERE ar.status IN ('present','late','manual_override'))::int    AS attended_sessions,
         COALESCE(ROUND(
           COUNT(DISTINCT ar.session_id)
             FILTER (WHERE ar.status IN ('present','late','manual_override'))
             * 100.0 / NULLIF(COUNT(DISTINCT ar.session_id), 0), 2
         ), 0)::float                                                               AS percentage
       FROM users u
       JOIN attendance_records ar ON ar.student_id = u.id ${joinConditions.join(' ')}
       WHERE u.role = 'student' AND u.is_active = true
       GROUP BY u.id, u.name, u.email, u.photo_url
       HAVING COALESCE(ROUND(
         COUNT(DISTINCT ar.session_id)
           FILTER (WHERE ar.status IN ('present','late','manual_override'))
           * 100.0 / NULLIF(COUNT(DISTINCT ar.session_id), 0), 2
       ), 0) < $1
       ORDER BY percentage ASC`,
      params
    );

    const defaulters = result.rows.map((r) => ({
      student: { id: r.id, name: r.name, email: r.email, photo_url: r.photo_url },
      total_sessions: Number(r.total_sessions),
      attended_sessions: Number(r.attended_sessions),
      percentage: Number(r.percentage),
    }));

    successResponse(res, defaulters, 'Defaulters list retrieved');
  } catch (error) {
    next(error);
  }
};

// ─── GET /attendance/export ───────────────────────────────────────────────────
export const exportAttendanceReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { from, to, class_id, subject_id, format = 'csv' } = req.query as Record<string, string>;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromDate = from || thirtyDaysAgo.toISOString().split('T')[0]!;

    const params: unknown[] = [fromDate];
    const conditions = ['ar.date >= $1'];

    if (to) { params.push(to); conditions.push(`ar.date <= $${params.length}`); }
    if (class_id) { params.push(class_id); conditions.push(`ar.class_id = $${params.length}::uuid`); }
    if (subject_id) { params.push(subject_id); conditions.push(`ar.subject_id = $${params.length}::uuid`); }

    const result = await dbQuery<{
      student_name: string;
      class_name: string;
      subject_name: string;
      date: string;
      status: string;
      confidence_score: string | null;
      marked_at: string;
    }>(
      `SELECT
         u.name                AS student_name,
         COALESCE(c.name, '')  AS class_name,
         COALESCE(s.name, '')  AS subject_name,
         ar.date::text         AS date,
         ar.status,
         ROUND(ar.confidence_score::numeric, 3)::text AS confidence_score,
         ar.marked_at::text    AS marked_at
       FROM attendance_records ar
       JOIN users u ON u.id = ar.student_id
       LEFT JOIN classes c ON c.id = ar.class_id
       LEFT JOIN subjects s ON s.id = ar.subject_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ar.date DESC, u.name ASC
       LIMIT 10000`,
      params
    );

    if (result.rows.length === 0) {
      errorResponse(res, 'No attendance data found for the selected filters', 404);
      return;
    }

    const headers = ['Student Name', 'Class', 'Subject', 'Date', 'Status', 'Confidence', 'Marked At'];
    const csvRows = result.rows.map((r) =>
      [
        r.student_name,
        r.class_name,
        r.subject_name,
        r.date,
        r.status,
        r.confidence_score ?? '',
        r.marked_at,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );

    const csvContent = [headers.map((h) => `"${h}"`).join(','), ...csvRows].join('\n');
    const filename = `attendance_export_${fromDate}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};
