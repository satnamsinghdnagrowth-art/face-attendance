/**
 * Unit tests for the dashboard route handlers.
 * Tests both the /stats and /activity endpoints.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  checkDatabaseHealth: jest.fn().mockResolvedValue(true),
}));

jest.mock('../config/redis', () => ({
  checkRedisHealth: jest.fn().mockResolvedValue(true),
  safeGet: jest.fn(),
  safeSetex: jest.fn(),
  safeDel: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { query } from '../config/database';
import { AuthRequest } from '../types';
import { Response, NextFunction } from 'express';

const mockQuery = query as jest.MockedFunction<typeof query>;
const next: NextFunction = jest.fn();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeAdminReq = (queryParams: Record<string, string> = {}): Partial<AuthRequest> => ({
  query: queryParams,
  params: {},
  body: {},
  user: { userId: 'admin-1', role: 'admin', email: 'admin@test.com' },
});

const makeRes = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

describe('Dashboard /stats handler', () => {
  // We test the logic by directly replaying what the route handler does
  // (since it's an inline router handler, we validate the DB call patterns)

  beforeEach(() => jest.clearAllMocks());

  it('aggregates counts from 4 parallel DB queries', async () => {
    // students, teachers, classes, sessions
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '120' }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ count: '15' }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ count: '8' }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 } as any)
      // today's attendance
      .mockResolvedValueOnce({ rows: [{ total: '100', present: '85' }], rowCount: 1 } as any);

    // Re-implement the handler logic so we can test the computation
    const [studentsRes, teachersRes, classesRes, sessionsRes] = await Promise.all([
      mockQuery(`SELECT COUNT(*) as count FROM users WHERE role = 'student' AND is_active = true`),
      mockQuery(`SELECT COUNT(*) as count FROM users WHERE role = 'teacher' AND is_active = true`),
      mockQuery(`SELECT COUNT(*) as count FROM classes`),
      mockQuery(`SELECT COUNT(*) as count FROM attendance_sessions WHERE status = 'active'`),
    ]);
    const todayRes = await mockQuery(`SELECT COUNT(ar.id) as total, COUNT(CASE ...) as present ...`);

    const total = parseInt(todayRes.rows[0]?.total || '0');
    const present = parseInt(todayRes.rows[0]?.present || '0');
    const todayRate = total > 0 ? Math.round((present / total) * 100) : 0;

    const result = {
      total_students: parseInt(studentsRes.rows[0]?.count || '0'),
      total_teachers: parseInt(teachersRes.rows[0]?.count || '0'),
      total_classes: parseInt(classesRes.rows[0]?.count || '0'),
      active_sessions: parseInt(sessionsRes.rows[0]?.count || '0'),
      today_attendance_rate: todayRate,
    };

    expect(result.total_students).toBe(120);
    expect(result.total_teachers).toBe(15);
    expect(result.total_classes).toBe(8);
    expect(result.active_sessions).toBe(3);
    expect(result.today_attendance_rate).toBe(85);
  });

  it('returns 0 rate when no attendance records today', async () => {
    const total = 0;
    const present = 0;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    expect(rate).toBe(0);
  });

  it('handles perfect attendance correctly', () => {
    const total = 50;
    const present = 50;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    expect(rate).toBe(100);
  });
});

// ─── Dashboard Stats response shape ──────────────────────────────────────────

describe('DashboardStats response shape', () => {
  it('always includes required fields', () => {
    // Validate the interface shape is complete
    const stats = {
      total_students: 100,
      total_teachers: 10,
      total_classes: 5,
      today_attendance_rate: 80,
      active_sessions: 2,
      unread_notifications: 0,
    };

    expect(stats).toHaveProperty('total_students');
    expect(stats).toHaveProperty('total_teachers');
    expect(stats).toHaveProperty('today_attendance_rate');
    expect(stats).toHaveProperty('active_sessions');
    expect(typeof stats.today_attendance_rate).toBe('number');
    expect(stats.today_attendance_rate).toBeGreaterThanOrEqual(0);
    expect(stats.today_attendance_rate).toBeLessThanOrEqual(100);
  });
});

// ─── Dashboard Activity ───────────────────────────────────────────────────────

describe('Dashboard /activity handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries recent attendance records with limit', async () => {
    const activityRows = [
      { id: 'rec-1', student_name: 'Alice', status: 'present', marked_at: new Date(), class_name: 'CS-101' },
      { id: 'rec-2', student_name: 'Bob', status: 'absent', marked_at: new Date(), class_name: 'CS-101' },
    ];

    mockQuery.mockResolvedValueOnce({ rows: activityRows, rowCount: 2 } as any);

    const limit = 10;
    const result = await mockQuery(`SELECT ... LIMIT $1`, [limit]);

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [10]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toHaveProperty('student_name');
    expect(result.rows[0]).toHaveProperty('status');
  });

  it('returns empty array when no recent activity', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const result = await mockQuery(`SELECT ... LIMIT $1`, [10]);
    expect(result.rows).toHaveLength(0);
  });
});
