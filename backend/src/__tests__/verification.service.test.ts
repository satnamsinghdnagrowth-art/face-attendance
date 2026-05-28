/**
 * Unit tests for VerificationService.
 *
 * All external I/O (DB, faceService, alertService) is mocked so tests are
 * fast and deterministic.  Scenarios covered:
 *   - verifyCandidate: verified / flagged / rejected verdicts based on
 *     cosine similarity, no_match when no embeddings, proxy_suspect detection
 *   - insertEvent writes verification_events row
 *   - updateSessionCounters increments the right column
 *   - submitReview: success, NotFoundError on missing event
 *   - getVerificationEvents: returns shaped rows
 */

// ─── Mocks (hoisted before imports) ──────────────────────────────────────────

jest.mock('../config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../services/face.service', () => ({
  faceService: {
    getUserEmbeddings: jest.fn(),
  },
}));

jest.mock('../services/exam.alert.service', () => ({
  examAlertService: {
    autoRaiseFromVerification: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { verificationService, VerifyParams } from '../services/verification.service';
import { query } from '../config/database';
import { faceService } from '../services/face.service';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockGetUserEmbeddings = faceService.getUserEmbeddings as jest.MockedFunction<
  typeof faceService.getUserEmbeddings
>;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const EXAM_ID      = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID   = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID   = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const INVIGILATOR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OTHER_STUDENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const EVENT_ID     = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

/**
 * Returns a 128-element vector of 0.5s.
 * When used for both the stored and incoming embedding the cosine similarity
 * computes to 1.0 (identical vectors).
 */
function identicalEmbedding(): number[] {
  return new Array(128).fill(0.5);
}

/**
 * Returns a zero vector — cosine similarity against anything = 0.
 */
function zeroEmbedding(): number[] {
  return new Array(128).fill(0);
}

/**
 * Returns a vector whose cosine similarity with identicalEmbedding()
 * falls between 0.70 and 0.85 (medium confidence — should produce "flagged").
 *
 * We use a vector that is mostly 0.5 but with a small perturbation so that
 * the cosine similarity is deliberately < face_threshold (0.85) but still
 * well above 0.70.  Because cosine measures angle, not magnitude, we need to
 * change direction rather than scale.  A simple approach: replace half the
 * components with 0 so the angle between the two unit-vectors is non-trivial.
 *
 * cos( identicalEmbedding, mediumEmbedding ) ≈ 0.707 which is between 0.70 and 0.85.
 */
function mediumEmbedding(): number[] {
  const v = new Array(128).fill(0);
  for (let i = 0; i < 64; i++) v[i] = 0.5;   // only first 64 components non-zero
  return v;
}

/** Fake FaceEmbedding row returned by faceService.getUserEmbeddings */
function makeFaceEmbeddingRow(vec: number[]) {
  return {
    id: 'embed-id-1',
    user_id: STUDENT_ID,
    embedding_vector: vec,
    image_url: undefined,
    version: 1,
    is_active: true,
    created_at: new Date('2026-01-01T00:00:00Z'),
  };
}

const fakeStudent = {
  id: STUDENT_ID,
  name: 'Alice Test',
  photo_url: null,
};

const baseParams: VerifyParams = {
  exam_session_id: SESSION_ID,
  exam_id: EXAM_ID,
  student_id: STUDENT_ID,
  face_embedding: identicalEmbedding(),
  scan_type: 'entry',
  scanned_by: INVIGILATOR_ID,
};

const fakeExamThresholds = {
  face_threshold: 0.85,
  flag_threshold: 0.70,
};

/** Wire up the common query calls that every verifyCandidate path executes */
function mockBaseQueries() {
  // 1. SELECT student info
  mockQuery.mockResolvedValueOnce({ rows: [fakeStudent], rowCount: 1 } as any);
  // 2. SELECT exam thresholds
  mockQuery.mockResolvedValueOnce({ rows: [fakeExamThresholds], rowCount: 1 } as any);
}

/** Wire up the INSERT event + UPDATE session calls */
function mockWriteQueries() {
  // INSERT verification_events RETURNING id
  mockQuery.mockResolvedValueOnce({ rows: [{ id: EVENT_ID }], rowCount: 1 } as any);
  // UPDATE exam_sessions SET xxx_count = xxx_count + 1
  mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
}

// ─── verifyCandidate ──────────────────────────────────────────────────────────

describe('VerificationService.verifyCandidate', () => {
  beforeEach(() => jest.resetAllMocks());

  // ── verified ──────────────────────────────────────────────────────────────

  it('returns verified verdict when cosine similarity >= face_threshold', async () => {
    mockBaseQueries();
    // High similarity: stored vector = incoming vector → similarity = 1.0
    mockGetUserEmbeddings.mockResolvedValue([makeFaceEmbeddingRow(identicalEmbedding())]);
    mockWriteQueries();

    const result = await verificationService.verifyCandidate({
      ...baseParams,
      face_embedding: identicalEmbedding(),
    });

    expect(result.verdict).toBe('verified');
    expect(result.confidence_score).toBeCloseTo(1.0, 5);
    expect(result.event_id).toBe(EVENT_ID);
    expect(result.expected_student.id).toBe(STUDENT_ID);
    expect(result.alert_raised).toBe(false);
  });

  // ── flagged ───────────────────────────────────────────────────────────────

  it('returns flagged verdict when similarity is between flag and face threshold', async () => {
    mockBaseQueries();
    // mediumEmbedding has cosine ~0.707 with identicalEmbedding → between 0.70 and 0.85
    mockGetUserEmbeddings.mockResolvedValue([makeFaceEmbeddingRow(mediumEmbedding())]);
    // No proxy match among other students
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    mockWriteQueries();

    const result = await verificationService.verifyCandidate({
      ...baseParams,
      face_embedding: identicalEmbedding(),
    });

    expect(result.verdict).toBe('flagged');
    expect(result.confidence_score).toBeGreaterThanOrEqual(0.70);
    expect(result.confidence_score).toBeLessThan(0.85);
    expect(result.alert_raised).toBe(true);
  });

  // ── rejected ──────────────────────────────────────────────────────────────

  it('returns rejected verdict when similarity is below flag_threshold', async () => {
    mockBaseQueries();
    // zeroEmbedding: cosine similarity = 0, well below 0.70 flag_threshold
    mockGetUserEmbeddings.mockResolvedValue([makeFaceEmbeddingRow(zeroEmbedding())]);
    // Proxy check — no match among other students
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    mockWriteQueries();

    const result = await verificationService.verifyCandidate({
      ...baseParams,
      face_embedding: identicalEmbedding(),
    });

    expect(result.verdict).toBe('rejected');
    expect(result.confidence_score).toBe(0);
    expect(result.alert_raised).toBe(true);
  });

  // ── no_match ──────────────────────────────────────────────────────────────

  it('returns no_match when student has no face embeddings registered', async () => {
    mockBaseQueries();
    mockGetUserEmbeddings.mockResolvedValue([]); // empty — no face data
    mockWriteQueries();                          // still writes the event

    const result = await verificationService.verifyCandidate(baseParams);

    expect(result.verdict).toBe('no_match');
    expect(result.confidence_score).toBe(0);
    expect(result.alert_raised).toBe(false);
    expect(result.message).toContain('No face embeddings');
  });

  // ── proxy_suspect ─────────────────────────────────────────────────────────

  it('detects proxy when face matches a different enrolled student', async () => {
    mockBaseQueries();
    // Target student embedding has zero similarity to submitted face
    mockGetUserEmbeddings.mockResolvedValue([makeFaceEmbeddingRow(zeroEmbedding())]);

    // Proxy check query returns another student whose embedding IS identical
    // to the submitted face (similarity = 1.0 ≥ face_threshold 0.85)
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: OTHER_STUDENT_ID,
          name: 'Imposter Bob',
          embedding_vector: identicalEmbedding(), // high similarity to submitted face
        },
      ],
      rowCount: 1,
    } as any);
    mockWriteQueries();

    const result = await verificationService.verifyCandidate({
      ...baseParams,
      face_embedding: identicalEmbedding(),
    });

    expect(result.verdict).toBe('proxy_suspect');
    expect(result.matched_user?.id).toBe(OTHER_STUDENT_ID);
    expect(result.matched_user?.name).toBe('Imposter Bob');
    expect(result.alert_raised).toBe(true);
  });

  // ── DB writes ─────────────────────────────────────────────────────────────

  it('writes a verification_event to the database', async () => {
    mockBaseQueries();
    mockGetUserEmbeddings.mockResolvedValue([makeFaceEmbeddingRow(identicalEmbedding())]);
    mockWriteQueries();

    await verificationService.verifyCandidate(baseParams);

    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO verification_events')
    );
    expect(insertCall).toBeDefined();
    const [, params] = insertCall!;
    expect(params).toContain(SESSION_ID);
    expect(params).toContain(EXAM_ID);
    expect(params).toContain(STUDENT_ID);
  });

  it('updates session counters after verification', async () => {
    mockBaseQueries();
    mockGetUserEmbeddings.mockResolvedValue([makeFaceEmbeddingRow(identicalEmbedding())]);
    mockWriteQueries();

    await verificationService.verifyCandidate(baseParams);

    const updateCall = mockQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE exam_sessions')
    );
    expect(updateCall).toBeDefined();
    const [, params] = updateCall!;
    expect(params).toContain(SESSION_ID);
  });

  it('increments verified_count column when verdict is verified', async () => {
    mockBaseQueries();
    mockGetUserEmbeddings.mockResolvedValue([makeFaceEmbeddingRow(identicalEmbedding())]);
    mockWriteQueries();

    await verificationService.verifyCandidate(baseParams);

    const updateCall = mockQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE exam_sessions')
    );
    expect(updateCall![0]).toContain('verified_count');
  });

  it('increments flagged_count column when verdict is flagged', async () => {
    mockBaseQueries();
    mockGetUserEmbeddings.mockResolvedValue([makeFaceEmbeddingRow(mediumEmbedding())]);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // proxy check
    mockWriteQueries();

    await verificationService.verifyCandidate({
      ...baseParams,
      face_embedding: identicalEmbedding(),
    });

    const updateCall = mockQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE exam_sessions')
    );
    expect(updateCall![0]).toContain('flagged_count');
  });

  it('increments rejected_count for no_match verdict', async () => {
    mockBaseQueries();
    mockGetUserEmbeddings.mockResolvedValue([]);
    mockWriteQueries();

    await verificationService.verifyCandidate(baseParams);

    const updateCall = mockQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE exam_sessions')
    );
    expect(updateCall![0]).toContain('rejected_count');
  });

  it('handles pg-format embedding vector string (curly-brace notation)', async () => {
    mockBaseQueries();
    // Simulate pg returning embedding as "{0.5,0.5,...}" string
    const pgString = `{${identicalEmbedding().join(',')}}`;
    mockGetUserEmbeddings.mockResolvedValue([
      {
        ...makeFaceEmbeddingRow(identicalEmbedding()),
        // Override with raw pg string — service should parse it
        embedding_vector: pgString as unknown as number[],
      },
    ]);
    mockWriteQueries();

    const result = await verificationService.verifyCandidate(baseParams);

    // cosineSimilarity should still compute correctly after parsing
    expect(result.verdict).toBe('verified');
    expect(result.confidence_score).toBeCloseTo(1.0, 5);
  });

  it('picks the highest similarity across multiple stored embeddings', async () => {
    mockBaseQueries();
    // Two embeddings: one low (zero), one high (identical)
    mockGetUserEmbeddings.mockResolvedValue([
      makeFaceEmbeddingRow(zeroEmbedding()),
      makeFakeEmbeddingHighSim(),
    ]);
    mockWriteQueries();

    const result = await verificationService.verifyCandidate(baseParams);

    // Should use the best match → verified
    expect(result.verdict).toBe('verified');
    expect(result.confidence_score).toBeCloseTo(1.0, 5);
  });
});

// Helper used inside the test above
function makeFakeEmbeddingHighSim() {
  return {
    id: 'embed-id-2',
    user_id: STUDENT_ID,
    embedding_vector: identicalEmbedding(),
    version: 2,
    is_active: true,
    created_at: new Date(),
  };
}

// ─── submitReview ─────────────────────────────────────────────────────────────

describe('VerificationService.submitReview', () => {
  beforeEach(() => jest.resetAllMocks());

  it('updates review fields on the event successfully', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

    await expect(
      verificationService.submitReview(EVENT_ID, 'false_alarm', 'Looked like the student', INVIGILATOR_ID)
    ).resolves.toBeUndefined();

    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('UPDATE verification_events');
    expect(sql).toContain('review_decision');
    expect(sql).toContain('review_note');
    expect(sql).toContain('reviewed_by');
    expect(sql).toContain('reviewed_at');
    expect(params![0]).toBe('false_alarm');
    expect(params![1]).toBe('Looked like the student');
    expect(params![2]).toBe(INVIGILATOR_ID);
    expect(params![3]).toBe(EVENT_ID);
  });

  it('throws NotFoundError when event does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await expect(
      verificationService.submitReview(EVENT_ID, 'confirmed_proxy', 'Confirmed fraud', INVIGILATOR_ID)
    ).rejects.toThrow('Verification event not found');
  });

  it('accepts all valid decision values', async () => {
    const decisions = ['confirmed_proxy', 'false_alarm', 'inconclusive'] as const;

    for (const decision of decisions) {
      jest.resetAllMocks();
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      await expect(
        verificationService.submitReview(EVENT_ID, decision, 'note', INVIGILATOR_ID)
      ).resolves.toBeUndefined();
    }
  });
});

// ─── getVerificationEvents ────────────────────────────────────────────────────

describe('VerificationService.getVerificationEvents', () => {
  beforeEach(() => jest.resetAllMocks());

  const fakeEvent = {
    id: EVENT_ID,
    exam_session_id: SESSION_ID,
    exam_id: EXAM_ID,
    student_id: STUDENT_ID,
    student_name: 'Alice Test',
    matched_user_id: null,
    matched_user_name: null,
    scan_type: 'entry',
    confidence_score: 0.95,
    verdict: 'verified',
    face_image_url: null,
    id_card_image_url: null,
    id_card_number: null,
    scanned_by: INVIGILATOR_ID,
    scanned_at: new Date('2026-06-01T09:05:00Z'),
    reviewed_by: null,
    review_decision: null,
    review_note: null,
    reviewed_at: null,
  };

  it('returns events for a session', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeEvent], rowCount: 1 } as any);

    const result = await verificationService.getVerificationEvents(SESSION_ID);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(EVENT_ID);
    expect(result[0].verdict).toBe('verified');
    expect(result[0].student_name).toBe('Alice Test');
    expect(result[0].confidence_score).toBe(0.95);
  });

  it('queries by exam_session_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await verificationService.getVerificationEvents(SESSION_ID);

    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('verification_events');
    expect(sql).toContain('exam_session_id');
    expect(params![0]).toBe(SESSION_ID);
  });

  it('returns empty array when session has no events', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const result = await verificationService.getVerificationEvents(SESSION_ID);

    expect(result).toEqual([]);
  });

  it('returns multiple events ordered by scanned_at DESC', async () => {
    const laterEvent = {
      ...fakeEvent,
      id: 'event-id-2',
      verdict: 'flagged',
      scanned_at: new Date('2026-06-01T09:15:00Z'),
    };

    // DB already returns them in DESC order (via ORDER BY scanned_at DESC)
    mockQuery.mockResolvedValueOnce({
      rows: [laterEvent, fakeEvent],
      rowCount: 2,
    } as any);

    const result = await verificationService.getVerificationEvents(SESSION_ID);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('event-id-2');
    expect(result[1].id).toBe(EVENT_ID);

    const [sql] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('scanned_at DESC');
  });
});
