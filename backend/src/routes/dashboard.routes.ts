import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { successResponse } from '../utils/response';
import { query } from '../config/database';
import { UnauthorizedError } from '../middleware/error.middleware';

const router = Router();

router.use(authenticateToken);

// GET /api/dashboard/stats
router.get('/stats', async (req: Request, res: Response, next) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) throw new UnauthorizedError();

    const [studentsRes, teachersRes, classesRes, sessionsRes] = await Promise.all([
      query<{ count: string }>(`SELECT COUNT(*) as count FROM users WHERE role = 'student' AND is_active = true`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM users WHERE role = 'teacher' AND is_active = true`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM classes`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM attendance_sessions WHERE status = 'active'`),
    ]);

    // Today's attendance rate
    const todayRes = await query<{ total: string; present: string }>(`
      SELECT
        COUNT(ar.id) as total,
        COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present
      FROM attendance_records ar
      JOIN attendance_sessions ases ON ases.id = ar.session_id
      WHERE ases.created_at::date = CURRENT_DATE
    `);

    const todayStats = todayRes.rows[0];
    const total = parseInt(todayStats?.total || '0');
    const present = parseInt(todayStats?.present || '0');
    const todayRate = total > 0 ? Math.round((present / total) * 100) : 0;

    successResponse(res, {
      total_students: parseInt(studentsRes.rows[0]?.count || '0'),
      total_teachers: parseInt(teachersRes.rows[0]?.count || '0'),
      total_classes: parseInt(classesRes.rows[0]?.count || '0'),
      today_attendance_rate: todayRate,
      active_sessions: parseInt(sessionsRes.rows[0]?.count || '0'),
      unread_notifications: 0,
    }, 'Dashboard stats retrieved');
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/activity
router.get('/activity', async (req: Request, res: Response, next) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) throw new UnauthorizedError();

    const limit = parseInt((req.query['limit'] as string) || '10');

    const result = await query(`
      SELECT
        ar.id,
        u.name as student_name,
        ar.status,
        ar.marked_at,
        ases.class_id,
        c.name as class_name
      FROM attendance_records ar
      JOIN users u ON u.id = ar.student_id
      JOIN attendance_sessions ases ON ases.id = ar.session_id
      JOIN classes c ON c.id = ases.class_id
      ORDER BY ar.marked_at DESC
      LIMIT $1
    `, [limit]);

    successResponse(res, result.rows, 'Recent activity retrieved');
  } catch (error) {
    next(error);
  }
});

export default router;
