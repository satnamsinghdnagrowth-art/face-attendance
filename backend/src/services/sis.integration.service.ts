/**
 * SIS Integration Service — Phase 3 Stub
 *
 * Syncs students from a University Student Information System (SIS).
 *
 * Integration patterns supported:
 *
 * PUSH (webhook): SIS sends data → POST /api/v2/exams/sis/webhook
 *   - SIS must call the webhook URL with student records
 *   - Signature verification via HMAC-SHA256 (see verifyWebhookSignature)
 *
 * PULL (scheduled poll): Backend queries SIS API on a schedule
 *   - Set up a cron job that calls sisIntegrationService.fetchAndSync()
 *   - Configure SIS_API_URL and SIS_API_KEY in .env
 *
 * FILE IMPORT: Upload a CSV → POST /api/v2/exams/:examId/halls/:hallId/enroll/csv
 *   - Uses the existing bulk enrollment endpoint (no SIS integration needed)
 */

import crypto from 'crypto';
import { query } from '../config/database';
import logger from '../utils/logger';

export interface SISStudent {
  external_id: string;   // SIS-assigned student ID
  name: string;
  email: string;
  roll_number?: string;
  programme?: string;    // e.g. "B.Tech Computer Science"
  semester?: number;
  is_active: boolean;
}

export interface SISSyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ external_id: string; reason: string }>;
}

export class SISIntegrationService {
  /**
   * Sync a batch of students from a SIS payload.
   * Creates new users or updates existing ones by email.
   * Role is always 'student' regardless of SIS data.
   */
  async syncStudents(students: SISStudent[], _institutionId?: string): Promise<SISSyncResult> {
    const result: SISSyncResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const student of students) {
      try {
        if (!student.email || !student.name) {
          result.errors.push({ external_id: student.external_id, reason: 'Missing email or name' });
          continue;
        }

        const existing = await query<{ id: string }>(
          'SELECT id FROM users WHERE email = $1',
          [student.email.toLowerCase()]
        );

        if (existing.rows.length > 0) {
          // Update existing user
          await query(
            `UPDATE users SET name = $1, is_active = $2, updated_at = NOW() WHERE email = $3`,
            [student.name, student.is_active, student.email.toLowerCase()]
          );
          result.updated++;
        } else {
          // Create new student — generate a temporary password hash
          // In production, trigger a "set password" email instead
          const tempHash = crypto
            .createHash('sha256')
            .update(`${student.email}-${Date.now()}`)
            .digest('hex');

          await query(
            `INSERT INTO users (name, email, password_hash, role, is_active)
             VALUES ($1, $2, $3, 'student', $4)
             ON CONFLICT (email) DO NOTHING`,
            [student.name, student.email.toLowerCase(), tempHash, student.is_active]
          );
          result.created++;
        }
      } catch (err) {
        result.errors.push({
          external_id: student.external_id,
          reason: (err as Error).message,
        });
      }
    }

    logger.info('SIS sync complete', {
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    return result;
  }

  /**
   * Verify HMAC-SHA256 webhook signature from the SIS.
   * The SIS must send: X-SIS-Signature: sha256=<hmac>
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    try {
      const expected = `sha256=${crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')}`;
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}

export const sisIntegrationService = new SISIntegrationService();
export default sisIntegrationService;
