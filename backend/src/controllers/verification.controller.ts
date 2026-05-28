import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../types';
import { verificationService, VerifyParams } from '../services/verification.service';
import { examAlertService } from '../services/exam.alert.service';
import { computeImageEmbedding } from '../utils/face.utils';
import { successResponse, errorResponse } from '../utils/response';
import { UnauthorizedError } from '../middleware/error.middleware';
import { query as dbQuery } from '../config/database';
import logger from '../utils/logger';

// ─── Validators ───────────────────────────────────────────────────────────────

export const entryVerifyValidators = [
  body('exam_session_id').notEmpty().isUUID().withMessage('Valid exam_session_id is required'),
  body('student_id').notEmpty().isUUID().withMessage('Valid student_id is required'),
  body('embedding').notEmpty().withMessage('Face embedding is required'),
  body('scan_type')
    .optional()
    .isIn(['entry', 're_verify', 'manual'])
    .withMessage('scan_type must be entry, re_verify, or manual'),
];

export const reVerifyValidators = [
  body('exam_session_id').notEmpty().isUUID().withMessage('Valid exam_session_id is required'),
  body('student_id').notEmpty().isUUID().withMessage('Valid student_id is required'),
  body('embedding').notEmpty().withMessage('Face embedding is required'),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveEmbedding(
  file: Express.Multer.File | undefined,
  rawEmbedding: string | number[]
): Promise<number[]> {
  if (file) {
    try {
      return await computeImageEmbedding(file.buffer || file.path);
    } catch (imgErr) {
      logger.warn('Server-side embedding failed, falling back to client embedding', { error: imgErr });
    }
  }
  return typeof rawEmbedding === 'string'
    ? (JSON.parse(rawEmbedding) as number[])
    : rawEmbedding;
}

async function resolveExamAndHall(
  examSessionId: string
): Promise<{ exam_id: string; hall_id: string } | null> {
  const result = await dbQuery<{ exam_id: string; hall_id: string }>(
    'SELECT exam_id, hall_id FROM exam_sessions WHERE id = $1',
    [examSessionId]
  );
  return result.rows[0] ?? null;
}

// ─── Controllers ──────────────────────────────────────────────────────────────

export const verifyEntry = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const {
      exam_session_id,
      student_id,
      embedding: rawEmbedding,
      scan_type = 'entry',
    } = req.body as {
      exam_session_id: string;
      student_id: string;
      embedding: string | number[];
      scan_type?: 'entry' | 're_verify' | 'manual';
    };

    const sessionInfo = await resolveExamAndHall(exam_session_id);
    if (!sessionInfo) {
      errorResponse(res, 'Exam session not found', 404);
      return;
    }
    const { exam_id, hall_id } = sessionInfo;

    const face_embedding = await resolveEmbedding(req.file, rawEmbedding);

    let face_image_url: string | undefined;
    if (req.file) {
      const { storageService } = await import('../services/storage.service');
      face_image_url = await storageService.saveFile(req.file, 'verification');
    }

    const params: VerifyParams = {
      exam_session_id,
      exam_id,
      student_id,
      face_embedding,
      scan_type,
      face_image_url,
      scanned_by: req.user.userId,
    };

    const result = await verificationService.verifyCandidate(params);

    // Auto-raise alerts if needed
    await examAlertService.autoRaiseFromVerification(result, exam_id, hall_id, result.event_id);

    logger.info('Entry verification complete', {
      sessionId: exam_session_id,
      studentId: student_id,
      verdict: result.verdict,
      confidence: result.confidence_score,
    });

    successResponse(res, result, 'Verification complete');
  } catch (error) {
    next(error);
  }
};

export const reVerify = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const {
      exam_session_id,
      student_id,
      embedding: rawEmbedding,
    } = req.body as {
      exam_session_id: string;
      student_id: string;
      embedding: string | number[];
    };

    const sessionInfo = await resolveExamAndHall(exam_session_id);
    if (!sessionInfo) {
      errorResponse(res, 'Exam session not found', 404);
      return;
    }
    const { exam_id, hall_id } = sessionInfo;

    const face_embedding = await resolveEmbedding(req.file, rawEmbedding);

    let face_image_url: string | undefined;
    if (req.file) {
      const { storageService } = await import('../services/storage.service');
      face_image_url = await storageService.saveFile(req.file, 'verification');
    }

    const params: VerifyParams = {
      exam_session_id,
      exam_id,
      student_id,
      face_embedding,
      scan_type: 're_verify',
      face_image_url,
      scanned_by: req.user.userId,
    };

    const result = await verificationService.verifyCandidate(params);

    // Auto-raise alerts if needed
    await examAlertService.autoRaiseFromVerification(result, exam_id, hall_id, result.event_id);

    logger.info('Re-verification complete', {
      sessionId: exam_session_id,
      studentId: student_id,
      verdict: result.verdict,
      confidence: result.confidence_score,
    });

    successResponse(res, result, 'Re-verification complete');
  } catch (error) {
    next(error);
  }
};

export const getVerificationEvents = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const events = await verificationService.getVerificationEvents(sessionId);
    successResponse(res, events, 'Verification events retrieved');
  } catch (error) {
    next(error);
  }
};

export const getStudentEvents = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { studentId, examId } = req.params;
    const events = await verificationService.getStudentVerificationHistory(studentId, examId);
    successResponse(res, events, 'Student verification history retrieved');
  } catch (error) {
    next(error);
  }
};
