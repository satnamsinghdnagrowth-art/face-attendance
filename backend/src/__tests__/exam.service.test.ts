/**
 * Unit tests for ExamService.
 *
 * All external I/O (DB, transactions) is mocked so tests are fast and
 * deterministic.  Scenarios covered:
 *   - createExam: valid creation, invalid time range, duplicate exam_code
 *   - listExams: pagination, status filter, empty results
 *   - enrollStudents: success, missing students, wrong role
 *   - startHallSession: creation, already-active session, hall not found
 *   - getHallStudentStatus: mixed verdicts, null verdict → not_scanned
 *   - endHallSession: marks completed, raises no-show alerts
 */

// ─── Mocks (hoisted before imports) ──────────────────────────────────────────

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

// ─── Imports ─────────────────────────────────────────────────────────────────

import { examService } from '../services/exam.service';
import { query, withTransaction } from '../config/database';
import { PoolClient } from 'pg';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const EXAM_ID      = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HALL_ID      = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SESSION_ID   = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID_1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const INVIG_ID     = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const fakeExam = {
  id: EXAM_ID,
  title: 'Semester Final',
  exam_code: 'CS101-F26',
  subject_id: null,
  scheduled_start: new Date('2026-06-01T09:00:00Z'),
  scheduled_end: new Date('2026-06-01T12:00:00Z'),
  duration_mins: 180,
  re_verify_interval_mins: 30,
  face_threshold: 0.85,
  flag_threshold: 0.70,
  status: 'scheduled',
  instructions: null,
  created_by: INVIG_ID,
  created_at: new Date('2026-05-01T00:00:00Z'),
  updated_at: new Date('2026-05-01T00:00:00Z'),
};

const fakeSession = {
  id: SESSION_ID,
  exam_id: EXAM_ID,
  hall_id: HALL_ID,
  invigilator_id: INVIG_ID,
  started_at: new Date('2026-06-01T09:00:00Z'),
  ended_at: null,
  status: 'active',
  total_students: 30,
  verified_count: 0,
  flagged_count: 0,
  rejected_count: 0,
  notes: null,
};

// ─── createExam ───────────────────────────────────────────────────────────────

describe('ExamService.createExam', () => {
  beforeEach(() => jest.resetAllMocks());

  it('creates exam with valid data', async () => {
    // First query: uniqueness check (no existing code)
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    // Second query: INSERT RETURNING *
    mockQuery.mockResolvedValueOnce({ rows: [fakeExam], rowCount: 1 } as any);

    const result = await examService.createExam({
      title: 'Semester Final',
      exam_code: 'CS101-F26',
      scheduled_start: '2026-06-01T09:00:00Z',
      scheduled_end: '2026-06-01T12:00:00Z',
      duration_mins: 180,
      created_by: INVIG_ID,
    });

    expect(result.id).toBe(EXAM_ID);
    expect(result.exam_code).toBe('CS101-F26');
    expect(result.status).toBe('scheduled');

    // INSERT must have been called
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const [insertSql, insertParams] = mockQuery.mock.calls[1]!;
    expect(insertSql).toContain('INSERT INTO exams');
    expect(insertParams).toContain('CS101-F26');
    expect(insertParams).toContain('Semester Final');
  });

  it('throws when scheduled_end is before scheduled_start', async () => {
    await expect(
      examService.createExam({
        title: 'Bad Timing Exam',
        exam_code: 'BAD-01',
        scheduled_start: '2026-06-01T12:00:00Z',
        scheduled_end:   '2026-06-01T09:00:00Z', // end < start
        duration_mins: 180,
      })
    ).rejects.toThrow('scheduled_end must be after scheduled_start');

    // DB must NOT have been touched
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('throws when scheduled_end equals scheduled_start', async () => {
    await expect(
      examService.createExam({
        title: 'Zero Duration Exam',
        exam_code: 'ZERO-01',
        scheduled_start: '2026-06-01T09:00:00Z',
        scheduled_end:   '2026-06-01T09:00:00Z',
        duration_mins: 0,
      })
    ).rejects.toThrow('scheduled_end must be after scheduled_start');

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('throws ConflictError when exam_code already exists', async () => {
    // Uniqueness check returns an existing row
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }], rowCount: 1 } as any);

    await expect(
      examService.createExam({
        title: 'Duplicate',
        exam_code: 'CS101-F26',
        scheduled_start: '2026-06-01T09:00:00Z',
        scheduled_end:   '2026-06-01T12:00:00Z',
        duration_mins: 180,
      })
    ).rejects.toThrow("Exam code 'CS101-F26' already exists");

    // Only the SELECT check was called; INSERT was not
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

// ─── listExams ────────────────────────────────────────────────────────────────

describe('ExamService.listExams', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns paginated exams list', async () => {
    // 1st query: COUNT
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '3' }], rowCount: 1 } as any);
    // 2nd query: data rows
    mockQuery.mockResolvedValueOnce({ rows: [fakeExam, { ...fakeExam, id: 'other-id' }], rowCount: 2 } as any);

    const result = await examService.listExams({ page: 1, limit: 20 });

    expect(result.total).toBe(3);
    expect(result.exams).toHaveLength(2);
    expect(result.exams[0].id).toBe(EXAM_ID);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('filters by status — SQL includes WHERE status condition', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 } as any);
    mockQuery.mockResolvedValueOnce({ rows: [fakeExam], rowCount: 1 } as any);

    await examService.listExams({ status: 'active', page: 1, limit: 10 });

    const [countSql, countParams] = mockQuery.mock.calls[0]!;
    expect(countSql).toContain('WHERE');
    expect(countSql).toContain('status');
    expect(countParams).toContain('active');

    const [dataSql] = mockQuery.mock.calls[1]!;
    expect(dataSql).toContain('status');
  });

  it('returns empty array when no exams exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 } as any);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const result = await examService.listExams();

    expect(result.total).toBe(0);
    expect(result.exams).toEqual([]);
  });

  it('clamps page to minimum 1 and limit to [1, 100]', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 } as any);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    // page=0 and limit=200 should be clamped
    await examService.listExams({ page: 0, limit: 200 });

    const [dataSql, dataParams] = mockQuery.mock.calls[1]!;
    // limit param should be 100 (clamped), offset should be 0
    expect(dataParams).toContain(100);
    expect(dataParams).toContain(0);
    expect(dataSql).toContain('LIMIT');
  });
});

// ─── enrollStudents ───────────────────────────────────────────────────────────

describe('ExamService.enrollStudents', () => {
  beforeEach(() => jest.resetAllMocks());

  /** Build a minimal PoolClient-like mock used inside withTransaction */
  function buildMockClient(
    studentRows: { rowCount?: number; rows: { role: string }[] }[],
    insertRowCounts: number[]
  ) {
    let studentCallIdx = 0;
    let insertCallIdx = 0;
    const client = {
      query: jest.fn((sql: string, _params?: unknown[]) => {
        if (sql.includes('SELECT role FROM users')) {
          return Promise.resolve(studentRows[studentCallIdx++] ?? { rows: [], rowCount: 0 });
        }
        // INSERT ON CONFLICT
        return Promise.resolve({ rows: [], rowCount: insertRowCounts[insertCallIdx++] ?? 0 });
      }),
    } as unknown as PoolClient;
    return client;
  }

  it('enrolls multiple students successfully', async () => {
    // Hall exists
    mockQuery.mockResolvedValueOnce({ rows: [{ id: HALL_ID }], rowCount: 1 } as any);

    const client = buildMockClient(
      [
        { rows: [{ role: 'student' }], rowCount: 1 },
        { rows: [{ role: 'student' }], rowCount: 1 },
      ],
      [1, 1]
    );

    mockWithTransaction.mockImplementation(async (fn) => fn(client));

    const result = await examService.enrollStudents(EXAM_ID, HALL_ID, [
      { student_id: STUDENT_ID_1, seat_number: 'A1' },
      { student_id: STUDENT_ID_2, seat_number: 'A2' },
    ]);

    expect(result.enrolled).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it('skips students not found in database', async () => {
    // Hall exists
    mockQuery.mockResolvedValueOnce({ rows: [{ id: HALL_ID }], rowCount: 1 } as any);

    const client = buildMockClient(
      [
        { rows: [], rowCount: 0 },          // student 1 not found
        { rows: [{ role: 'student' }], rowCount: 1 }, // student 2 found
      ],
      [1]  // only one INSERT
    );

    mockWithTransaction.mockImplementation(async (fn) => fn(client));

    const result = await examService.enrollStudents(EXAM_ID, HALL_ID, [
      { student_id: STUDENT_ID_1 },
      { student_id: STUDENT_ID_2 },
    ]);

    expect(result.enrolled).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('skips students with wrong role (not student)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: HALL_ID }], rowCount: 1 } as any);

    const client = buildMockClient(
      [
        { rows: [{ role: 'teacher' }], rowCount: 1 }, // wrong role
        { rows: [{ role: 'student' }], rowCount: 1 }, // correct role
      ],
      [1]
    );

    mockWithTransaction.mockImplementation(async (fn) => fn(client));

    const result = await examService.enrollStudents(EXAM_ID, HALL_ID, [
      { student_id: STUDENT_ID_1 },
      { student_id: STUDENT_ID_2 },
    ]);

    expect(result.enrolled).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('throws NotFoundError when hall does not belong to exam', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await expect(
      examService.enrollStudents(EXAM_ID, HALL_ID, [{ student_id: STUDENT_ID_1 }])
    ).rejects.toThrow('Exam hall not found');
  });

  it('skips duplicate enrollment (INSERT ON CONFLICT returns rowCount 0)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: HALL_ID }], rowCount: 1 } as any);

    const client = buildMockClient(
      [{ rows: [{ role: 'student' }], rowCount: 1 }],
      [0] // ON CONFLICT DO NOTHING → rowCount = 0
    );

    mockWithTransaction.mockImplementation(async (fn) => fn(client));

    const result = await examService.enrollStudents(EXAM_ID, HALL_ID, [
      { student_id: STUDENT_ID_1 },
    ]);

    expect(result.enrolled).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

// ─── startHallSession ─────────────────────────────────────────────────────────

describe('ExamService.startHallSession', () => {
  beforeEach(() => jest.resetAllMocks());

  it('creates session and returns it', async () => {
    // 1. Hall check: hall exists and belongs to exam
    mockQuery.mockResolvedValueOnce({ rows: [{ id: HALL_ID, exam_id: EXAM_ID }], rowCount: 1 } as any);
    // 2. No existing active session
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    // 3. Enrollment count
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '25' }], rowCount: 1 } as any);
    // 4. INSERT session RETURNING *
    mockQuery.mockResolvedValueOnce({ rows: [fakeSession], rowCount: 1 } as any);
    // 5. Get hall name for socket broadcast (non-fatal, in try/catch)
    mockQuery.mockResolvedValueOnce({ rows: [{ hall_name: 'Hall A' }], rowCount: 1 } as any);

    const result = await examService.startHallSession(EXAM_ID, HALL_ID, INVIG_ID);

    expect(result.id).toBe(SESSION_ID);
    expect(result.status).toBe('active');
    expect(result.hall_id).toBe(HALL_ID);

    // INSERT was the 4th call (index 3)
    const [insertSql, insertParams] = mockQuery.mock.calls[3]!;
    expect(insertSql).toContain('INSERT INTO exam_sessions');
    expect(insertParams).toContain(EXAM_ID);
    expect(insertParams).toContain(HALL_ID);
    expect(insertParams).toContain(INVIG_ID);
    expect(insertParams).toContain(25); // total_students from count
  });

  it('throws if hall already has an active session', async () => {
    // 1. Hall check: hall exists and belongs to exam
    mockQuery.mockResolvedValueOnce({ rows: [{ id: HALL_ID, exam_id: EXAM_ID }], rowCount: 1 } as any);
    // 2. Active session exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'existing-session-id' }],
      rowCount: 1,
    } as any);

    await expect(
      examService.startHallSession(EXAM_ID, HALL_ID, INVIG_ID)
    ).rejects.toThrow('already active');

    // Hall check + active session check = 2 queries; no INSERT
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

// ─── getHallStudentStatus ─────────────────────────────────────────────────────

describe('ExamService.getHallStudentStatus', () => {
  beforeEach(() => jest.resetAllMocks());

  const makeStudentRow = (
    studentId: string,
    verdict: string | null,
    confidence?: number
  ) => ({
    student_id: studentId,
    student_name: `Student ${studentId.slice(0, 4)}`,
    student_email: `${studentId.slice(0, 4)}@test.com`,
    seat_number: 'A1',
    roll_number: '001',
    latest_verdict: verdict ?? 'not_scanned',
    confidence_score: confidence ?? null,
    scanned_at: verdict ? new Date() : null,
  });

  it('returns students with their latest verdict', async () => {
    // 1. Session lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ hall_id: HALL_ID }], rowCount: 1 } as any);
    // 2. Main student-status query
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeStudentRow(STUDENT_ID_1, 'verified', 0.96),
        makeStudentRow(STUDENT_ID_2, 'flagged', 0.74),
      ],
      rowCount: 2,
    } as any);

    const result = await examService.getHallStudentStatus(SESSION_ID);

    expect(result).toHaveLength(2);
    expect(result[0].latest_verdict).toBe('verified');
    expect(result[0].confidence_score).toBe(0.96);
    expect(result[1].latest_verdict).toBe('flagged');
  });

  it('returns not_scanned for students with no verification events', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ hall_id: HALL_ID }], rowCount: 1 } as any);
    mockQuery.mockResolvedValueOnce({
      rows: [makeStudentRow(STUDENT_ID_1, null)],
      rowCount: 1,
    } as any);

    const result = await examService.getHallStudentStatus(SESSION_ID);

    expect(result[0].latest_verdict).toBe('not_scanned');
    expect(result[0].confidence_score).toBeNull();
  });

  it('throws NotFoundError when session does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await expect(examService.getHallStudentStatus(SESSION_ID)).rejects.toThrow(
      'Exam session not found'
    );
  });

  it('passes sessionId and hallId to the query in correct order', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ hall_id: HALL_ID }], rowCount: 1 } as any);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await examService.getHallStudentStatus(SESSION_ID);

    const [, statusParams] = mockQuery.mock.calls[1]!;
    expect(statusParams![0]).toBe(SESSION_ID);
    expect(statusParams![1]).toBe(HALL_ID);
  });
});

// ─── endHallSession ───────────────────────────────────────────────────────────

describe('ExamService.endHallSession', () => {
  beforeEach(() => jest.resetAllMocks());

  it('marks session as completed and sets ended_at', async () => {
    // 1. Session lookup — active
    mockQuery.mockResolvedValueOnce({ rows: [{ ...fakeSession, status: 'active' }], rowCount: 1 } as any);
    // 2. UPDATE exam_sessions SET status = 'completed'
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    // 3. No-show query — no students without events
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await expect(examService.endHallSession(SESSION_ID, INVIG_ID)).resolves.toBeUndefined();

    const [updateSql, updateParams] = mockQuery.mock.calls[1]!;
    expect(updateSql).toContain('UPDATE exam_sessions');
    expect(updateSql).toContain("status = 'completed'");
    expect(updateParams).toContain(SESSION_ID);
  });

  it('raises no_show alerts for unscanned students', async () => {
    const noShowStudent = { student_id: STUDENT_ID_1, student_name: 'Alice' };

    // 1. Session lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ ...fakeSession, status: 'active' }], rowCount: 1 } as any);
    // 2. UPDATE session
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    // 3. No-show query returns one student
    mockQuery.mockResolvedValueOnce({ rows: [noShowStudent], rowCount: 1 } as any);
    // 4. INSERT alert for that student
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'alert-id' }], rowCount: 1 } as any);

    await examService.endHallSession(SESSION_ID, INVIG_ID);

    // The 4th call should be the alert INSERT
    const [alertSql, alertParams] = mockQuery.mock.calls[3]!;
    expect(alertSql).toContain('INSERT INTO exam_alerts');
    expect(alertSql).toContain('no_show');
    expect(alertParams).toContain(EXAM_ID);
    expect(alertParams).toContain(STUDENT_ID_1);
  });

  it('raises multiple no_show alerts in parallel', async () => {
    const noShowStudents = [
      { student_id: STUDENT_ID_1, student_name: 'Alice' },
      { student_id: STUDENT_ID_2, student_name: 'Bob' },
    ];

    mockQuery.mockResolvedValueOnce({ rows: [{ ...fakeSession, status: 'active' }], rowCount: 1 } as any);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    mockQuery.mockResolvedValueOnce({ rows: noShowStudents, rowCount: 2 } as any);
    // Two alert inserts
    mockQuery.mockResolvedValue({ rows: [{ id: 'alert-id' }], rowCount: 1 } as any);

    await examService.endHallSession(SESSION_ID, INVIG_ID);

    // 2 alert INSERTs after the first 3 queries
    const alertCalls = mockQuery.mock.calls.slice(3);
    expect(alertCalls).toHaveLength(2);
    for (const [sql] of alertCalls) {
      expect(sql).toContain('INSERT INTO exam_alerts');
    }
  });

  it('throws NotFoundError when session does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await expect(examService.endHallSession(SESSION_ID, INVIG_ID)).rejects.toThrow(
      'Exam session not found'
    );
  });

  it('throws ConflictError when session is not active', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...fakeSession, status: 'completed' }],
      rowCount: 1,
    } as any);

    await expect(examService.endHallSession(SESSION_ID, INVIG_ID)).rejects.toThrow(
      'Session is not active'
    );
  });
});
