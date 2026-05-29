import crypto from 'crypto';
import { Response, NextFunction } from 'express';
import { body, param, query as queryValidator } from 'express-validator';
import { AuthRequest } from '../types';
import { examService } from '../services/exam.service';
import { examAlertService } from '../services/exam.alert.service';
import {
  successResponse,
  createdResponse,
  paginatedResponse,
  getPaginationParams,
} from '../utils/response';
import { UnauthorizedError } from '../middleware/error.middleware';
import { query } from '../config/database';
import logger from '../utils/logger';

// ─── Validators ───────────────────────────────────────────────────────────────

export const createExamValidators = [
  body('title').notEmpty().isString().withMessage('Exam title is required'),
  body('exam_code').notEmpty().isString().withMessage('Exam code is required'),
  body('subject_id').optional().isUUID().withMessage('subject_id must be a valid UUID'),
  body('scheduled_start').notEmpty().isISO8601().withMessage('scheduled_start must be a valid ISO8601 date'),
  body('scheduled_end').notEmpty().isISO8601().withMessage('scheduled_end must be a valid ISO8601 date'),
  body('duration_mins').notEmpty().isInt({ min: 1 }).withMessage('duration_mins must be a positive integer'),
  body('re_verify_interval_mins').optional().isInt({ min: 0 }).withMessage('re_verify_interval_mins must be a non-negative integer'),
  body('face_threshold').optional().isFloat({ min: 0, max: 1 }).withMessage('face_threshold must be between 0 and 1'),
  body('flag_threshold').optional().isFloat({ min: 0, max: 1 }).withMessage('flag_threshold must be between 0 and 1'),
  body('instructions').optional().isString().isLength({ max: 2000 }).withMessage('instructions must be a string under 2000 characters'),
];

export const createHallValidators = [
  body('hall_name').notEmpty().isString().withMessage('Hall name is required'),
  body('capacity').notEmpty().isInt({ min: 1 }).withMessage('Capacity must be a positive integer'),
  body('invigilator_id').optional().isUUID().withMessage('invigilator_id must be a valid UUID'),
  body('floor').optional().isString().withMessage('floor must be a string'),
  body('building').optional().isString().withMessage('building must be a string'),
];

export const enrollStudentsValidators = [
  body('students').isArray({ min: 1 }).withMessage('students must be a non-empty array'),
  body('students.*.student_id').notEmpty().isUUID().withMessage('Each student_id must be a valid UUID'),
  body('students.*.seat_number').optional().isString().withMessage('seat_number must be a string'),
  body('students.*.roll_number').optional().isString().withMessage('roll_number must be a string'),
];

// ─── Controllers ──────────────────────────────────────────────────────────────

export const createExam = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const {
      title,
      exam_code,
      subject_id,
      scheduled_start,
      scheduled_end,
      duration_mins,
      re_verify_interval_mins,
      face_threshold,
      flag_threshold,
      instructions,
    } = req.body as {
      title: string;
      exam_code: string;
      subject_id?: string;
      scheduled_start: string;
      scheduled_end: string;
      duration_mins: number;
      re_verify_interval_mins?: number;
      face_threshold?: number;
      flag_threshold?: number;
      instructions?: string;
    };

    const exam = await examService.createExam({
      title,
      exam_code,
      subject_id,
      scheduled_start,
      scheduled_end,
      duration_mins,
      re_verify_interval_mins,
      face_threshold,
      flag_threshold,
      instructions,
      created_by: req.user.userId,
    });

    logger.info('Exam created via controller', { examId: exam.id, createdBy: req.user.userId });
    createdResponse(res, exam, 'Exam created successfully');
  } catch (error) {
    next(error);
  }
};

export const listExams = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { status } = req.query as { status?: string };

    const { exams, total } = await examService.listExams({ status, page, limit });
    paginatedResponse(res, exams, total, page, limit, 'Exams retrieved');
  } catch (error) {
    next(error);
  }
};

export const getExam = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { examId } = req.params;
    const exam = await examService.getExam(examId);
    successResponse(res, exam, 'Exam retrieved');
  } catch (error) {
    next(error);
  }
};

export const updateExam = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { examId } = req.params;
    const updates = req.body as Partial<{
      title: string;
      exam_code: string;
      subject_id: string;
      scheduled_start: string;
      scheduled_end: string;
      duration_mins: number;
      re_verify_interval_mins: number;
      face_threshold: number;
      flag_threshold: number;
      instructions: string;
    }>;

    const exam = await examService.updateExam(examId, updates);
    logger.info('Exam updated via controller', { examId, updatedBy: req.user.userId });
    successResponse(res, exam, 'Exam updated successfully');
  } catch (error) {
    next(error);
  }
};

export const createHall = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { examId } = req.params;
    const { hall_name, capacity, invigilator_id, floor, building } = req.body as {
      hall_name: string;
      capacity: number;
      invigilator_id?: string;
      floor?: string;
      building?: string;
    };

    const hall = await examService.createHall(examId, {
      hall_name,
      capacity,
      invigilator_id,
      floor,
      building,
    });

    logger.info('Exam hall created via controller', { examId, hallId: hall.id, createdBy: req.user.userId });
    createdResponse(res, hall, 'Exam hall created successfully');
  } catch (error) {
    next(error);
  }
};

export const getHalls = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { examId } = req.params;
    const halls = await examService.getHalls(examId);
    successResponse(res, halls, 'Exam halls retrieved');
  } catch (error) {
    next(error);
  }
};

export const enrollStudents = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { examId, hallId } = req.params;
    const { students } = req.body as {
      students: Array<{ student_id: string; seat_number?: string; roll_number?: string }>;
    };

    const result = await examService.enrollStudents(examId, hallId, students);
    logger.info('Bulk enrollment via controller', {
      examId,
      hallId,
      enrolled: result.enrolled,
      skipped: result.skipped,
      by: req.user.userId,
    });
    createdResponse(res, result, `Enrollment complete: ${result.enrolled} enrolled, ${result.skipped} skipped`);
  } catch (error) {
    next(error);
  }
};

export const getEnrollments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { examId } = req.params;
    const { hallId } = req.query as { hallId?: string };

    const enrollments = await examService.getEnrollments(examId, { hallId });
    successResponse(res, enrollments, 'Enrollments retrieved');
  } catch (error) {
    next(error);
  }
};

export const startHallSession = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { examId, hallId } = req.params;

    const session = await examService.startHallSession(examId, hallId, req.user.userId);
    logger.info('Exam session started via controller', {
      sessionId: session.id,
      examId,
      hallId,
      invigilatorId: req.user.userId,
    });
    createdResponse(res, session, 'Exam session started');
  } catch (error) {
    next(error);
  }
};

export const endHallSession = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { sessionId } = req.params;

    await examService.endHallSession(sessionId, req.user.userId);
    logger.info('Exam session ended via controller', { sessionId, endedBy: req.user.userId });
    successResponse(res, null, 'Exam session ended. No-show alerts have been raised for absent students.');
  } catch (error) {
    next(error);
  }
};

export const getHallStudents = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const students = await examService.getHallStudentStatus(sessionId);
    successResponse(res, students, 'Hall student statuses retrieved');
  } catch (error) {
    next(error);
  }
};

export const getExamStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { examId } = req.params;
    const stats = await examService.getExamStats(examId);
    successResponse(res, stats, 'Exam statistics retrieved');
  } catch (error) {
    next(error);
  }
};

export const getActiveAlerts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { examId } = req.params;
    const alerts = await examAlertService.getActiveAlerts(examId);
    successResponse(res, alerts, 'Active alerts retrieved');
  } catch (error) {
    next(error);
  }
};

export const resolveAlert = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { alertId } = req.params;

    await examAlertService.resolveAlert(alertId, req.user.userId);
    logger.info('Alert resolved via controller', { alertId, resolvedBy: req.user.userId });
    successResponse(res, null, 'Alert resolved successfully');
  } catch (error) {
    next(error);
  }
};

export const reviewVerificationEvent = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { eventId } = req.params;
    const { review_decision, review_note } = req.body as {
      review_decision: 'confirmed_proxy' | 'false_alarm' | 'inconclusive';
      review_note?: string;
    };

    const { verificationService } = await import('../services/verification.service');
    await verificationService.submitReview(
      eventId,
      review_decision,
      review_note ?? '',
      req.user.userId
    );

    logger.info('Verification event reviewed via controller', {
      eventId,
      decision: review_decision,
      reviewedBy: req.user.userId,
    });
    successResponse(res, null, 'Verification event reviewed successfully');
  } catch (error) {
    next(error);
  }
};

// ─── Exam status transition ───────────────────────────────────────────────────

export const updateExamStatusValidators = [
  body('status')
    .isIn(['active', 'completed', 'cancelled'])
    .withMessage('status must be one of: active, completed, cancelled'),
];

export const updateExamStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { examId } = req.params;
    const { status } = req.body as { status: 'active' | 'completed' | 'cancelled' };

    const exam = await examService.updateExamStatus(examId, status, req.user.userId);

    logger.info('Exam status updated via controller', {
      examId,
      newStatus: status,
      changedBy: req.user.userId,
    });
    successResponse(res, exam, `Exam status updated to '${status}'`);
  } catch (error) {
    next(error);
  }
};

// ─── CSV bulk enrollment ──────────────────────────────────────────────────────

/**
 * POST /api/v2/exams/:examId/halls/:hallId/enroll/csv
 * Body: multipart/form-data with field "file" containing a CSV.
 *
 * CSV format (first row = header):
 *   student_email,seat_number,roll_number
 *   alice@student.com,A-01,2023CS001
 *
 * Matches students by email. seat_number and roll_number are optional.
 */
export const enrollFromCSV = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { examId, hallId } = req.params;

    if (!req.file) {
      const { errorResponse } = await import('../utils/response');
      errorResponse(res, 'CSV file is required (field name: file)', 400);
      return;
    }

    const csvText = req.file.buffer.toString('utf8');
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      const { errorResponse } = await import('../utils/response');
      errorResponse(res, 'CSV must have a header row and at least one data row', 400);
      return;
    }

    // Parse header — case-insensitive column lookup
    const header = lines[0]!.toLowerCase().split(',').map((h) => h.trim());
    const col = (name: string) => header.indexOf(name);

    const emailIdx       = col('student_email');
    const seatIdx        = col('seat_number');
    const rollIdx        = col('roll_number');
    const studentIdIdx   = col('student_id');

    if (emailIdx === -1 && studentIdIdx === -1) {
      const { errorResponse } = await import('../utils/response');
      errorResponse(res, 'CSV must have a "student_email" or "student_id" column', 400);
      return;
    }

    // Collect rows
    const rows = lines.slice(1).map((line, i) => {
      const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      return {
        rowNum: i + 2,
        email:       emailIdx     !== -1 ? cells[emailIdx]     : undefined,
        student_id:  studentIdIdx !== -1 ? cells[studentIdIdx] : undefined,
        seat_number: seatIdx      !== -1 ? cells[seatIdx]      : undefined,
        roll_number: rollIdx      !== -1 ? cells[rollIdx]      : undefined,
      };
    });

    // Resolve student IDs from emails when email column is used
    const { query: dbQuery } = await import('../config/database');
    const errors: Array<{ row: number; reason: string }> = [];
    const studentsToEnroll: Array<{ student_id: string; seat_number?: string; roll_number?: string }> = [];

    for (const row of rows) {
      let studentId = row.student_id;

      if (!studentId && row.email) {
        const userResult = await dbQuery<{ id: string }>(
          `SELECT id FROM users WHERE email = $1 AND role = 'student' AND is_active = true`,
          [row.email.toLowerCase()]
        );
        if (userResult.rows.length === 0) {
          errors.push({ row: row.rowNum, reason: `Student not found: ${row.email}` });
          continue;
        }
        studentId = userResult.rows[0].id;
      }

      if (!studentId) {
        errors.push({ row: row.rowNum, reason: 'Missing student_email and student_id' });
        continue;
      }

      studentsToEnroll.push({
        student_id: studentId,
        seat_number: row.seat_number || undefined,
        roll_number: row.roll_number || undefined,
      });
    }

    // Bulk enroll using existing service
    const { enrolled, skipped } = await examService.enrollStudents(
      examId,
      hallId,
      studentsToEnroll
    );

    logger.info('CSV enrollment complete', {
      examId,
      hallId,
      total: rows.length,
      enrolled,
      skipped,
      errors: errors.length,
      uploadedBy: req.user.userId,
    });

    successResponse(res, {
      total_rows: rows.length,
      enrolled,
      skipped,
      errors,
    }, `CSV enrollment complete: ${enrolled} enrolled, ${skipped} skipped, ${errors.length} errors`);
  } catch (error) {
    next(error);
  }
};

// ─── Compliance Report Export (PDF + CSV) ────────────────────────────────────

export const exportExamReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { examId } = req.params;
    const { format = 'csv' } = req.query as { format?: 'csv' | 'pdf' };

    // Gather all report data in parallel
    const [examRow, hallsRow, eventsRow, enrollCountRow] = await Promise.all([
      // Exam header
      query<{
        id: string; title: string; exam_code: string; status: string;
        scheduled_start: string; scheduled_end: string; duration_mins: number;
        face_threshold: number; flag_threshold: number; institution_name: string;
      }>(
        `SELECT e.*, i.name AS institution_name
         FROM exams e
         LEFT JOIN institutions i ON i.id = e.institution_id
         WHERE e.id = $1`,
        [examId]
      ),

      // Halls
      query<{ id: string; hall_name: string; building?: string; floor?: string; invigilator_name?: string }>(
        `SELECT h.id, h.hall_name, h.building, h.floor, u.name AS invigilator_name
         FROM exam_halls h
         LEFT JOIN users u ON u.id = h.invigilator_id
         WHERE h.exam_id = $1
         ORDER BY h.hall_name`,
        [examId]
      ),

      // All verification events
      query<{
        student_name: string; seat_number?: string; verdict: string;
        confidence_score: number; scan_type: string; scanned_at: string;
        review_decision?: string; review_note?: string;
      }>(
        `SELECT u.name AS student_name, ee.seat_number, ve.verdict,
                ve.confidence_score, ve.scan_type, ve.scanned_at,
                ve.review_decision, ve.review_note
         FROM verification_events ve
         JOIN users u ON u.id = ve.student_id
         LEFT JOIN exam_enrollments ee
           ON ee.exam_id = ve.exam_id AND ee.student_id = ve.student_id
         WHERE ve.exam_id = $1
         ORDER BY ve.scanned_at DESC`,
        [examId]
      ),

      // Enrollment count
      query<{ c: string }>(
        `SELECT COUNT(*) AS c FROM exam_enrollments WHERE exam_id = $1`,
        [examId]
      ),
    ]);

    if (examRow.rows.length === 0) {
      const { errorResponse } = await import('../utils/response');
      errorResponse(res, 'Exam not found', 404);
      return;
    }

    const examData = examRow.rows[0];
    const events = eventsRow.rows;

    const statsCounts = {
      total_enrolled: parseInt(enrollCountRow.rows[0]?.c ?? '0'),
      verified: events.filter(e => e.verdict === 'verified').length,
      flagged: events.filter(e => e.verdict === 'flagged').length,
      rejected: events.filter(e => e.verdict === 'rejected' || e.verdict === 'no_match').length,
      no_show: 0,
      proxy_suspects: events.filter(e => e.verdict === 'proxy_suspect').length,
    };

    // Generate SHA-256 report hash for tamper evidence
    const reportPayload = JSON.stringify({ exam: examData, stats: statsCounts, events });
    const reportHash = crypto.createHash('sha256').update(reportPayload).digest('hex');

    // Persist hash to exam record
    await query(
      `UPDATE exams SET report_hash = $1, report_generated_at = NOW() WHERE id = $2`,
      [reportHash, examId]
    );

    const reportData = {
      exam: examData,
      stats: statsCounts,
      halls: hallsRow.rows,
      events,
      reportHash,
      generatedAt: new Date().toISOString(),
    };

    if (format === 'pdf') {
      const { pdfService } = await import('../services/pdf.service');
      const pdfBuffer = await pdfService.generateCompliancePDF(reportData);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="compliance_${examData.exam_code}.pdf"`);
      res.status(200).send(pdfBuffer);
    } else {
      const { pdfService } = await import('../services/pdf.service');
      const csvContent = pdfService.generateCSV(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="compliance_${examData.exam_code}.csv"`);
      res.status(200).send(csvContent);
    }

    logger.info('Compliance report exported', {
      examId,
      format,
      reportHash: reportHash.slice(0, 16),
      exportedBy: req.user.userId,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Push Token Registration ──────────────────────────────────────────────────

export const registerPushToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { token, platform = 'expo' } = req.body as { token: string; platform?: string };
    if (!token) {
      const { errorResponse } = await import('../utils/response');
      errorResponse(res, 'Push token is required', 400);
      return;
    }

    const { pushNotificationService } = await import('../services/push.notification.service');
    await pushNotificationService.registerToken(req.user.userId, token, platform);
    successResponse(res, null, 'Push token registered');
  } catch (error) {
    next(error);
  }
};

export const unregisterPushToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const { token } = req.body as { token: string };
    if (!token) {
      const { errorResponse } = await import('../utils/response');
      errorResponse(res, 'Push token is required', 400);
      return;
    }

    const { pushNotificationService } = await import('../services/push.notification.service');
    await pushNotificationService.unregisterToken(req.user.userId, token);
    successResponse(res, null, 'Push token unregistered');
  } catch (error) {
    next(error);
  }
};

// ─── SIS Webhook (Phase 3 stub) ───────────────────────────────────────────────

export const handleSISWebhook = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { students } = req.body as { students: unknown[] };
    const { sisIntegrationService } = await import('../services/sis.integration.service');
    const result = await sisIntegrationService.syncStudents(students as any[]);
    successResponse(res, result, 'SIS sync complete');
  } catch (error) {
    next(error);
  }
};
