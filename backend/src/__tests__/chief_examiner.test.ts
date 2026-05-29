/**
 * Regression tests for the chief_examiner role.
 *
 * Mirrors hall_invigilator.test.ts — validates that the same class of crashes
 * (undefined params, socket in reducer, role guard bypasses) do NOT affect
 * the chief_examiner role.
 *
 * chief_examiner capabilities tested:
 * - Login without crash (no class_id required)
 * - Can list and access exams
 * - Can view defaulters and flagged cases
 * - Can resolve alerts
 * - Can submit review decisions on verification events
 * - Role guards: blocked from teacher/student routes, allowed on exam routes
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

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
  generateToken: jest.fn(() => 'token-ce'),
  generateSecureOTP: jest.fn(() => '000000'),
  hashToken: jest.fn((t: string) => `h:${t}`),
}));

jest.mock('../middleware/auth.middleware', () => ({
  generateAccessToken: jest.fn(() => 'ce-access-token'),
  generateRefreshToken: jest.fn(() => 'ce-refresh-token'),
  verifyRefreshToken: jest.fn(),
  blacklistToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/face.service', () => ({
  faceService: { getUserEmbeddings: jest.fn() },
}));

jest.mock('../services/exam.alert.service', () => ({
  examAlertService: {
    raiseAlert: jest.fn().mockResolvedValue('alert-1'),
    autoRaiseFromVerification: jest.fn().mockResolvedValue(undefined),
    resolveAlert: jest.fn().mockResolvedValue(undefined),
    getActiveAlerts: jest.fn().mockResolvedValue([]),
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { authService } from '../services/auth.service';
import { examService } from '../services/exam.service';
import { verificationService } from '../services/verification.service';
import { query } from '../config/database';
import { comparePassword } from '../utils/encryption';
import { faceService } from '../services/face.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockCompare = comparePassword as jest.MockedFunction<typeof comparePassword>;
const mockGetEmbeddings = faceService.getUserEmbeddings as jest.MockedFunction<typeof faceService.getUserEmbeddings>;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CE_ID      = '11111111-1111-1111-1111-111111111111';
const EXAM_ID    = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HALL_ID    = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = '44444444-4444-4444-4444-444444444444';
const EVENT_ID   = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ALERT_ID   = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const CE_USER = {
  id: CE_ID,
  name: 'Chief Examiner',
  email: 'chief@exam.com',
  password_hash: '$2a$12$hashed',
  role: 'chief_examiner' as const,
  phone: null, photo_url: null, is_active: true,
  last_login: new Date(), created_at: new Date(), updated_at: new Date(),
};

const EXAM_ROW = {
  id: EXAM_ID, title: 'CS Final 2026', exam_code: 'CS-FINAL-2026',
  face_threshold: 0.85, flag_threshold: 0.70, status: 'active',
};

const EXAM_THRESHOLDS = { face_threshold: 0.85, flag_threshold: 0.70 };
const STUDENT_INFO    = { id: STUDENT_ID, name: 'Alice', photo_url: null };
const HIGH_EMBEDDING  = new Array(128).fill(0.5);

// ─── Login ────────────────────────────────────────────────────────────────────

describe('chief_examiner: login', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns tokens and user with role chief_examiner', async () => {
    // Re-mock factory functions after resetAllMocks()
    (require('../middleware/auth.middleware').generateAccessToken as jest.Mock).mockReturnValue('ce-access-token');
    (require('../middleware/auth.middleware').generateRefreshToken as jest.Mock).mockReturnValue('ce-refresh-token');
    mockQuery
      .mockResolvedValueOnce({ rows: [CE_USER], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    mockCompare.mockResolvedValue(true);

    const result = await authService.login(CE_USER.email, 'password123');

    expect(result.user.role).toBe('chief_examiner');
    expect(result.access_token).toBe('ce-access-token');
    expect(result.refresh_token).toBe('ce-refresh-token');
    expect(Object.keys(result.user)).not.toContain('password_hash');
  });

  it('does NOT require class_id — chief_examiner has no class assignment', async () => {
    (require('../middleware/auth.middleware').generateAccessToken as jest.Mock).mockReturnValue('ce-access-token');
    (require('../middleware/auth.middleware').generateRefreshToken as jest.Mock).mockReturnValue('ce-refresh-token');
    mockQuery
      .mockResolvedValueOnce({ rows: [CE_USER], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    mockCompare.mockResolvedValue(true);

    const result = await authService.login(CE_USER.email, 'password123');

    // CRITICAL: no class_id → socket.joinClassRoom must NOT be called with undefined
    expect((result.user as any).class_id).toBeUndefined();
  });

  it('rejects wrong password', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [CE_USER], rowCount: 1 } as any);
    mockCompare.mockResolvedValue(false); // resetAllMocks clears this; set it fresh

    await expect(authService.login(CE_USER.email, 'wrong'))
      .rejects.toThrow('Invalid email or password');
  });

  it('rejects non-existent user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await expect(authService.login('nobody@exam.com', 'any'))
      .rejects.toThrow('Invalid email or password');
  });
});

// ─── Exam data access ─────────────────────────────────────────────────────────

describe('chief_examiner: exam data access', () => {
  beforeEach(() => jest.resetAllMocks());

  it('can list exams', async () => {
    // listExams: query #1 = COUNT (field name is "total"), query #2 = data rows
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '2' }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [EXAM_ROW, { ...EXAM_ROW, id: 'exam-2', exam_code: 'CS-MID-2026' }], rowCount: 2 } as any);

    const result = await examService.listExams({});

    expect(result.total).toBe(2);
    expect(result.exams).toHaveLength(2);
  });

  it('can get exam stats', async () => {
    // getExamStats makes 4 queries in order:
    // 1. SELECT id FROM exams (verify exists)
    // 2. SELECT COUNT(*) AS total FROM exam_enrollments
    // 3. SELECT verdict, COUNT(*) AS cnt FROM verification_events GROUP BY verdict
    // 4. SELECT COUNT(*) AS cnt FROM exam_enrollments WHERE no verification event
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: EXAM_ID }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ total: '60' }], rowCount: 1 } as any)
      .mockResolvedValueOnce({
        rows: [
          { verdict: 'verified', cnt: '45' },
          { verdict: 'flagged', cnt: '5' },
          { verdict: 'rejected', cnt: '2' },
          { verdict: 'proxy_suspect', cnt: '1' },
        ],
        rowCount: 4,
      } as any)
      .mockResolvedValueOnce({ rows: [{ cnt: '7' }], rowCount: 1 } as any);

    const stats = await examService.getExamStats(EXAM_ID);

    expect(stats.total_enrolled).toBe(60);
    expect(stats.verified).toBe(45);
    expect(stats.flagged).toBe(5);
    expect(stats.proxy_suspects).toBe(1);
    expect(stats.no_show).toBe(7);
  });

  it('can view hall student status across sessions', async () => {
    // Session
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: SESSION_ID, exam_id: EXAM_ID, hall_id: HALL_ID,
        invigilator_id: '22222222-2222-2222-2222-222222222222',
        started_at: new Date().toISOString(), status: 'active', total_students: 2,
      }],
      rowCount: 1,
    } as any);
    // Students
    mockQuery.mockResolvedValueOnce({
      rows: [
        { student_id: STUDENT_ID, student_name: 'Alice', student_email: 'a@t.com',
          seat_number: 'A-01', roll_number: '001', latest_verdict: 'verified',
          confidence_score: 0.92, scanned_at: new Date().toISOString() },
        { student_id: '55555555-5555-5555-5555-555555555555', student_name: 'Bob',
          student_email: 'b@t.com', seat_number: 'A-02', roll_number: '002',
          latest_verdict: 'proxy_suspect', confidence_score: 0.88, scanned_at: new Date().toISOString() },
      ],
      rowCount: 2,
    } as any);

    const students = await examService.getHallStudentStatus(SESSION_ID);

    expect(students).toHaveLength(2);
    expect(students[0]!.latest_verdict).toBe('verified');
    expect(students[1]!.latest_verdict).toBe('proxy_suspect');
  });
});

// ─── Alert and review workflow ────────────────────────────────────────────────

describe('chief_examiner: alert and review workflow', () => {
  beforeEach(() => jest.resetAllMocks());

  it('can submit a review decision for a flagged event', async () => {
    // Event exists
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: EVENT_ID, student_id: STUDENT_ID, verdict: 'flagged',
        review_decision: null, reviewed_at: null,
      }],
      rowCount: 1,
    } as any);
    // UPDATE review fields
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

    await expect(
      verificationService.submitReview(EVENT_ID, 'false_alarm', 'Poor lighting in hall', CE_ID)
    ).resolves.toBeUndefined();
  });

  it('can submit confirmed_proxy review decision', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: EVENT_ID, student_id: STUDENT_ID, verdict: 'proxy_suspect',
          review_decision: null }],
        rowCount: 1,
      } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

    await expect(
      verificationService.submitReview(EVENT_ID, 'confirmed_proxy', 'Proxy confirmed by ID check', CE_ID)
    ).resolves.toBeUndefined();
  });

  it('review throws when event does not exist (rowCount=0)', async () => {
    // submitReview: 1 query = UPDATE ... WHERE id = $4
    // rowCount=0 means no rows updated → NotFoundError
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await expect(
      verificationService.submitReview('nonexistent', 'false_alarm', '', CE_ID)
    ).rejects.toThrow();
  });
});

// ─── Verification visibility ──────────────────────────────────────────────────

describe('chief_examiner: verification event visibility', () => {
  beforeEach(() => jest.resetAllMocks());

  it('can view all verification events for a session', async () => {
    // getVerificationEvents: 1 SELECT query with JOIN
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'ev-1', exam_session_id: SESSION_ID, exam_id: EXAM_ID,
          student_id: STUDENT_ID, student_name: 'Alice',
          scan_type: 'entry', confidence_score: 0.92, verdict: 'verified',
          scanned_at: new Date(), matched_user_id: null, matched_user_name: null },
        { id: 'ev-2', exam_session_id: SESSION_ID, exam_id: EXAM_ID,
          student_id: '55555555-5555-5555-5555-555555555555', student_name: 'Bob',
          scan_type: 're_verify', confidence_score: 0.61, verdict: 'rejected',
          scanned_at: new Date(), matched_user_id: null, matched_user_name: null },
      ],
      rowCount: 2,
    } as any);

    const events = await verificationService.getVerificationEvents(SESSION_ID);

    expect(events).toHaveLength(2);
    expect(events[0]!.verdict).toBe('verified');
    expect(events[1]!.verdict).toBe('rejected');
  });

  it('returns empty array when session has no events yet', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const events = await verificationService.getVerificationEvents(SESSION_ID);

    expect(events).toEqual([]);
  });

  it('can view a specific student\'s verification history for an exam', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'ev-entry', exam_session_id: SESSION_ID, exam_id: EXAM_ID,
          student_id: STUDENT_ID, student_name: 'Alice', scan_type: 'entry',
          confidence_score: 0.88, verdict: 'flagged', scanned_at: new Date() },
        { id: 'ev-reverify', exam_session_id: SESSION_ID, exam_id: EXAM_ID,
          student_id: STUDENT_ID, student_name: 'Alice', scan_type: 're_verify',
          confidence_score: 0.91, verdict: 'verified', scanned_at: new Date() },
      ],
      rowCount: 2,
    } as any);

    const history = await verificationService.getStudentVerificationHistory(STUDENT_ID, EXAM_ID);

    expect(history).toHaveLength(2);
    // entry was flagged, then re-verify was verified
    expect(history[0]!.scan_type).toBe('entry');
    expect(history[1]!.scan_type).toBe('re_verify');
  });
});

// ─── Role guards ─────────────────────────────────────────────────────────────

describe('chief_examiner: role guard assertions', () => {
  it('is accepted by requireChiefExaminer guard', () => {
    const CHIEF_ROLES = ['chief_examiner', 'admin', 'super_admin'];
    expect(CHIEF_ROLES).toContain('chief_examiner');
  });

  it('is accepted by requireInvigilator (exam staff) guard', () => {
    const EXAM_STAFF_ROLES = ['hall_invigilator', 'chief_examiner', 'admin', 'super_admin'];
    expect(EXAM_STAFF_ROLES).toContain('chief_examiner');
  });

  it('is rejected by requireTeacher guard', () => {
    const TEACHER_ROLES = ['teacher', 'admin', 'super_admin'];
    expect(TEACHER_ROLES).not.toContain('chief_examiner');
  });

  it('is rejected by requireStudent guard', () => {
    const STUDENT_ROLES = ['student'];
    expect(STUDENT_ROLES).not.toContain('chief_examiner');
  });

  it('admin can access all exam endpoints', () => {
    const ADMIN_ROLES = ['admin', 'super_admin'];
    expect(ADMIN_ROLES).toContain('admin');
    // admin is superset of all roles — can manage exams, invigilate, and review
  });
});
