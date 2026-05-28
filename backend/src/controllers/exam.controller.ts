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
