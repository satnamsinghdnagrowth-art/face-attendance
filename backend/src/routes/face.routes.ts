import { Router } from 'express';
import {
  registerFace, verifyFace, deleteUserFace, getFaceStatus, livenessCheck,
  recomputeEmbeddings,
  registerFaceValidators, verifyFaceValidators,
} from '../controllers/face.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/role.middleware';
import { uploadFaceImage, handleMulterError } from '../middleware/upload.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

// All face routes require authentication
router.use(authenticateToken);

// Register face (accepts image file + embedding JSON)
router.post(
  '/register',
  uploadFaceImage.single('image'),
  handleMulterError,
  registerFaceValidators,
  validate,
  registerFace
);

// Verify face embedding
router.post('/verify', verifyFaceValidators, validate, verifyFace);

// Liveness check
router.post('/liveness-check', livenessCheck);

// Admin: recompute all stored face embeddings with the current algorithm
// (run once after upgrading the embedding algorithm, or after bulk image import)
router.post('/admin/recompute-embeddings', requireAdmin, recomputeEmbeddings);

// Get enrollment status
router.get('/:userId/status', getFaceStatus);

// Delete face embeddings (admin or self)
router.delete('/:userId', deleteUserFace);

export default router;
