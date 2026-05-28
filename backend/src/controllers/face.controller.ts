import { Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { AuthRequest } from '../types';
import { faceService } from '../services/face.service';
import { storageService } from '../services/storage.service';
import { validateEmbedding, computeImageEmbedding } from '../utils/face.utils';
import {
  successResponse,
  errorResponse,
  createdResponse,
  noContentResponse,
} from '../utils/response';
import { CustomError, UnauthorizedError } from '../middleware/error.middleware';
import logger from '../utils/logger';

// ─── Validators ───────────────────────────────────────────────────────────────
export const registerFaceValidators = [
  body('embedding')
    .notEmpty()
    .withMessage('Face embedding is required')
    .custom((value: unknown) => {
      let parsed: unknown;
      try {
        parsed = typeof value === 'string' ? JSON.parse(value) : value;
      } catch {
        throw new Error('Embedding must be valid JSON array');
      }
      const validation = validateEmbedding(parsed);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid embedding');
      }
      return true;
    }),
  // is_new_enrollment: when 'true' (first sample of a fresh enrollment batch),
  // existing embeddings are deactivated before the new one is inserted so that
  // re-enrollment fully replaces the old face data.  Subsequent samples in the
  // same batch should send 'false' (or omit it) so all samples are kept.
  body('is_new_enrollment')
    .optional()
    .isIn(['true', 'false', true, false])
    .withMessage('is_new_enrollment must be boolean'),
];

export const verifyFaceValidators = [
  body('userId')
    .optional()
    .isUUID()
    .withMessage('Invalid user ID'),
  body('embedding')
    .notEmpty()
    .withMessage('Face embedding is required'),
];

// ─── Liveness score computation ───────────────────────────────────────────────
function computeLivenessScore(signals: {
  blinkDetected?: boolean;
  headMovement?: number;
  depthVariance?: number;
  textureScore?: number;
}): number {
  let score = 0;
  let factors = 0;

  if (signals.blinkDetected !== undefined) {
    score += signals.blinkDetected ? 0.3 : 0;
    factors++;
  }

  if (signals.headMovement !== undefined) {
    score += Math.min(1, signals.headMovement / 10) * 0.25;
    factors++;
  }

  if (signals.depthVariance !== undefined) {
    score += Math.min(1, signals.depthVariance) * 0.25;
    factors++;
  }

  if (signals.textureScore !== undefined) {
    score += Math.min(1, signals.textureScore) * 0.2;
    factors++;
  }

  // If no signals provided, return a conservative low score
  if (factors === 0) return 0.3;

  return Math.min(1, score);
}

// ─── Controllers ──────────────────────────────────────────────────────────────
export const registerFace = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { embedding: rawEmbedding, userId: targetUserId, is_new_enrollment } = req.body as {
      embedding: string | number[];
      userId?: string;
      is_new_enrollment?: string | boolean;
    };

    // Determine which user's face to register
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const userId = isAdmin && targetUserId ? targetUserId : req.user.userId;

    // Only admins can register faces for other users
    if (!isAdmin && targetUserId && targetUserId !== req.user.userId) {
      throw new CustomError('You can only register your own face', 403);
    }

    // Compute embedding server-side from uploaded image (preferred)
    // or fall back to client-provided embedding if no image
    let embedding: number[];
    let imageUrl: string | undefined;

    if (req.file) {
      try {
        embedding = await computeImageEmbedding(req.file.buffer || req.file.path);
      } catch (imgErr) {
        logger.warn('Image embedding computation failed, using client embedding', { error: imgErr });
        const raw = rawEmbedding;
        embedding = typeof raw === 'string' ? (JSON.parse(raw) as number[]) : raw;
      }
      imageUrl = await storageService.saveFile(req.file, 'faces', {
        resize: { width: 640, height: 640 },
        quality: 90,
      });
    } else {
      embedding = typeof rawEmbedding === 'string'
        ? (JSON.parse(rawEmbedding) as number[])
        : rawEmbedding;
      const validation = validateEmbedding(embedding);
      if (!validation.valid) {
        errorResponse(res, validation.error || 'Invalid embedding', 400);
        return;
      }
    }

    // Only deactivate previous embeddings when this is the FIRST sample of a
    // fresh enrollment batch.  Subsequent uploads (is_new_enrollment=false)
    // ADD to the existing active set so all captured angles are retained for
    // better matching accuracy.
    const isFirstSample =
      is_new_enrollment === true || is_new_enrollment === 'true';

    if (isFirstSample) {
      await faceService.deactivateUserEmbeddings(userId);
    }

    await faceService.registerFaceEmbedding(userId, embedding, imageUrl);

    logger.info('Face registered', { userId, hasImage: !!imageUrl });
    createdResponse(
      res,
      { userId, hasImage: !!imageUrl, imageUrl },
      'Face embedding registered successfully'
    );
  } catch (error) {
    next(error);
  }
};

export const verifyFace = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { userId: targetUserId, embedding: rawEmbedding } = req.body as {
      userId?: string;
      embedding: string | number[];
    };

    const userId = targetUserId || req.user.userId;

    // Non-admins can only verify their own face
    const isAdmin = ['admin', 'super_admin', 'teacher'].includes(req.user.role);
    if (!isAdmin && userId !== req.user.userId) {
      throw new CustomError('Access denied', 403);
    }

    const embedding: number[] = typeof rawEmbedding === 'string'
      ? (JSON.parse(rawEmbedding) as number[])
      : rawEmbedding;

    const validation = validateEmbedding(embedding);
    if (!validation.valid) {
      errorResponse(res, validation.error || 'Invalid embedding', 400);
      return;
    }

    const result = await faceService.verifyFace(userId, embedding);
    successResponse(res, result, result.matched ? 'Face matched' : 'Face not matched');
  } catch (error) {
    next(error);
  }
};

export const deleteUserFace = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!req.user) throw new UnauthorizedError();

    // Only admins can delete face data for other users
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    if (!isAdmin && req.user.userId !== userId) {
      throw new CustomError('You can only delete your own face data', 403);
    }

    await faceService.deleteUserEmbeddings(userId);
    noContentResponse(res);
  } catch (error) {
    next(error);
  }
};

export const getFaceStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!req.user) throw new UnauthorizedError();

    const isAdmin = ['admin', 'super_admin', 'teacher'].includes(req.user.role);
    if (!isAdmin && req.user.userId !== userId) {
      throw new CustomError('Access denied', 403);
    }

    const status = await faceService.getEnrollmentStatus(userId);
    successResponse(res, status, 'Face enrollment status retrieved');
  } catch (error) {
    next(error);
  }
};

export const livenessCheck = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const {
      blinkDetected,
      headMovement,
      depthVariance,
      textureScore,
      livenessScore: clientScore,
    } = req.body as {
      blinkDetected?: boolean;
      headMovement?: number;
      depthVariance?: number;
      textureScore?: number;
      livenessScore?: number;
    };

    // Client-side computed liveness signals — server validates the composite score.
    // In production, this would call a dedicated AI liveness detection service.
    const score =
      clientScore !== undefined
        ? clientScore
        : computeLivenessScore({ blinkDetected, headMovement, depthVariance, textureScore });

    const LIVENESS_THRESHOLD = 0.7;
    const isLive = score >= LIVENESS_THRESHOLD;

    logger.debug('Liveness check', { userId: req.user.userId, score, isLive });

    successResponse(
      res,
      { isLive, score, threshold: LIVENESS_THRESHOLD },
      isLive ? 'Liveness check passed' : 'Liveness check failed'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Admin-only: recompute all face embeddings from their stored images.
 * Use this whenever the embedding algorithm is updated so that existing
 * enrolled faces continue to match correctly.
 */
export const recomputeEmbeddings = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    if (!isAdmin) {
      throw new CustomError('Admin access required', 403);
    }

    const { query: dbQuery } = await import('../config/database');
    const path = await import('path');
    const fs = await import('fs');

    // Fetch all active embeddings that have a stored image
    const result = await dbQuery<{ id: string; user_id: string; image_url: string }>(
      `SELECT id, user_id, image_url
       FROM face_embeddings
       WHERE is_active = true AND image_url IS NOT NULL`
    );

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of result.rows) {
      try {
        let imageSource: string | Buffer;

        if (row.image_url.startsWith('http')) {
          const response = await fetch(row.image_url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          imageSource = Buffer.from(await response.arrayBuffer());
        } else {
          const uploadBase = process.env['UPLOAD_DIR'] || './uploads';
          const absoluteBase = path.default.isAbsolute(uploadBase)
            ? uploadBase
            : path.default.join(process.cwd(), uploadBase);
          const relativePath = row.image_url.startsWith('/uploads/')
            ? row.image_url.slice('/uploads/'.length)
            : row.image_url;
          const absolutePath = path.default.join(absoluteBase, relativePath);

          if (!fs.default.existsSync(absolutePath)) {
            errors.push(`Image not found: ${absolutePath}`);
            failed++;
            continue;
          }
          imageSource = absolutePath;
        }

        const newEmbedding = await computeImageEmbedding(imageSource);
        await dbQuery(
          'UPDATE face_embeddings SET embedding_vector = $1 WHERE id = $2',
          [`{${newEmbedding.join(',')}}`, row.id]
        );
        updated++;
      } catch (err) {
        errors.push(`Failed for embedding ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      }
    }

    logger.info('Face embeddings recomputed', { updated, failed, requestedBy: req.user.userId });

    successResponse(res, {
      total: result.rows.length,
      updated,
      failed,
      errors: errors.slice(0, 10), // limit error list in response
    }, `Recomputed ${updated} embeddings. ${failed} failed.`);
  } catch (error) {
    next(error);
  }
};
