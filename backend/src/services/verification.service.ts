import { query } from '../config/database';
import { faceService } from './face.service';
import { notificationService } from './notification.service';
import logger from '../utils/logger';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface VerifyParams {
  exam_session_id: string;
  exam_id: string;
  student_id: string;        // expected student
  face_embedding: number[];
  scan_type: 'entry' | 're_verify' | 'manual';
  face_image_url?: string;
  id_card_image_url?: string;
  id_card_number?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  device_id?: string;
  scanned_by: string;
}

export interface VerificationResult {
  event_id: string;
  verdict: 'verified' | 'flagged' | 'rejected' | 'no_match' | 'proxy_suspect';
  confidence_score: number;
  expected_student: { id: string; name: string; photo_url?: string };
  matched_user?: { id: string; name: string };
  alert_raised: boolean;
  message: string;
}

export interface VerificationEvent {
  id: string;
  exam_session_id: string;
  exam_id: string;
  student_id: string;
  student_name: string;
  matched_user_id?: string;
  matched_user_name?: string;
  scan_type: string;
  confidence_score: number;
  verdict: string;
  face_image_url?: string;
  id_card_image_url?: string;
  id_card_number?: string;
  scanned_by: string;
  scanned_at: Date;
  reviewed_by?: string;
  review_decision?: string;
  review_note?: string;
  reviewed_at?: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * (b[i] ?? 0), 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

function parseEmbeddingVector(raw: string | number[]): number[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    return raw
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((v) => parseFloat(v.trim()));
  }
  return [];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class VerificationService {
  // Core verification method
  async verifyCandidate(params: VerifyParams): Promise<VerificationResult> {
    // Fetch expected student info
    const studentResult = await query<{ id: string; name: string; photo_url: string | null }>(
      'SELECT id, name, photo_url FROM users WHERE id = $1 AND is_active = true',
      [params.student_id]
    );

    const expectedStudent = studentResult.rows[0]
      ? {
          id: studentResult.rows[0].id,
          name: studentResult.rows[0].name,
          photo_url: studentResult.rows[0].photo_url ?? undefined,
        }
      : { id: params.student_id, name: 'Unknown', photo_url: undefined };

    // Fetch exam thresholds
    const examResult = await query<{ face_threshold: number; flag_threshold: number }>(
      'SELECT face_threshold, flag_threshold FROM exams WHERE id = $1',
      [params.exam_id]
    );
    const faceThreshold = examResult.rows[0]?.face_threshold ?? 0.85;
    const flagThreshold = examResult.rows[0]?.flag_threshold ?? 0.70;

    // Guard: no usable face embedding was extracted from the image and none was supplied.
    if (!params.face_embedding || params.face_embedding.length === 0) {
      const eventId = await this.insertEvent(params, null, 0, 'no_match');
      await this.updateSessionCounters(params.exam_session_id, 'rejected');
      return {
        event_id: eventId,
        verdict: 'no_match',
        confidence_score: 0,
        expected_student: expectedStudent,
        alert_raised: false,
        message: 'Face could not be extracted from the image — please retake the photo in good lighting',
      };
    }

    // Fetch expected student's embeddings
    const embeddings = await faceService.getUserEmbeddings(params.student_id);

    // No face registered — cannot verify
    if (embeddings.length === 0) {
      const eventId = await this.insertEvent(params, null, 0, 'no_match');
      await this.updateSessionCounters(params.exam_session_id, 'rejected');
      return {
        event_id: eventId,
        verdict: 'no_match',
        confidence_score: 0,
        expected_student: expectedStudent,
        alert_raised: false,
        message: 'No face registered for this student — contact the administrator',
      };
    }

    // Compute max cosine similarity against all stored embeddings
    let maxSimilarity = 0;
    for (const stored of embeddings) {
      const vec = parseEmbeddingVector(stored.embedding_vector as unknown as string | number[]);
      if (vec.length === 0) continue;
      const sim = cosineSimilarity(params.face_embedding, vec);
      if (sim > maxSimilarity) maxSimilarity = sim;
    }

    // Determine primary verdict
    let verdict: VerificationResult['verdict'];
    if (maxSimilarity >= faceThreshold) {
      verdict = 'verified';
    } else if (maxSimilarity >= flagThreshold) {
      verdict = 'flagged';
    } else {
      verdict = 'rejected';
    }

    // Proxy detection — check if face matches a DIFFERENT enrolled student
    let matchedUser: { id: string; name: string } | undefined;

    if (verdict !== 'verified') {
      const otherEmbeddingsResult = await query<{
        user_id: string;
        name: string;
        embedding_vector: string | number[];
      }>(
        `SELECT fe.user_id, u.name, fe.embedding_vector
         FROM face_embeddings fe
         JOIN users u ON u.id = fe.user_id
         JOIN exam_enrollments ee ON ee.student_id = fe.user_id
         WHERE ee.exam_id = $1
           AND fe.user_id <> $2
           AND fe.is_active = true
           AND u.is_active = true`,
        [params.exam_id, params.student_id]
      );

      for (const row of otherEmbeddingsResult.rows) {
        const vec = parseEmbeddingVector(row.embedding_vector);
        if (vec.length === 0) continue;
        const sim = cosineSimilarity(params.face_embedding, vec);
        if (sim >= faceThreshold) {
          verdict = 'proxy_suspect';
          matchedUser = { id: row.user_id, name: row.name };
          logger.warn('Proxy suspect detected', {
            expectedStudent: params.student_id,
            matchedUser: row.user_id,
            examId: params.exam_id,
          });
          break;
        }
      }
    }

    // Write verification event
    const matchedUserId = matchedUser?.id ?? null;
    const eventId = await this.insertEvent(params, matchedUserId, maxSimilarity, verdict);

    // Update session counters
    if (verdict === 'verified') {
      await this.updateSessionCounters(params.exam_session_id, 'verified');
    } else if (verdict === 'flagged') {
      await this.updateSessionCounters(params.exam_session_id, 'flagged');
    } else {
      await this.updateSessionCounters(params.exam_session_id, 'rejected');
    }

    const messages: Record<VerificationResult['verdict'], string> = {
      verified: 'Identity verified successfully',
      flagged: 'Face matched with low confidence — manual review required',
      rejected: 'Face did not match the expected student',
      no_match: 'No face data available for this student',
      proxy_suspect: 'Possible proxy attempt — face matched another enrolled student',
    };

    logger.info('Verification complete', {
      sessionId: params.exam_session_id,
      studentId: params.student_id,
      verdict,
      confidence: maxSimilarity,
    });

    // Broadcast verification result to exam room (used by ChiefExaminerDashboard + StudentListScreen)
    // Fetch hall_id from session to target the right sub-room
    try {
      const sessionRow = await query<{ hall_id: string }>(
        'SELECT hall_id FROM exam_sessions WHERE id = $1',
        [params.exam_session_id]
      );
      const hallId = sessionRow.rows[0]?.hall_id ?? '';
      notificationService.broadcastVerificationEvent(params.exam_id, hallId, {
        eventId,
        examId: params.exam_id,
        hallId,
        studentId: params.student_id,
        studentName: expectedStudent.name,
        verdict,
        confidence: maxSimilarity,
        scanType: params.scan_type,
        scannedAt: new Date(),
      });
    } catch {
      // non-fatal — broadcast failure must never block the scan response
    }

    return {
      event_id: eventId,
      verdict,
      confidence_score: maxSimilarity,
      expected_student: expectedStudent,
      matched_user: matchedUser,
      alert_raised: verdict === 'proxy_suspect' || verdict === 'flagged' || verdict === 'rejected',
      message: messages[verdict],
    };
  }

  // Insert a verification_event row and return its id
  private async insertEvent(
    params: VerifyParams,
    matchedUserId: string | null,
    confidence: number,
    verdict: VerificationResult['verdict']
  ): Promise<string> {
    const result = await query<{ id: string }>(
      `INSERT INTO verification_events (
         exam_session_id, exam_id, student_id, matched_user_id,
         scan_type, confidence_score, verdict,
         face_image_url, id_card_image_url, id_card_number,
         gps_latitude, gps_longitude, device_id, scanned_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        params.exam_session_id,
        params.exam_id,
        params.student_id,
        matchedUserId,
        params.scan_type,
        confidence,
        verdict,
        params.face_image_url ?? null,
        params.id_card_image_url ?? null,
        params.id_card_number ?? null,
        params.gps_latitude ?? null,
        params.gps_longitude ?? null,
        params.device_id ?? null,
        params.scanned_by,
      ]
    );
    return result.rows[0].id;
  }

  // Increment the appropriate counter on the exam_session
  private async updateSessionCounters(
    sessionId: string,
    bucket: 'verified' | 'flagged' | 'rejected'
  ): Promise<void> {
    const col = `${bucket}_count`;
    await query(
      `UPDATE exam_sessions SET ${col} = ${col} + 1 WHERE id = $1`,
      [sessionId]
    );
  }

  // Get all verification events for a session
  async getVerificationEvents(examSessionId: string): Promise<VerificationEvent[]> {
    const result = await query<VerificationEvent>(
      `SELECT
         ve.*,
         u_student.name           AS student_name,
         u_matched.name           AS matched_user_name
       FROM verification_events ve
       JOIN  users u_student ON u_student.id = ve.student_id
       LEFT JOIN users u_matched  ON u_matched.id  = ve.matched_user_id
       WHERE ve.exam_session_id = $1
       ORDER BY ve.scanned_at DESC`,
      [examSessionId]
    );
    return result.rows;
  }

  // Get a student's full verification history within an exam
  async getStudentVerificationHistory(
    studentId: string,
    examId: string
  ): Promise<VerificationEvent[]> {
    const result = await query<VerificationEvent>(
      `SELECT
         ve.*,
         u_student.name           AS student_name,
         u_matched.name           AS matched_user_name
       FROM verification_events ve
       JOIN  users u_student ON u_student.id = ve.student_id
       LEFT JOIN users u_matched  ON u_matched.id  = ve.matched_user_id
       WHERE ve.student_id = $1 AND ve.exam_id = $2
       ORDER BY ve.scanned_at DESC`,
      [studentId, examId]
    );
    return result.rows;
  }

  // Submit a manual review decision for a verification event
  async submitReview(
    eventId: string,
    decision: 'confirmed_proxy' | 'false_alarm' | 'inconclusive',
    note: string,
    reviewerId: string
  ): Promise<void> {
    const result = await query(
      `UPDATE verification_events
       SET review_decision = $1,
           review_note     = $2,
           reviewed_by     = $3,
           reviewed_at     = NOW()
       WHERE id = $4`,
      [decision, note, reviewerId, eventId]
    );

    if ((result.rowCount ?? 0) === 0) {
      const { NotFoundError } = await import('../middleware/error.middleware');
      throw new NotFoundError('Verification event');
    }

    logger.info('Verification event reviewed', { eventId, decision, reviewerId });
  }
}

export const verificationService = new VerificationService();
export default verificationService;
