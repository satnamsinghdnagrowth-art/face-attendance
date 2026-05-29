import { query, withTransaction } from '../config/database';
import { CustomError, NotFoundError } from '../middleware/error.middleware';
import { notificationService } from './notification.service';
import logger from '../utils/logger';
import { PoolClient } from 'pg';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateExamDto {
  title: string;
  exam_code: string;
  subject_id?: string;
  scheduled_start: string | Date;
  scheduled_end: string | Date;
  duration_mins: number;
  re_verify_interval_mins?: number;
  face_threshold?: number;
  flag_threshold?: number;
  instructions?: string;
  created_by?: string;
}

export interface CreateHallDto {
  hall_name: string;
  capacity: number;
  invigilator_id?: string;
  floor?: string;
  building?: string;
}

export interface EnrollStudentDto {
  student_id: string;
  seat_number?: string;
  roll_number?: string;
}

// ─── Entity interfaces ────────────────────────────────────────────────────────

export interface Exam {
  id: string;
  title: string;
  exam_code: string;
  subject_id?: string;
  scheduled_start: Date;
  scheduled_end: Date;
  duration_mins: number;
  re_verify_interval_mins: number;
  face_threshold: number;
  flag_threshold: number;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  instructions?: string;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ExamHall {
  id: string;
  exam_id: string;
  hall_name: string;
  capacity: number;
  invigilator_id?: string;
  invigilator_name?: string;
  floor?: string;
  building?: string;
  created_at: Date;
}

export interface ExamSession {
  id: string;
  exam_id: string;
  hall_id: string;
  invigilator_id: string;
  started_at: Date;
  ended_at?: Date;
  status: 'active' | 'completed' | 'aborted';
  total_students: number;
  verified_count: number;
  flagged_count: number;
  rejected_count: number;
  notes?: string;
}

export interface ExamEnrollment {
  id: string;
  exam_id: string;
  hall_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  seat_number?: string;
  roll_number?: string;
  enrolled_at: Date;
}

export interface ExamWithStats extends Exam {
  halls: ExamHall[];
  total_enrolled: number;
  total_halls: number;
}

export interface StudentSessionStatus {
  student_id: string;
  student_name: string;
  student_email: string;
  seat_number?: string;
  roll_number?: string;
  latest_verdict: 'verified' | 'flagged' | 'rejected' | 'not_scanned' | 'proxy_suspect';
  confidence_score?: number;
  scanned_at?: Date;
}

export interface ExamStats {
  total_enrolled: number;
  verified: number;
  flagged: number;
  rejected: number;
  no_show: number;
  proxy_suspects: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ExamService {
  // 1. Create exam
  async createExam(data: CreateExamDto): Promise<Exam> {
    const start = new Date(data.scheduled_start);
    const end = new Date(data.scheduled_end);

    if (end <= start) {
      throw new CustomError('scheduled_end must be after scheduled_start', 400);
    }

    // Check exam_code uniqueness
    const existing = await query<{ id: string }>(
      'SELECT id FROM exams WHERE exam_code = $1',
      [data.exam_code]
    );
    if (existing.rows.length > 0) {
      throw new CustomError(`Exam code '${data.exam_code}' already exists`, 409);
    }

    const result = await query<Exam>(
      `INSERT INTO exams (
         title, exam_code, subject_id, scheduled_start, scheduled_end,
         duration_mins, re_verify_interval_mins, face_threshold, flag_threshold,
         instructions, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        data.title,
        data.exam_code,
        data.subject_id ?? null,
        start,
        end,
        data.duration_mins,
        data.re_verify_interval_mins ?? 0,
        data.face_threshold ?? 0.85,
        data.flag_threshold ?? 0.70,
        data.instructions ?? null,
        data.created_by ?? null,
      ]
    );

    logger.info('Exam created', { examId: result.rows[0].id, examCode: data.exam_code });
    return result.rows[0];
  }

  // 2. Get exam with stats
  async getExam(examId: string): Promise<ExamWithStats> {
    const examResult = await query<Exam>(
      'SELECT * FROM exams WHERE id = $1',
      [examId]
    );
    if (examResult.rows.length === 0) {
      throw new NotFoundError('Exam');
    }
    const exam = examResult.rows[0];

    const hallsResult = await query<ExamHall>(
      `SELECT eh.*,
              u.name AS invigilator_name
       FROM exam_halls eh
       LEFT JOIN users u ON u.id = eh.invigilator_id
       WHERE eh.exam_id = $1
       ORDER BY eh.hall_name`,
      [examId]
    );

    const enrollCountResult = await query<{ total: string }>(
      'SELECT COUNT(*) AS total FROM exam_enrollments WHERE exam_id = $1',
      [examId]
    );

    const total_enrolled = parseInt(enrollCountResult.rows[0]?.total ?? '0', 10);
    const halls = hallsResult.rows;

    return {
      ...exam,
      halls,
      total_enrolled,
      total_halls: halls.length,
    };
  }

  // 3. List exams with pagination and optional status filter
  async listExams(
    filters: { status?: string; page?: number; limit?: number } = {}
  ): Promise<{ exams: Exam[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM exams ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    params.push(limit, offset);
    const dataResult = await query<Exam>(
      `SELECT * FROM exams ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return { exams: dataResult.rows, total };
  }

  // 4. Update exam
  async updateExam(examId: string, data: Partial<CreateExamDto>): Promise<Exam> {
    const existingResult = await query<{ status: string }>(
      'SELECT status FROM exams WHERE id = $1',
      [examId]
    );
    if (existingResult.rows.length === 0) {
      throw new NotFoundError('Exam');
    }
    const { status } = existingResult.rows[0];
    if (status === 'active' || status === 'completed') {
      throw new CustomError(`Cannot update an exam with status '${status}'`, 409);
    }

    if (data.scheduled_start && data.scheduled_end) {
      const start = new Date(data.scheduled_start);
      const end = new Date(data.scheduled_end);
      if (end <= start) {
        throw new CustomError('scheduled_end must be after scheduled_start', 400);
      }
    }

    const fields: string[] = [];
    const params: unknown[] = [];

    const addField = (col: string, value: unknown) => {
      if (value !== undefined) {
        params.push(value);
        fields.push(`${col} = $${params.length}`);
      }
    };

    addField('title', data.title);
    addField('exam_code', data.exam_code);
    addField('subject_id', data.subject_id);
    addField('scheduled_start', data.scheduled_start ? new Date(data.scheduled_start) : undefined);
    addField('scheduled_end', data.scheduled_end ? new Date(data.scheduled_end) : undefined);
    addField('duration_mins', data.duration_mins);
    addField('re_verify_interval_mins', data.re_verify_interval_mins);
    addField('face_threshold', data.face_threshold);
    addField('flag_threshold', data.flag_threshold);
    addField('instructions', data.instructions);

    if (fields.length === 0) {
      throw new CustomError('No fields to update', 400);
    }

    params.push(examId);
    const result = await query<Exam>(
      `UPDATE exams SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    logger.info('Exam updated', { examId });
    return result.rows[0];
  }

  // 5. Create hall
  async createHall(examId: string, data: CreateHallDto): Promise<ExamHall> {
    const examResult = await query<{ id: string }>(
      'SELECT id FROM exams WHERE id = $1',
      [examId]
    );
    if (examResult.rows.length === 0) {
      throw new NotFoundError('Exam');
    }

    if (data.invigilator_id) {
      const invigResult = await query<{ role: string }>(
        'SELECT role FROM users WHERE id = $1 AND is_active = true',
        [data.invigilator_id]
      );
      if (invigResult.rows.length === 0) {
        throw new NotFoundError('Invigilator user');
      }
      if (invigResult.rows[0].role !== 'hall_invigilator') {
        throw new CustomError('Assigned user does not have role hall_invigilator', 400);
      }
    }

    const result = await query<ExamHall>(
      `INSERT INTO exam_halls (exam_id, hall_name, capacity, invigilator_id, floor, building)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        examId,
        data.hall_name,
        data.capacity,
        data.invigilator_id ?? null,
        data.floor ?? null,
        data.building ?? null,
      ]
    );

    logger.info('Exam hall created', { examId, hallId: result.rows[0].id, hallName: data.hall_name });
    return result.rows[0];
  }

  // 6. Get halls with invigilator name
  async getHalls(examId: string): Promise<ExamHall[]> {
    const result = await query<ExamHall>(
      `SELECT eh.*,
              u.name AS invigilator_name
       FROM exam_halls eh
       LEFT JOIN users u ON u.id = eh.invigilator_id
       WHERE eh.exam_id = $1
       ORDER BY eh.hall_name`,
      [examId]
    );
    return result.rows;
  }

  // 7. Enroll students in bulk
  async enrollStudents(
    examId: string,
    hallId: string,
    students: EnrollStudentDto[]
  ): Promise<{ enrolled: number; skipped: number }> {
    // Verify exam and hall exist
    const hallResult = await query<{ id: string }>(
      'SELECT id FROM exam_halls WHERE id = $1 AND exam_id = $2',
      [hallId, examId]
    );
    if (hallResult.rows.length === 0) {
      throw new NotFoundError('Exam hall');
    }

    let enrolled = 0;
    let skipped = 0;

    await withTransaction(async (client: PoolClient) => {
      for (const student of students) {
        // Validate student role
        const userResult = await client.query<{ role: string }>(
          'SELECT role FROM users WHERE id = $1 AND is_active = true',
          [student.student_id]
        );
        if (userResult.rows.length === 0 || userResult.rows[0].role !== 'student') {
          skipped++;
          logger.warn('Skipping enrollment — user not found or not a student', {
            studentId: student.student_id,
          });
          continue;
        }

        const insertResult = await client.query(
          `INSERT INTO exam_enrollments (exam_id, hall_id, student_id, seat_number, roll_number)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (exam_id, student_id) DO NOTHING`,
          [
            examId,
            hallId,
            student.student_id,
            student.seat_number ?? null,
            student.roll_number ?? null,
          ]
        );

        if ((insertResult.rowCount ?? 0) > 0) {
          enrolled++;
        } else {
          skipped++;
        }
      }
    });

    logger.info('Bulk enrollment complete', { examId, hallId, enrolled, skipped });
    return { enrolled, skipped };
  }

  // 8. Get enrollments with optional hall filter
  async getEnrollments(
    examId: string,
    filters?: { hallId?: string }
  ): Promise<ExamEnrollment[]> {
    const conditions = ['ee.exam_id = $1'];
    const params: unknown[] = [examId];

    if (filters?.hallId) {
      params.push(filters.hallId);
      conditions.push(`ee.hall_id = $${params.length}`);
    }

    const result = await query<ExamEnrollment>(
      `SELECT ee.*,
              u.name  AS student_name,
              u.email AS student_email
       FROM exam_enrollments ee
       JOIN users u ON u.id = ee.student_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ee.hall_id, ee.seat_number`,
      params
    );

    return result.rows;
  }

  // 9. Start a hall session
  async startHallSession(
    examId: string,
    hallId: string,
    invigilatorId: string
  ): Promise<ExamSession> {
    // Validate params — surface clear errors to the mobile client
    if (!examId || !hallId || !invigilatorId) {
      throw new CustomError('examId, hallId, and invigilatorId are all required', 400);
    }

    // Verify the hall exists and belongs to this exam
    const hallCheck = await query<{ id: string; exam_id: string }>(
      'SELECT id, exam_id FROM exam_halls WHERE id = $1',
      [hallId]
    );
    if (hallCheck.rows.length === 0) {
      throw new NotFoundError(`Hall ${hallId} not found`);
    }
    if (hallCheck.rows[0].exam_id !== examId) {
      throw new CustomError('Hall does not belong to the specified exam', 400);
    }

    // Check for existing active session in this hall
    const activeResult = await query<{ id: string }>(
      `SELECT id FROM exam_sessions
       WHERE hall_id = $1 AND status = 'active'`,
      [hallId]
    );
    if (activeResult.rows.length > 0) {
      throw new CustomError('A session is already active for this hall. End it first before starting a new one.', 409);
    }

    // Get enrolled student count for this hall
    const countResult = await query<{ total: string }>(
      'SELECT COUNT(*) AS total FROM exam_enrollments WHERE hall_id = $1',
      [hallId]
    );
    const totalStudents = parseInt(countResult.rows[0]?.total ?? '0', 10);

    const result = await query<ExamSession>(
      `INSERT INTO exam_sessions
         (exam_id, hall_id, invigilator_id, total_students)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [examId, hallId, invigilatorId, totalStudents]
    );

    const session = result.rows[0];
    logger.info('Exam session started', { sessionId: session.id, examId, hallId, invigilatorId });

    // Broadcast hall-session start to exam room (updates ChiefExaminerDashboard)
    try {
      const hallRow = await query<{ hall_name: string }>(
        'SELECT hall_name FROM exam_halls WHERE id = $1',
        [hallId]
      );
      notificationService.broadcastHallSessionUpdate(examId, {
        hallId,
        sessionId: session.id,
        event: 'started',
        hallName: hallRow.rows[0]?.hall_name,
      });
    } catch { /* non-fatal */ }

    return session;
  }

  // 10. End a hall session and create no-show alerts
  async endHallSession(sessionId: string, invigilatorId: string): Promise<void> {
    const sessionResult = await query<ExamSession>(
      'SELECT * FROM exam_sessions WHERE id = $1',
      [sessionId]
    );
    if (sessionResult.rows.length === 0) {
      throw new NotFoundError('Exam session');
    }
    const session = sessionResult.rows[0];
    if (session.status !== 'active') {
      throw new CustomError('Session is not active', 409);
    }

    await query(
      `UPDATE exam_sessions
       SET ended_at = NOW(), status = 'completed'
       WHERE id = $1`,
      [sessionId]
    );

    // Find students with no verification event in this session and create no-show alerts
    const noShowResult = await query<{ student_id: string; student_name: string }>(
      `SELECT ee.student_id, u.name AS student_name
       FROM exam_enrollments ee
       JOIN users u ON u.id = ee.student_id
       WHERE ee.hall_id = $1
         AND ee.student_id NOT IN (
           SELECT DISTINCT student_id FROM verification_events WHERE exam_session_id = $2
         )`,
      [session.hall_id, sessionId]
    );

    if (noShowResult.rows.length > 0) {
      const alertInserts = noShowResult.rows.map((row) =>
        query(
          `INSERT INTO exam_alerts
             (exam_id, hall_id, alert_type, severity, message, student_id)
           VALUES ($1,$2,'no_show','medium',$3,$4)`,
          [
            session.exam_id,
            session.hall_id,
            `Student ${row.student_name} did not appear for verification`,
            row.student_id,
          ]
        )
      );
      await Promise.all(alertInserts);
    }

    logger.info('Exam session ended', {
      sessionId,
      invigilatorId,
      noShows: noShowResult.rows.length,
    });
  }

  // 11. Get per-student status within a session
  async getHallStudentStatus(sessionId: string): Promise<StudentSessionStatus[]> {
    const sessionResult = await query<{ hall_id: string }>(
      'SELECT hall_id FROM exam_sessions WHERE id = $1',
      [sessionId]
    );
    if (sessionResult.rows.length === 0) {
      throw new NotFoundError('Exam session');
    }
    const { hall_id } = sessionResult.rows[0];

    const result = await query<StudentSessionStatus>(
      `SELECT
         ee.student_id,
         u.name                                          AS student_name,
         u.email                                         AS student_email,
         ee.seat_number,
         ee.roll_number,
         COALESCE(latest.verdict, 'not_scanned')         AS latest_verdict,
         latest.confidence_score,
         latest.scanned_at
       FROM exam_enrollments ee
       JOIN users u ON u.id = ee.student_id
       LEFT JOIN LATERAL (
         SELECT verdict, confidence_score, scanned_at
         FROM verification_events
         WHERE exam_session_id = $1
           AND student_id = ee.student_id
         ORDER BY scanned_at DESC
         LIMIT 1
       ) latest ON true
       WHERE ee.hall_id = $2
       ORDER BY ee.seat_number`,
      [sessionId, hall_id]
    );

    return result.rows;
  }

  // 12. Get overall exam statistics
  async getExamStats(examId: string): Promise<ExamStats> {
    const examResult = await query<{ id: string }>(
      'SELECT id FROM exams WHERE id = $1',
      [examId]
    );
    if (examResult.rows.length === 0) {
      throw new NotFoundError('Exam');
    }

    const enrollResult = await query<{ total: string }>(
      'SELECT COUNT(*) AS total FROM exam_enrollments WHERE exam_id = $1',
      [examId]
    );

    const verdictResult = await query<{
      verdict: string;
      cnt: string;
    }>(
      `SELECT verdict, COUNT(*) AS cnt
       FROM verification_events
       WHERE exam_id = $1
       GROUP BY verdict`,
      [examId]
    );

    const verdictMap: Record<string, number> = {};
    for (const row of verdictResult.rows) {
      verdictMap[row.verdict] = parseInt(row.cnt, 10);
    }

    const total_enrolled = parseInt(enrollResult.rows[0]?.total ?? '0', 10);
    const verified = verdictMap['verified'] ?? 0;
    const flagged = verdictMap['flagged'] ?? 0;
    const rejected = verdictMap['rejected'] ?? 0;
    const proxy_suspects = verdictMap['proxy_suspect'] ?? 0;

    // no_show = enrolled students with no verification event at all
    const noShowResult = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
       FROM exam_enrollments ee
       WHERE ee.exam_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM verification_events ve
           WHERE ve.exam_id = $1 AND ve.student_id = ee.student_id
         )`,
      [examId]
    );
    const no_show = parseInt(noShowResult.rows[0]?.cnt ?? '0', 10);

    return { total_enrolled, verified, flagged, rejected, no_show, proxy_suspects };
  }

  // 13. Update exam status with transition validation
  //
  // Allowed transitions:
  //   scheduled → active      (admin/chief_examiner manually starts exam)
  //   scheduled → cancelled   (admin cancels before it begins)
  //   active    → completed   (admin closes exam, or auto-close at scheduled_end)
  //   active    → cancelled   (emergency cancellation)
  async updateExamStatus(
    examId: string,
    newStatus: 'active' | 'completed' | 'cancelled',
    changedBy: string
  ): Promise<Exam> {
    const examRow = await query<{ id: string; status: string; exam_code: string; title: string }>(
      'SELECT id, status, exam_code, title FROM exams WHERE id = $1',
      [examId]
    );
    if (examRow.rows.length === 0) throw new NotFoundError('Exam');

    const { status: current, exam_code, title } = examRow.rows[0];

    const ALLOWED: Record<string, string[]> = {
      scheduled: ['active', 'cancelled'],
      active:    ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!(ALLOWED[current] ?? []).includes(newStatus)) {
      throw new CustomError(
        `Cannot transition exam from '${current}' to '${newStatus}'`,
        409
      );
    }

    const result = await query<Exam>(
      `UPDATE exams SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [newStatus, examId]
    );

    logger.info('Exam status updated', { examId, from: current, to: newStatus, changedBy });

    // Broadcast status change to everyone in the exam room
    notificationService.broadcastExamStatusChange(examId, newStatus, exam_code);

    return result.rows[0];
  }
}

export const examService = new ExamService();
export default examService;
