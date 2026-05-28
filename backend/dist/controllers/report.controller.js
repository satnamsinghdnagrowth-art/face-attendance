"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportCSV = exports.getAnalyticsOverview = exports.getDefaulters = exports.getStudentReport = exports.getMonthlyReport = exports.getDailyReport = void 0;
const database_1 = require("../config/database");
const attendance_service_1 = require("../services/attendance.service");
const response_1 = require("../utils/response");
const error_middleware_1 = require("../middleware/error.middleware");
const createObjectCsvStringifier = (options) => ({
    getHeaderString: () => options.header.map((h) => `"${h.title}"`).join(',') + '\n',
    stringifyRecords: (records) => records
        .map((r) => options.header
        .map((h) => `"${(r[h.id] || '').replace(/"/g, '""')}"`)
        .join(','))
        .join('\n') + '\n',
});
function flattenRecord(record) {
    const flat = {};
    for (const [key, value] of Object.entries(record)) {
        flat[key] = value === null || value === undefined ? '' : String(value);
    }
    return flat;
}
const getDailyReport = async (req, res, next) => {
    try {
        const { classId, date } = req.query;
        if (!classId) {
            (0, response_1.errorResponse)(res, 'classId is required', 400);
            return;
        }
        const reportDate = date || new Date().toISOString().split('T')[0];
        const records = await attendance_service_1.attendanceService.getDailyReport(classId, reportDate);
        (0, response_1.successResponse)(res, { date: reportDate, classId, records }, 'Daily report retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getDailyReport = getDailyReport;
const getMonthlyReport = async (req, res, next) => {
    try {
        const { classId, month, year } = req.query;
        if (!classId || !month || !year) {
            (0, response_1.errorResponse)(res, 'classId, month, and year are required', 400);
            return;
        }
        const monthNum = parseInt(month, 10);
        const yearNum = parseInt(year, 10);
        if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
            (0, response_1.errorResponse)(res, 'Invalid month (1-12)', 400);
            return;
        }
        if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
            (0, response_1.errorResponse)(res, 'Invalid year', 400);
            return;
        }
        const records = await attendance_service_1.attendanceService.getMonthlyReport(classId, monthNum, yearNum);
        (0, response_1.successResponse)(res, { month: monthNum, year: yearNum, classId, records }, 'Monthly report retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getMonthlyReport = getMonthlyReport;
const getStudentReport = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { studentId } = req.params;
        const { from, to, classId, subjectId } = req.query;
        const isAdmin = ['admin', 'super_admin', 'teacher'].includes(req.user.role);
        if (!isAdmin && req.user.userId !== studentId) {
            throw new error_middleware_1.CustomError('Access denied', 403);
        }
        const { records, summary, total } = await attendance_service_1.attendanceService.getStudentAttendance(studentId, {
            dateFrom: from,
            dateTo: to,
            classId,
            subjectId,
            page: 1,
            limit: 10000,
        });
        (0, response_1.successResponse)(res, { studentId, summary, records, total }, 'Student report retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getStudentReport = getStudentReport;
const getDefaulters = async (req, res, next) => {
    try {
        const { classId, threshold } = req.query;
        if (!classId) {
            (0, response_1.errorResponse)(res, 'classId is required', 400);
            return;
        }
        const thresholdNum = parseFloat(threshold || '75');
        if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 100) {
            (0, response_1.errorResponse)(res, 'Threshold must be between 0 and 100', 400);
            return;
        }
        const defaulters = await attendance_service_1.attendanceService.getDefaultersList(classId, thresholdNum);
        (0, response_1.successResponse)(res, {
            classId,
            threshold: thresholdNum,
            count: defaulters.length,
            defaulters,
        }, 'Defaulters list retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getDefaulters = getDefaulters;
const getAnalyticsOverview = async (req, res, next) => {
    try {
        const stats = await attendance_service_1.attendanceService.getDashboardStats();
        const recentActivity = await (0, database_1.query)(`SELECT
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
       LIMIT 10`);
        const trend = await (0, database_1.query)(`SELECT
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
       ORDER BY ar.date ASC`);
        (0, response_1.successResponse)(res, {
            stats,
            recentActivity: recentActivity.rows,
            trend: trend.rows,
        }, 'Analytics overview retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getAnalyticsOverview = getAnalyticsOverview;
const exportCSV = async (req, res, next) => {
    try {
        if (!req.user)
            throw new error_middleware_1.UnauthorizedError();
        const { type, classId, studentId, dateFrom, dateTo, month, year } = req.query;
        let data = [];
        let filename = 'attendance_export.csv';
        let headers = [];
        switch (type) {
            case 'daily': {
                if (!classId) {
                    (0, response_1.errorResponse)(res, 'classId required for daily export', 400);
                    return;
                }
                const date = dateFrom || new Date().toISOString().split('T')[0];
                data = (await attendance_service_1.attendanceService.getDailyReport(classId, date));
                filename = `daily_attendance_${date}.csv`;
                headers = [
                    { id: 'student_name', title: 'Student Name' },
                    { id: 'subject_name', title: 'Subject' },
                    { id: 'status', title: 'Status' },
                    { id: 'confidence_score', title: 'Confidence' },
                    { id: 'marked_at', title: 'Marked At' },
                ];
                break;
            }
            case 'monthly': {
                if (!classId || !month || !year) {
                    (0, response_1.errorResponse)(res, 'classId, month, year required for monthly export', 400);
                    return;
                }
                data = (await attendance_service_1.attendanceService.getMonthlyReport(classId, parseInt(month, 10), parseInt(year, 10)));
                filename = `monthly_attendance_${year}_${month}.csv`;
                headers = [
                    { id: 'student_name', title: 'Student Name' },
                    { id: 'date', title: 'Date' },
                    { id: 'subject_name', title: 'Subject' },
                    { id: 'status', title: 'Status' },
                    { id: 'confidence_score', title: 'Confidence' },
                ];
                break;
            }
            case 'student': {
                if (!studentId) {
                    (0, response_1.errorResponse)(res, 'studentId required for student export', 400);
                    return;
                }
                const { records } = await attendance_service_1.attendanceService.getStudentAttendance(studentId, {
                    dateFrom, dateTo, page: 1, limit: 100000,
                });
                data = records;
                filename = `student_attendance_${studentId}.csv`;
                headers = [
                    { id: 'date', title: 'Date' },
                    { id: 'subject_name', title: 'Subject' },
                    { id: 'class_name', title: 'Class' },
                    { id: 'status', title: 'Status' },
                    { id: 'confidence_score', title: 'Confidence' },
                    { id: 'marked_at', title: 'Marked At' },
                ];
                break;
            }
            case 'defaulters': {
                if (!classId) {
                    (0, response_1.errorResponse)(res, 'classId required for defaulters export', 400);
                    return;
                }
                data = (await attendance_service_1.attendanceService.getDefaultersList(classId, 75));
                filename = `defaulters_${classId}.csv`;
                headers = [
                    { id: 'name', title: 'Student Name' },
                    { id: 'email', title: 'Email' },
                    { id: 'total_sessions', title: 'Total Sessions' },
                    { id: 'attended_sessions', title: 'Attended' },
                    { id: 'attendance_percentage', title: 'Attendance %' },
                ];
                break;
            }
            default:
                (0, response_1.errorResponse)(res, 'Invalid export type. Use: daily, monthly, student, defaulters', 400);
                return;
        }
        if (data.length === 0) {
            (0, response_1.errorResponse)(res, 'No data found for the specified filters', 404);
            return;
        }
        const csvStringifier = createObjectCsvStringifier({ header: headers });
        const headerString = csvStringifier.getHeaderString();
        const recordsString = csvStringifier.stringifyRecords(data.map((r) => flattenRecord(r)));
        const csvContent = headerString + recordsString;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).send(csvContent);
    }
    catch (error) {
        next(error);
    }
};
exports.exportCSV = exportCSV;
//# sourceMappingURL=report.controller.js.map