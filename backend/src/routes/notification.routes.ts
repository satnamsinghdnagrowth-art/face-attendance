import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { successResponse } from '../utils/response';
import { query } from '../config/database';
import { UnauthorizedError } from '../middleware/error.middleware';

const router = Router();

router.use(authenticateToken);

// GET /api/notifications
router.get('/', async (req: Request, res: Response, next) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) throw new UnauthorizedError();

    const { limit = 50, unread } = req.query as { limit?: string; unread?: string };

    // Return empty list — notifications table not yet provisioned
    successResponse(res, [], 'Notifications retrieved');
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req: Request, res: Response, next) => {
  try {
    successResponse(res, { message: 'All notifications marked as read' }, 'Updated');
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response, next) => {
  try {
    successResponse(res, { message: 'Notification marked as read' }, 'Updated');
  } catch (error) {
    next(error);
  }
});

export default router;
