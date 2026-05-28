import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { query } from '../config/database';
import { attendanceService } from '../services/attendance.service';
import { successResponse, errorResponse } from '../utils/response';
import { CustomError, UnauthorizedError } from '../middleware/error.middleware';
import logger from '../utils/logger';

// ─── Simple inline CSV stringifier (no extra dependency) ─────────────────────
const createObjectCsvStringifier = (options: {
  header: Array<{ id: string; title: string }>;
}) => ({
  getHeaderString: () => options.header.map((h) => `"${h.title}"`).join(',') + '\n',
  stringifyRecords: (records: Record<string, string>[]) =>
    records
      .map((r) =>
        options.header
          .map((h) => `"${(r[h.id] || '').replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n') + '\n',
});

// Helper to convert a record to flat string values for CSV
function flattenRecord(record: Record<string, unknown>): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    flat[key] = value === null || value === undefined ? '' : String(value);
  }
  return flat;
}

// ─── Controllers ──────────────────────────────────────────────────────────────
export const getDailyReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { classId, date } = req.query as { classId?: string; date?: string };

    if (!classId) {
      errorResponse(res, 'classId is required', 400);
      return;
    }

    const reportDate = date || new Date().toISOString().split('T')[0]!;
    const records = await attendanceService.getDailyReport(classId, reportDate);

    successResponse(res, { date: reportDate, classId, records }, 'Daily report retrieved');
  } catch (error) {
    next(error);
  }
};

export const getMonthlyReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { classId, month, year } = req.query as {
      classId?: string;
      month?: string;
      year?: string;
    };

    if (!classId || !month || !year) {
      errorResponse(res, 'classId, month, and year are required', 400);
      return;
    }

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      errorResponse(res, 'Invalid month (1-12)', 400);
      return;
    }

    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      errorResponse(res, 'Invalid year', 400);
      return;
    }

    const records = await attendanceService.getMonthlyReport(classId, monthNum, yearNum);
    successResponse(res, { month: monthNum, year: yearNum, classId, records }, 'Monthly report retrieved');
  } catch (error) {
    next(error);
  }
};

export const getStudentReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { studentId } = req.params;
    const { from, to, classId, subjectId } = req.query as {
      from?: string;
      to?: string;
      classId?: string;
      subjectId?: string;
    };

    const isAdmin = ['admin', 'super_admin', 'teacher'].includes(req.user.role);
    if (!isAdmin && req.user.userId !== studentId) {
      throw new CustomError('Access denied', 403);
    }

    const { records, summary, total } = await attendanceService.getStudentAttendance(studentId, {
      dateFrom: from,
      dateTo: to,
      classId,
      subjectId,
      page: 1,
      limit: 10000,
    });

    successResponse(res, { studentId, summary, records, total }, 'Student report retrieved');
  } catch (error) {
    next(error);
  }
};

export const getDefaulters = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { classId, threshold } = req.query as { classId?: string; threshold?: string };

    if (!classId) {
      errorResponse(res, 'classId is required', 400);
      return;
    }

    const thresholdNum = parseFloat(threshold || '75');
    if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 100) {
      errorResponse(res, 'Threshold must be between 0 and 100', 400);
      return;
    }

    const defaulters = await attendanceService.getDefaultersList(classId, thresholdNum);
    successResponse(
      res,
      {
        classId,
        threshold: thresholdNum,
        count: (defaulters as unknown[]).length,
        defaulters,
      },
      'Defaulters list retrieved'
    );
  } catch (error) {
    next(error);
  }
};

export const getAnalyticsOverview = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const stats = await attendanceService.getDashboardStats();

    // Recent activity
    const recentActivity = await query(
      `SELECT
         ar.date, ar.status,
         u.name  AS student_name,
         c.name  AS class_name,
         s.name  AS subject_name,
         ar.marked_at
       FROM attendance_records ar
       JOIN users    u ON u.id = ar.student_id
       JOIN classes  c ON c.id = ar.class_id
       JOIN subjects s ON s.id = ar.subject_id
       ORDER BY ar.marked_at DESC
       LIMIT 10`
    );

    // Attendance trend (last 7 days)
    const trend = await query(
      `SELECT
         ar.date,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE ar.status IN ('present', 'late', 'manual_override')) AS present,
         ROUND(
           COUNT(*) FILTER (WHERE ar.status IN ('present', 'late', 'manual_override')) * 100.0
           / NULLIF(COUNT(*), 0),
           2
         ) AS rate
       FROM attendance_records ar
       WHERE ar.date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY ar.date
       ORDER BY ar.date ASC`
    );

    successResponse(
      res,
      {
        stats,
        recentActivity: recentActivity.rows,
        trend: trend.rows,
      },
      'Analytics overview retrieved'
    );
  } catch (error) {
    next(error);
  }
};

export const exportCSV = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new UnauthorizedError();

    const { type, classId, studentId, dateFrom, dateTo, month, year } = req.query as {
      type?: string;
      classId?: string;
      studentId?: string;
      dateFrom?: string;
      dateTo?: string;
      month?: string;
      year?: string;
    };

    let data: Record<string, unknown>[] = [];
    let filename = 'attendance_export.csv';
    let headers: Array<{ id: string; title: string }> = [];

    switch (type) {
      case 'daily': {
        if (!classId) { errorResponse(res, 'classId required for daily export', 400); return; }
        const date = dateFrom || new Date().toISOString().split('T')[0]!;
        data = (await attendanceService.getDailyReport(classId, date)) as Record<string, unknown>[];
        filename = `daily_attendance_${date}.csv`;
        headers = [
          { id: 'student_name',    title: 'Student Name' },
          { id: 'subject_name',    title: 'Subject'      },
          { id: 'status',          title: 'Status'       },
          { id: 'confidence_score', title: 'Confidence'  },
          { id: 'marked_at',       title: 'Marked At'    },
        ];
        break;
      }

      case 'monthly': {
        if (!classId || !month || !year) {
          errorResponse(res, 'classId, month, year required for monthly export', 400);
          return;
        }
        data = (
          await attendanceService.getMonthlyReport(classId, parseInt(month, 10), parseInt(year, 10))
        ) as Record<string, unknown>[];
        filename = `monthly_attendance_${year}_${month}.csv`;
        headers = [
          { id: 'student_name',    title: 'Student Name' },
          { id: 'date',            title: 'Date'         },
          { id: 'subject_name',    title: 'Subject'      },
          { id: 'status',          title: 'Status'       },
          { id: 'confidence_score', title: 'Confidence'  },
        ];
        break;
      }

      case 'student': {
        if (!studentId) { errorResponse(res, 'studentId required for student export', 400); return; }
        const { records } = await attendanceService.getStudentAttendance(studentId, {
          dateFrom, dateTo, page: 1, limit: 100000,
        });
        data = records as unknown as Record<string, unknown>[];
        filename = `student_attendance_${studentId}.csv`;
        headers = [
          { id: 'date',            title: 'Date'         },
          { id: 'subject_name',    title: 'Subject'      },
          { id: 'class_name',      title: 'Class'        },
          { id: 'status',          title: 'Status'       },
          { id: 'confidence_score', title: 'Confidence'  },
          { id: 'marked_at',       title: 'Marked At'    },
        ];
        break;
      }

      case 'defaulters': {
        if (!classId) { errorResponse(res, 'classId required for defaulters export', 400); return; }
        data = (await attendanceService.getDefaultersList(classId, 75)) as Record<string, unknown>[];
        filename = `defaulters_${classId}.csv`;
        headers = [
          { id: 'name',                  title: 'Student Name'  },
          { id: 'email',                 title: 'Email'         },
          { id: 'total_sessions',        title: 'Total Sessions'},
          { id: 'attended_sessions',     title: 'Attended'      },
          { id: 'attendance_percentage', title: 'Attendance %'  },
        ];
        break;
      }

      default:
        errorResponse(res, 'Invalid export type. Use: daily, monthly, student, defaulters', 400);
        return;
    }

    if (data.length === 0) {
      errorResponse(res, 'No data found for the specified filters', 404);
      return;
    }

    const csvStringifier = createObjectCsvStringifier({ header: headers });
    const headerString = csvStringifier.getHeaderString();
    const recordsString = csvStringifier.stringifyRecords(
      data.map((r) => flattenRecord(r))
    );

    const csvContent = headerString + recordsString;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};
