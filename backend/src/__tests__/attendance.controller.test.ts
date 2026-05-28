/**
 * Unit tests for the three new attendance controller functions:
 *   - getAttendanceTrend
 *   - getAttendanceDefaulters
 *   - exportAttendanceReport
 *
 * All database I/O is mocked so tests run fast and in isolation.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../services/attendance.service', () => ({ attendanceService: {} }));
jest.mock('../services/face.service', () => ({ faceService: {} }));
jest.mock('../services/notification.service', () => ({ notificationService: {} }));
jest.mock('../utils/face.utils', () => ({
  validateEmbedding: jest.fn(),
  computeImageEmbedding: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { query as dbQuery } from '../config/database';
import {
  getAttendanceTrend,
  getAttendanceDefaulters,
  exportAttendanceReport,
} from '../controllers/attendance.controller';
import { AuthRequest } from '../types';

const mockDbQuery = dbQuery as jest.MockedFunction<typeof dbQuery>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeReq = (
  query: Record<string, string> = {},
  user = { userId: 'uid-1', role: 'admin' as const, email: 'a@test.com' }
): Partial<AuthRequest> => ({
  query,
  user,
  params: {},
  body: {},
});

const makeRes = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
};

const next: NextFunction = jest.fn();

// ─── getAttendanceTrend ───────────────────────────────────────────────────────

describe('getAttendanceTrend', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns formatted trend rows on success', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        { date: '2026-05-01', total: '30', present: '25', percentage: '83.33' },
        { date: '2026-05-02', total: '28', present: '20', percentage: '71.43' },
      ],
      rowCount: 2,
    } as any);

    const req = makeReq({ from: '2026-05-01' });
    const res = makeRes();

    await getAttendanceTrend(req as AuthRequest, res, next);

    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDbQuery.mock.calls[0]!;
    expect(sql).toContain('attendance_records');
    expect(sql).toContain('GROUP BY ar.date');
    expect(params![0]).toBe('2026-05-01');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: [
          { date: '2026-05-01', total: 30, present: 25, percentage: 83.33 },
          { date: '2026-05-02', total: 28, present: 20, percentage: 71.43 },
        ],
      })
    );
  });

  it('filters by class_id when provided', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const req = makeReq({ from: '2026-05-01', class_id: 'class-uuid-1' });
    const res = makeRes();

    await getAttendanceTrend(req as AuthRequest, res, next);

    const [sql, params] = mockDbQuery.mock.calls[0]!;
    expect(sql).toContain('ar.class_id');
    expect(params).toContain('class-uuid-1');
  });

  it('filters by subject_id when provided', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const req = makeReq({ from: '2026-05-01', subject_id: 'subj-uuid-1' });
    const res = makeRes();

    await getAttendanceTrend(req as AuthRequest, res, next);

    const [sql, params] = mockDbQuery.mock.calls[0]!;
    expect(sql).toContain('ar.subject_id');
    expect(params).toContain('subj-uuid-1');
  });

  it('filters by student_id when provided', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const req = makeReq({ student_id: 'student-uuid-1' });
    const res = makeRes();

    await getAttendanceTrend(req as AuthRequest, res, next);

    const [, params] = mockDbQuery.mock.calls[0]!;
    expect(params).toContain('student-uuid-1');
  });

  it('returns empty array when no records found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const req = makeReq();
    const res = makeRes();

    await getAttendanceTrend(req as AuthRequest, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: [] })
    );
  });

  it('calls next(error) on database failure', async () => {
    const dbError = new Error('DB connection lost');
    mockDbQuery.mockRejectedValueOnce(dbError);

    const req = makeReq();
    const res = makeRes();

    await getAttendanceTrend(req as AuthRequest, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.json).not.toHaveBeenCalled();
  });
});

// ─── getAttendanceDefaulters ─────────────────────────────────────────────────

describe('getAttendanceDefaulters', () => {
  beforeEach(() => jest.clearAllMocks());

  const defaulterRow = {
    id: 'student-1',
    name: 'Low Attendance Student',
    email: 'low@test.com',
    photo_url: null,
    total_sessions: '20',
    attended_sessions: '10',
    percentage: '50.00',
  };

  it('returns defaulters list with threshold 75 by default', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [defaulterRow], rowCount: 1 } as any);

    const req = makeReq();
    const res = makeRes();

    await getAttendanceDefaulters(req as AuthRequest, res, next);

    const [sql, params] = mockDbQuery.mock.calls[0]!;
    expect(sql).toContain("role = 'student'");
    expect(sql).toContain('HAVING');
    expect(params![0]).toBe(75);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: [
          expect.objectContaining({
            student: { id: 'student-1', name: 'Low Attendance Student', email: 'low@test.com', photo_url: null },
            percentage: 50,
            total_sessions: 20,
            attended_sessions: 10,
          }),
        ],
      })
    );
  });

  it('uses custom threshold when provided', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const req = makeReq({ threshold: '60' });
    const res = makeRes();

    await getAttendanceDefaulters(req as AuthRequest, res, next);

    const [, params] = mockDbQuery.mock.calls[0]!;
    expect(params![0]).toBe(60);
  });

  it('clamps threshold to [0, 100] range', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const req = makeReq({ threshold: '150' });
    const res = makeRes();

    await getAttendanceDefaulters(req as AuthRequest, res, next);

    const [, params] = mockDbQuery.mock.calls[0]!;
    expect(params![0]).toBe(100);
  });

  it('filters by class_id when provided', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const req = makeReq({ class_id: 'class-abc' });
    const res = makeRes();

    await getAttendanceDefaulters(req as AuthRequest, res, next);

    const [sql, params] = mockDbQuery.mock.calls[0]!;
    expect(sql).toContain('ar.class_id');
    expect(params).toContain('class-abc');
  });

  it('returns empty array when no defaulters', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const req = makeReq();
    const res = makeRes();

    await getAttendanceDefaulters(req as AuthRequest, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: [] })
    );
  });

  it('calls next(error) on database failure', async () => {
    const dbError = new Error('timeout');
    mockDbQuery.mockRejectedValueOnce(dbError);

    const req = makeReq();
    const res = makeRes();

    await getAttendanceDefaulters(req as AuthRequest, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
  });
});

// ─── exportAttendanceReport ───────────────────────────────────────────────────

describe('exportAttendanceReport', () => {
  beforeEach(() => jest.clearAllMocks());

  const recordRow = {
    student_name: 'Alice',
    class_name: 'CS-101',
    subject_name: 'Math',
    date: '2026-05-01',
    status: 'present',
    confidence_score: '0.92',
    marked_at: '2026-05-01T09:00:00Z',
  };

  it('returns CSV file response when records exist', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [recordRow], rowCount: 1 } as any);

    const req = makeReq({ from: '2026-05-01', format: 'csv' });
    const res = makeRes();

    await exportAttendanceReport(req as AuthRequest, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment; filename=')
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Alice'));
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('present'));
  });

  it('CSV output includes correct headers', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [recordRow], rowCount: 1 } as any);

    const req = makeReq({ from: '2026-05-01' });
    const res = makeRes();

    await exportAttendanceReport(req as AuthRequest, res, next);

    const csvBody = (res.send as jest.Mock).mock.calls[0]![0] as string;
    expect(csvBody).toContain('Student Name');
    expect(csvBody).toContain('Class');
    expect(csvBody).toContain('Status');
  });

  it('returns 404 when no records match filters', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const req = makeReq({ from: '2026-05-01' });
    const res = makeRes();

    await exportAttendanceReport(req as AuthRequest, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it('filters by class_id and subject_id when provided', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [recordRow], rowCount: 1 } as any);

    const req = makeReq({ class_id: 'c-1', subject_id: 's-1' });
    const res = makeRes();

    await exportAttendanceReport(req as AuthRequest, res, next);

    const [, params] = mockDbQuery.mock.calls[0]!;
    expect(params).toContain('c-1');
    expect(params).toContain('s-1');
  });

  it('returns 401 when user is not authenticated', async () => {
    const req: Partial<AuthRequest> = { query: {}, user: undefined, params: {}, body: {} };
    const res = makeRes();

    await exportAttendanceReport(req as AuthRequest, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('calls next(error) on database failure', async () => {
    const dbError = new Error('db error');
    mockDbQuery.mockRejectedValueOnce(dbError);

    const req = makeReq();
    const res = makeRes();

    await exportAttendanceReport(req as AuthRequest, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
  });
});
