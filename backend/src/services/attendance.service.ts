import { query, withTransaction } from '../config/database';
import { PoolClient } from 'pg';
import {
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  AttendanceSummary,
  AttendanceFilter,
  GPSLocation,
  User,
  PublicUser,
} from '../types';
import { CustomError, NotFoundError } from '../middleware/error.middleware';
import logger from '../utils/logger';

export class AttendanceService {
  async startSession(
    teacherId: string,
    classId: string,
    subjectId: string,
    location?: GPSLocation,
    notes?: string
  ): Promise<AttendanceSession> {
    // Verify no active session for this class/subject
    const existing = await query<{ id: string }>(
      `SELECT id FROM attendance_sessions
       WHERE class_id = $1 AND subject_id = $2 AND status = 'active'`,
      [classId, subjectId]
    );

    if (existing.rows.length > 0) {
      throw new CustomError('An active session already exists for this class and subject', 409);
    }

    const result = await query<AttendanceSession>(
      `INSERT INTO attendance_sessions (teacher_id, class_id, subject_id, start_time, status, latitude, longitude, notes)
       VALUES ($1, $2, $3, NOW(), 'active', $4, $5, $6)
       RETURNING *`,
      [teacherId, classId, subjectId, location?.latitude, location?.longitude, notes]
    );

    const session = result.rows[0];
    if (!session) {
      throw new CustomError('Failed to create attendance session', 500);
    }

    logger.info('Attendance session started', { sessionId: session.id, teacherId, classId });
    return session;
  }

  async endSession(sessionId: string, teacherId: string): Promise<void> {
    const result = await query<AttendanceSession>(
      `SELECT * FROM attendance_sessions WHERE id = $1`,
      [sessionId]
    );

    const session = result.rows[0];
    if (!session) {
      throw new NotFoundError('Session');
    }

    if (session.status !== 'active') {
      throw new CustomError(`Session is already ${session.status}`, 400);
    }

    // Teachers can only end their own sessions, admins can end any
    // This check is in controller via role middleware; here we just enforce teacher ownership
    if (session.teacher_id !== teacherId) {
      throw new CustomError('You can only end your own sessions', 403);
    }

    await withTransaction(async (client: PoolClient) => {
      // Mark session as completed
      await client.query(
        `UPDATE attendance_sessions
         SET status = 'completed', end_time = NOW()
         WHERE id = $1`,
        [sessionId]
      );

      // Mark all enrolled students without records as absent
      await client.query(
        `INSERT INTO attendance_records
           (session_id, student_id, class_id, subject_id, date, status, created_by)
         SELECT $1, ce.student_id, $2, $3, CURRENT_DATE, 'absent', $4
         FROM class_enrollments ce
         WHERE ce.class_id = $2
           AND NOT EXISTS (
             SELECT 1 FROM attendance_records ar
             WHERE ar.session_id = $1 AND ar.student_id = ce.student_id
           )`,
        [sessionId, session.class_id, session.subject_id, teacherId]
      );
    });

    logger.info('Attendance session ended', { sessionId, teacherId });
  }

  async cancelSession(sessionId: string, teacherId: string): Promise<void> {
    const result = await query<AttendanceSession>(
      'SELECT * FROM attendance_sessions WHERE id = $1',
      [sessionId]
    );

    const session = result.rows[0];
    if (!session) throw new NotFoundError('Session');
    if (session.status !== 'active') throw new CustomError('Session is not active', 400);

    await query(
      `UPDATE attendance_sessions SET status = 'cancelled', end_time = NOW() WHERE id = $1`,
      [sessionId]
    );

    logger.info('Attendance session cancelled', { sessionId });
  }

  async markAttendance(
    sessionId: string,
    studentId: string,
    confidence: number,
    imageUrl?: string,
    location?: GPSLocation,
    markedBy?: string
  ): Promise<AttendanceRecord> {
    // Validate session is active
    const sessionResult = await query<AttendanceSession>(
      `SELECT * FROM attendance_sessions WHERE id = $1 AND status = 'active'`,
      [sessionId]
    );

    const session = sessionResult.rows[0];
    if (!session) {
      throw new CustomError('No active session found with this ID', 400);
    }

    // Check student is enrolled in this class
    const enrollmentResult = await query<{ id: string }>(
      `SELECT id FROM class_enrollments WHERE student_id = $1 AND class_id = $2`,
      [studentId, session.class_id]
    );

    if (enrollmentResult.rows.length === 0) {
      throw new CustomError('Student is not enrolled in this class', 400);
    }

    // Determine status based on confidence and time
    const status: AttendanceStatus = confidence >= 0.75 ? 'present' : 'late';

    const result = await query<AttendanceRecord>(
      `INSERT INTO attendance_records
         (session_id, student_id, class_id, subject_id, date, status,
          confidence_score, image_url, gps_latitude, gps_longitude, created_by)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (session_id, student_id)
       DO UPDATE SET
         status = EXCLUDED.status,
         confidence_score = EXCLUDED.confidence_score,
         image_url = COALESCE(EXCLUDED.image_url, attendance_records.image_url),
         marked_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [
        sessionId, studentId, session.class_id, session.subject_id,
        status, confidence, imageUrl,
        location?.latitude, location?.longitude,
        markedBy || session.teacher_id,
      ]
    );

    const record = result.rows[0];
    if (!record) {
      throw new CustomError('Failed to mark attendance', 500);
    }

    logger.info('Attendance marked', {
      sessionId, studentId, status, confidence,
    });

    return record;
  }

  async getSessionById(sessionId: string): Promise<AttendanceSession & {
    teacher_name?: string;
    class_name?: string;
    subject_name?: string;
  }> {
    const result = await query<AttendanceSession & {
      teacher_name: string;
      class_name: string;
      subject_name: string;
    }>(
      `SELECT as2.*, u.name as teacher_name, c.name as class_name, s.name as subject_name
       FROM attendance_sessions as2
       JOIN users u ON u.id = as2.teacher_id
       JOIN classes c ON c.id = as2.class_id
       JOIN subjects s ON s.id = as2.subject_id
       WHERE as2.id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Session');
    }

    return result.rows[0]!;
  }

  async getSessionAttendance(sessionId: string): Promise<
    (AttendanceRecord & { student_name: string; student_email: string })[]
  > {
    const result = await query<AttendanceRecord & { student_name: string; student_email: string }>(
      `SELECT ar.*, u.name as student_name, u.email as student_email
       FROM attendance_records ar
       JOIN users u ON u.id = ar.student_id
       WHERE ar.session_id = $1
       ORDER BY ar.marked_at ASC`,
      [sessionId]
    );

    return result.rows;
  }

  async getTeacherSessions(
    teacherId: string,
    filters: { classId?: string; status?: string; page?: number; limit?: number }
  ): Promise<{ sessions: AttendanceSession[]; total: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['as2.teacher_id = $1'];
    const params: unknown[] = [teacherId];
    let paramIndex = 2;

    if (filters.classId) {
      conditions.push(`as2.class_id = $${paramIndex++}`);
      params.push(filters.classId);
    }

    if (filters.status) {
      conditions.push(`as2.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    const whereClause = conditions.join(' AND ');

    const [sessionsResult, countResult] = await Promise.all([
      query<AttendanceSession>(
        `SELECT as2.*, c.name as class_name, s.name as subject_name
         FROM attendance_sessions as2
         JOIN classes c ON c.id = as2.class_id
         JOIN subjects s ON s.id = as2.subject_id
         WHERE ${whereClause}
         ORDER BY as2.start_time DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM attendance_sessions as2 WHERE ${whereClause}`,
        params
      ),
    ]);

    return {
      sessions: sessionsResult.rows,
      total: parseInt(countResult.rows[0]?.count || '0', 10),
    };
  }

  async getStudentAttendance(
    studentId: string,
    filters: AttendanceFilter
  ): Promise<{
    records: AttendanceRecord[];
    summary: AttendanceSummary;
    total: number;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['ar.student_id = $1'];
    const params: unknown[] = [studentId];
    let paramIndex = 2;

    if (filters.classId) {
      conditions.push(`ar.class_id = $${paramIndex++}`);
      params.push(filters.classId);
    }

    if (filters.subjectId) {
      conditions.push(`ar.subject_id = $${paramIndex++}`);
      params.push(filters.subjectId);
    }

    if (filters.dateFrom) {
      conditions.push(`ar.date >= $${paramIndex++}`);
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push(`ar.date <= $${paramIndex++}`);
      params.push(filters.dateTo);
    }

    if (filters.status) {
      conditions.push(`ar.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    const whereClause = conditions.join(' AND ');

    const [recordsResult, countResult, summaryResult] = await Promise.all([
      query<AttendanceRecord>(
        `SELECT ar.*, s.name as subject_name, c.name as class_name
         FROM attendance_records ar
         JOIN subjects s ON s.id = ar.subject_id
         JOIN classes c ON c.id = ar.class_id
         WHERE ${whereClause}
         ORDER BY ar.date DESC, ar.marked_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM attendance_records ar WHERE ${whereClause}`,
        params
      ),
      query<AttendanceSummary & { total: string; present: string; absent: string; late: string; leave: string; manual_override: string }>(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE ar.status = 'present') as present,
           COUNT(*) FILTER (WHERE ar.status = 'absent') as absent,
           COUNT(*) FILTER (WHERE ar.status = 'late') as late,
           COUNT(*) FILTER (WHERE ar.status = 'leave') as leave,
           COUNT(*) FILTER (WHERE ar.status = 'manual_override') as manual_override
         FROM attendance_records ar
         WHERE ${whereClause}`,
        params
      ),
    ]);

    const rawSummary = summaryResult.rows[0];
    const total = parseInt(rawSummary?.total || '0', 10);
    const present = parseInt(rawSummary?.present || '0', 10);
    const late = parseInt(rawSummary?.late || '0', 10);
    const leave = parseInt(rawSummary?.leave || '0', 10);
    const manualOverride = parseInt(rawSummary?.manual_override || '0', 10);
    const attended = present + late + manualOverride;

    const summary: AttendanceSummary = {
      total,
      present,
      absent: parseInt(rawSummary?.absent || '0', 10),
      late,
      leave,
      manual_override: manualOverride,
      percentage: total > 0 ? Math.round((attended / total) * 100) : 0,
    };

    return {
      records: recordsResult.rows,
      summary,
      total: parseInt(countResult.rows[0]?.count || '0', 10),
    };
  }

  async getClassAttendance(
    classId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<unknown[]> {
    const conditions: string[] = ['ar.class_id = $1'];
    const params: unknown[] = [classId];
    let paramIndex = 2;

    if (dateFrom) {
      conditions.push(`ar.date >= $${paramIndex++}`);
      params.push(dateFrom);
    }

    if (dateTo) {
      conditions.push(`ar.date <= $${paramIndex++}`);
      params.push(dateTo);
    }

    const result = await query(
      `SELECT u.id as student_id, u.name as student_name,
              ar.date, ar.status, ar.confidence_score,
              s.name as subject_name, s.id as subject_id
       FROM attendance_records ar
       JOIN users u ON u.id = ar.student_id
       JOIN subjects s ON s.id = ar.subject_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ar.date DESC, u.name ASC`,
      params
    );

    return result.rows;
  }

  async updateAttendanceStatus(
    recordId: string,
    status: AttendanceStatus,
    updatedBy: string
  ): Promise<void> {
    const result = await query(
      `UPDATE attendance_records
       SET status = $1, updated_at = NOW(), created_by = $2
       WHERE id = $3`,
      [status, updatedBy, recordId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Attendance record');
    }

    logger.info('Attendance status updated', { recordId, status, updatedBy });
  }

  async getAttendanceSummary(
    classId: string,
    subjectId?: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<unknown[]> {
    const conditions: string[] = ['ar.class_id = $1', "u.role = 'student'"];
    const params: unknown[] = [classId];
    let paramIndex = 2;

    if (subjectId) {
      conditions.push(`ar.subject_id = $${paramIndex++}`);
      params.push(subjectId);
    }

    if (dateFrom) {
      conditions.push(`ar.date >= $${paramIndex++}`);
      params.push(dateFrom);
    }

    if (dateTo) {
      conditions.push(`ar.date <= $${paramIndex++}`);
      params.push(dateTo);
    }

    const result = await query(
      `SELECT
         u.id as student_id, u.name as student_name, u.email as student_email,
         COUNT(*) as total_sessions,
         COUNT(*) FILTER (WHERE ar.status IN ('present', 'late', 'manual_override')) as attended,
         COUNT(*) FILTER (WHERE ar.status = 'present') as present,
         COUNT(*) FILTER (WHERE ar.status = 'absent') as absent,
         COUNT(*) FILTER (WHERE ar.status = 'late') as late,
         COUNT(*) FILTER (WHERE ar.status = 'leave') as leave,
         ROUND(
           COUNT(*) FILTER (WHERE ar.status IN ('present', 'late', 'manual_override')) * 100.0
           / NULLIF(COUNT(*), 0), 2
         ) as attendance_percentage
       FROM attendance_records ar
       JOIN users u ON u.id = ar.student_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY u.id, u.name, u.email
       ORDER BY attendance_percentage ASC`,
      params
    );

    return result.rows;
  }

  async getDefaultersList(
    classId: string,
    threshold: number = 75
  ): Promise<unknown[]> {
    const result = await query(
      `WITH student_attendance AS (
         SELECT
           ar.student_id,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE ar.status IN ('present', 'late', 'manual_override')) as attended
         FROM attendance_records ar
         WHERE ar.class_id = $1
         GROUP BY ar.student_id
       )
       SELECT
         u.id, u.name, u.email, u.phone, u.photo_url,
         sa.total as total_sessions,
         sa.attended as attended_sessions,
         ROUND(sa.attended * 100.0 / NULLIF(sa.total, 0), 2) as attendance_percentage
       FROM student_attendance sa
       JOIN users u ON u.id = sa.student_id
       WHERE (sa.attended * 100.0 / NULLIF(sa.total, 0)) < $2
       ORDER BY (sa.attended * 100.0 / NULLIF(sa.total, 0)) ASC`,
      [classId, threshold]
    );

    return result.rows;
  }

  async getDailyReport(classId: string, date: string): Promise<unknown[]> {
    const result = await query(
      `SELECT
         u.id as student_id, u.name as student_name,
         ar.status, ar.confidence_score, ar.marked_at,
         s.name as subject_name, as2.start_time, as2.end_time
       FROM attendance_records ar
       JOIN users u ON u.id = ar.student_id
       JOIN subjects s ON s.id = ar.subject_id
       JOIN attendance_sessions as2 ON as2.id = ar.session_id
       WHERE ar.class_id = $1 AND ar.date = $2
       ORDER BY u.name, ar.marked_at`,
      [classId, date]
    );

    return result.rows;
  }

  async getMonthlyReport(
    classId: string,
    month: number,
    year: number
  ): Promise<unknown[]> {
    const result = await query(
      `SELECT
         u.id as student_id, u.name as student_name,
         ar.date,
         ar.status, ar.confidence_score,
         s.name as subject_name
       FROM attendance_records ar
       JOIN users u ON u.id = ar.student_id
       JOIN subjects s ON s.id = ar.subject_id
       WHERE ar.class_id = $1
         AND EXTRACT(MONTH FROM ar.date) = $2
         AND EXTRACT(YEAR FROM ar.date) = $3
       ORDER BY ar.date, u.name`,
      [classId, month, year]
    );

    return result.rows;
  }

  async getDashboardStats(): Promise<{
    totalStudents: number;
    totalTeachers: number;
    totalClasses: number;
    todayAttendance: number;
    activeSessions: number;
    overallAttendanceRate: number;
  }> {
    const results = await Promise.all([
      query<{ count: string }>("SELECT COUNT(*) as count FROM users WHERE role = 'student' AND is_active = true"),
      query<{ count: string }>("SELECT COUNT(*) as count FROM users WHERE role = 'teacher' AND is_active = true"),
      query<{ count: string }>('SELECT COUNT(*) as count FROM classes'),
      query<{ count: string }>('SELECT COUNT(*) as count FROM attendance_records WHERE date = CURRENT_DATE'),
      query<{ count: string }>("SELECT COUNT(*) as count FROM attendance_sessions WHERE status = 'active'"),
      query<{ rate: string | null }>(
        `SELECT ROUND(
           COUNT(*) FILTER (WHERE status IN ('present', 'late', 'manual_override')) * 100.0
           / NULLIF(COUNT(*), 0), 2
         ) as rate FROM attendance_records`
      ),
    ]);

    return {
      totalStudents: parseInt(results[0]!.rows[0]?.count || '0', 10),
      totalTeachers: parseInt(results[1]!.rows[0]?.count || '0', 10),
      totalClasses: parseInt(results[2]!.rows[0]?.count || '0', 10),
      todayAttendance: parseInt(results[3]!.rows[0]?.count || '0', 10),
      activeSessions: parseInt(results[4]!.rows[0]?.count || '0', 10),
      overallAttendanceRate: parseFloat(results[5]!.rows[0]?.rate || '0'),
    };
  }
}

export const attendanceService = new AttendanceService();
export default attendanceService;
