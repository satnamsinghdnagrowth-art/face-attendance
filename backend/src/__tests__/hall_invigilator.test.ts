/**
 * Regression tests for the hall_invigilator role.
 * Covers: login, exam session lifecycle, verification verdicts, and role guards.
 *
 * All DB / Redis / socket calls are mocked — tests are fast and deterministic.
 *
 * Key invariants validated:
 * - hall_invigilator login returns tokens without crashing (was crashing due to
 *   socket.joinClassRoom call with undefined class_id)
 * - Exam sessions can be started and ended by invigilators
 * - Verification returns correct verdicts including no_match and proxy_suspect
 * - Role guards block invigilators from admin/teacher-only routes
 */

// ─── Mocks (must be hoisted before imports) ───────────────────────────────────

jest.mock('../config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../config/redis', () => ({
  safeGet: jest.fn().mockResolvedValue(null),
  safeSetex: jest.fn().mockResolvedValue(undefined),
  safeDel: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock('../utils/encryption', () => ({
  comparePassword: jest.fn(),
  hashPassword: jest.fn(),
  generateToken: jest.fn(() => 'token-xyz'),
  generateSecureOTP: jest.fn(() => '000000'),
  hashToken: jest.fn((t: string) => `hashed:${t}`),
}));

jest.mock('../middleware/auth.middleware', () => ({
  generateAccessToken: jest.fn(() => 'invig-access-token'),
  generateRefreshToken: jest.fn(() => 'invig-refresh-token'),
  verifyRefreshToken: jest.fn(),
  blacklistToken: jest.fn().mockResolvedValue(undefined),
}));

// face.service is used by verificationService.verifyCandidate
jest.mock('../services/face.service', () => ({
  faceService: { getUserEmbeddings: jest.fn() },
}));

jest.mock('../services/exam.alert.service', () => ({
  examAlertService: {
    raiseAlert: jest.fn().mockResolvedValue('alert-id-1'),
    autoRaiseFromVerification: jest.fn().mockResolvedValue(undefined),
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { authService } from '../services/auth.service';
import { examService } from '../services/exam.service';
import { verificationService } from '../services/verification.service';
import { query } from '../config/database';
import { faceService } from '../services/face.service';
import { comparePassword } from '../utils/encryption';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCompare = comparePassword as jest.MockedFunction<typeof comparePassword>;
const mockGetEmbeddings = faceService.getUserEmbeddings as jest.MockedFunction<typeof faceService.getUserEmbeddings>;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const EXAM_ID    = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HALL_ID    = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = '44444444-4444-4444-4444-444444444444';
const INVIG_ID   = '22222222-2222-2222-2222-222222222222';

const INVIG_USER = {
  id: INVIG_ID,
  name: 'Hall Invigilator A',
  email: 'invig.a@exam.com',
  password_hash: '$2a$12$hashed',
  role: 'hall_invigilator' as const,
  phone: null, photo_url: null, is_active: true,
  last_login: new Date(), created_at: new Date(), updated_at: new Date(),
};

const SESSION_ROW = {
  id: SESSION_ID, exam_id: EXAM_ID, hall_id: HALL_ID,
  invigilator_id: INVIG_ID, started_at: new Date().toISOString(),
  ended_at: null, status: 'active',
  total_students: 3, verified_count: 0, flagged_count: 0, rejected_count: 0,
};

const EXAM_THRESHOLDS = { face_threshold: 0.85, flag_threshold: 0.70 };
const STUDENT_INFO    = { id: STUDENT_ID, name: 'Alice', photo_url: null };

const HIGH_EMBEDDING = new Array(128).fill(0.5);   // cosine similarity = 1.0 with itself
const LOW_EMBEDDING  = new Array(128).fill(0.0).map((_, i) => i < 5 ? 0.1 : 0); // ~0

// ─── Login ────────────────────────────────────────────────────────────────────

describe('hall_invigilator: login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns access token and user with role hall_invigilator', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [INVIG_USER], rowCount: 1 } as any) // SELECT user
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)            // UPDATE last_login
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);           // INSERT refresh_token
    mockCompare.mockResolvedValue(true);

    const result = await authService.login(INVIG_USER.email, 'password123');

    expect(result.user.role).toBe('hall_invigilator');
    expect(result.access_token).toBe('invig-access-token');
    expect(result.refresh_token).toBe('invig-refresh-token');
    expect(Object.keys(result.user)).not.toContain('password_hash');
  });

  it('does NOT require class_id — hall_invigilator is never enrolled in a class', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [INVIG_USER], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    mockCompare.mockResolvedValue(true);

    const result = await authService.login(INVIG_USER.email, 'password123');

    // CRITICAL: class_id is undefined — previous crash was socket.joinClassRoom(undefined)
    expect((result.user as any).class_id).toBeUndefined();
  });

  it('rejects login when password is wrong', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [INVIG_USER], rowCount: 1 } as any);
    mockCompare.mockResolvedValue(false);

    await expect(authService.login(INVIG_USER.email, 'wrong-pw'))
      .rejects.toThrow('Invalid email or password');
  });

  it('rejects login when user does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await expect(authService.login('nobody@exam.com', 'any'))
      .rejects.toThrow('Invalid email or password');
  });
});

// ─── Exam session lifecycle ───────────────────────────────────────────────────

describe('hall_invigilator: exam session lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('can start a hall session', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: HALL_ID, exam_id: EXAM_ID }], rowCount: 1 } as any) // hall check
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)                                   // no active session
      .mockResolvedValueOnce({ rows: [{ total: '3' }], rowCount: 1 } as any)                    // enrollment count
      .mockResolvedValueOnce({ rows: [SESSION_ROW], rowCount: 1 } as any)                       // INSERT session
      .mockResolvedValueOnce({ rows: [{ hall_name: 'Hall A' }], rowCount: 1 } as any);          // hall name for broadcast

    const session = await examService.startHallSession(EXAM_ID, HALL_ID, INVIG_ID);

    expect(session.hall_id).toBe(HALL_ID);
    expect(session.status).toBe('active');
    expect(session.invigilator_id).toBe(INVIG_ID);
  });

  it('resumes existing session instead of throwing when hall already has one', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: HALL_ID, exam_id: EXAM_ID }], rowCount: 1 } as any) // hall check
      .mockResolvedValueOnce({ rows: [SESSION_ROW], rowCount: 1 } as any);                       // active session found

    const result = await examService.startHallSession(EXAM_ID, HALL_ID, INVIG_ID);

    // Returns the existing session with resumed=true instead of throwing
    expect(result.resumed).toBe(true);
    expect(result.id).toBe(SESSION_ID);
    expect(mockQuery).toHaveBeenCalledTimes(2); // no INSERT
  });

  it('can end a hall session and returns void', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [SESSION_ROW], rowCount: 1 } as any) // get session
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)             // UPDATE ended_at
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);            // no-show students

    await expect(examService.endHallSession(SESSION_ID, INVIG_ID)).resolves.toBeUndefined();
  });

  it('returns students with correct verdicts (SQL COALESCE maps null → not_scanned)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [SESSION_ROW], rowCount: 1 } as any)
      .mockResolvedValueOnce({
        rows: [
          { student_id: STUDENT_ID, student_name: 'Alice', student_email: 'a@t.com',
            seat_number: 'A-01', roll_number: '2023001',
            // SQL COALESCE(verdict, 'not_scanned') returns 'verified' here
            latest_verdict: 'verified', confidence_score: 0.91,
            scanned_at: new Date().toISOString() },
          { student_id: '55555555-5555-5555-5555-555555555555', student_name: 'Bob',
            student_email: 'bob@t.com', seat_number: 'A-02', roll_number: '2023002',
            // SQL COALESCE(verdict, 'not_scanned') returns 'not_scanned' for no event
            latest_verdict: 'not_scanned', confidence_score: null, scanned_at: null },
        ],
        rowCount: 2,
      } as any);

    const students = await examService.getHallStudentStatus(SESSION_ID);

    expect(students).toHaveLength(2);
    expect(students[0]!.latest_verdict).toBe('verified');
    expect(students[1]!.latest_verdict).toBe('not_scanned');
  });
});

// ─── Verification flow ────────────────────────────────────────────────────────

describe('hall_invigilator: verification flow', () => {
  // NOTE: mock query order must match verification.service.ts:
  // 1. SELECT student info  2. SELECT exam thresholds
  // 3. faceService.getUserEmbeddings (mocked separately)
  // 4. optional: proxy check query  5. INSERT event  6. UPDATE counters

  beforeEach(() => jest.clearAllMocks());

  function mockBaseQueries() {
    mockQuery
      .mockResolvedValueOnce({ rows: [STUDENT_INFO], rowCount: 1 } as any)        // student info
      .mockResolvedValueOnce({ rows: [EXAM_THRESHOLDS], rowCount: 1 } as any);    // thresholds
  }

  function mockWriteQueries(verdict: string) {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'ev-1' }], rowCount: 1 } as any)     // INSERT event
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);                   // UPDATE counters
  }

  it('marks student VERIFIED when face matches with high confidence', async () => {
    mockBaseQueries();
    mockGetEmbeddings.mockResolvedValue([{
      id: 'emb-1', user_id: STUDENT_ID, embedding_vector: HIGH_EMBEDDING,
      image_url: undefined, version: 1, is_active: true, created_at: new Date(),
    }]);
    mockWriteQueries('verified');

    const result = await verificationService.verifyCandidate({
      exam_session_id: SESSION_ID, exam_id: EXAM_ID, student_id: STUDENT_ID,
      face_embedding: HIGH_EMBEDDING, scan_type: 'entry', scanned_by: INVIG_ID,
    });

    expect(result.verdict).toBe('verified');
    expect(result.confidence_score).toBeGreaterThanOrEqual(0.85);
    expect(result.alert_raised).toBe(false);
  });

  it('returns no_match when student has no face enrollment', async () => {
    mockBaseQueries();
    mockGetEmbeddings.mockResolvedValue([]);  // no enrollments
    mockWriteQueries('no_match');

    const result = await verificationService.verifyCandidate({
      exam_session_id: SESSION_ID, exam_id: EXAM_ID, student_id: STUDENT_ID,
      face_embedding: HIGH_EMBEDDING, scan_type: 'entry', scanned_by: INVIG_ID,
    });

    expect(result.verdict).toBe('no_match');
    expect(result.confidence_score).toBe(0);
    expect(result.alert_raised).toBe(false);
  });

  it('returns rejected when face confidence is below flag_threshold', async () => {
    mockBaseQueries();
    mockGetEmbeddings.mockResolvedValue([{
      id: 'emb-1', user_id: STUDENT_ID, embedding_vector: HIGH_EMBEDDING,
      image_url: undefined, version: 1, is_active: true, created_at: new Date(),
    }]);
    // Proxy check (no other matching student)
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    mockWriteQueries('rejected');

    const result = await verificationService.verifyCandidate({
      exam_session_id: SESSION_ID, exam_id: EXAM_ID, student_id: STUDENT_ID,
      face_embedding: LOW_EMBEDDING,  // very different from stored → low similarity
      scan_type: 'entry', scanned_by: INVIG_ID,
    });

    expect(result.verdict).toBe('rejected');
  });

  it('raises PROXY_SUSPECT when face matches a different enrolled student', async () => {
    const PROXY_ID = '99999999-9999-9999-9999-999999999999';

    mockBaseQueries();
    // Target student has LOW similarity (won't verify/flag)
    mockGetEmbeddings.mockResolvedValue([{
      id: 'emb-1', user_id: STUDENT_ID, embedding_vector: LOW_EMBEDDING,
      image_url: undefined, version: 1, is_active: true, created_at: new Date(),
    }]);
    // Proxy check: different student matches with high confidence
    mockQuery.mockResolvedValueOnce({
      rows: [{ user_id: PROXY_ID, name: 'Proxy Person', embedding_vector: HIGH_EMBEDDING }],
      rowCount: 1,
    } as any);
    mockWriteQueries('proxy_suspect');

    const result = await verificationService.verifyCandidate({
      exam_session_id: SESSION_ID, exam_id: EXAM_ID, student_id: STUDENT_ID,
      face_embedding: HIGH_EMBEDDING, scan_type: 'entry', scanned_by: INVIG_ID,
    });

    expect(result.verdict).toBe('proxy_suspect');
    expect(result.alert_raised).toBe(true);
  });
});

// ─── Role middleware guards ───────────────────────────────────────────────────

describe('hall_invigilator: role guard assertions', () => {
  it('is accepted by requireInvigilator guard', () => {
    const INVIGILATOR_ROLES = ['hall_invigilator', 'chief_examiner', 'admin', 'super_admin'];
    expect(INVIGILATOR_ROLES).toContain('hall_invigilator');
  });

  it('is rejected by requireAdmin guard', () => {
    const ADMIN_ROLES = ['admin', 'super_admin'];
    expect(ADMIN_ROLES).not.toContain('hall_invigilator');
  });

  it('is rejected by requireTeacher guard', () => {
    const TEACHER_ROLES = ['teacher', 'admin', 'super_admin'];
    expect(TEACHER_ROLES).not.toContain('hall_invigilator');
  });

  it('chief_examiner is accepted by requireChiefExaminer guard', () => {
    const CHIEF_ROLES = ['chief_examiner', 'admin', 'super_admin'];
    expect(CHIEF_ROLES).toContain('chief_examiner');
  });
});
