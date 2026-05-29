import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { query } from '../config/database';
import logger from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

// ─── Service ──────────────────────────────────────────────────────────────────

export class PushNotificationService {
  private expo: Expo;

  constructor() {
    this.expo = new Expo();
  }

  /**
   * Register (or re-register) a push token for a user.
   * Uses an upsert so duplicate tokens are handled gracefully.
   */
  async registerToken(userId: string, token: string, platform = 'expo'): Promise<void> {
    try {
      await query(
        `INSERT INTO push_tokens (user_id, token, platform, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, token)
         DO UPDATE SET platform = EXCLUDED.platform, updated_at = NOW()`,
        [userId, token, platform]
      );
      logger.info('Push token registered', { userId, platform });
    } catch (err) {
      logger.warn('Failed to register push token', { userId, error: (err as Error).message });
    }
  }

  /**
   * Remove a push token (e.g. on logout or token rotation).
   */
  async unregisterToken(userId: string, token: string): Promise<void> {
    try {
      await query(
        `DELETE FROM push_tokens WHERE user_id = $1 AND token = $2`,
        [userId, token]
      );
      logger.info('Push token unregistered', { userId });
    } catch (err) {
      logger.warn('Failed to unregister push token', { userId, error: (err as Error).message });
    }
  }

  /**
   * Fetch all Expo push tokens belonging to the given user IDs.
   */
  async getUserTokens(
    userIds: string[]
  ): Promise<Array<{ user_id: string; token: string }>> {
    if (userIds.length === 0) return [];

    try {
      // Build $1,$2,... placeholders
      const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
      const result = await query<{ user_id: string; token: string }>(
        `SELECT user_id, token
         FROM push_tokens
         WHERE user_id IN (${placeholders})
           AND platform = 'expo'`,
        userIds
      );
      return result.rows;
    } catch (err) {
      logger.warn('Failed to fetch push tokens', { error: (err as Error).message });
      return [];
    }
  }

  /**
   * Send an exam alert push notification to all chief examiners and hall
   * invigilators associated with the given exam.
   *
   * This is best-effort: errors are logged as warnings and never re-thrown.
   */
  async sendExamAlert(
    examId: string,
    alertType: string,
    severity: AlertSeverity,
    message: string,
    studentName: string | undefined
  ): Promise<void> {
    try {
      // Resolve the user IDs of everyone who should receive this alert
      const staffResult = await query<{ user_id: string }>(
        `SELECT DISTINCT u.id AS user_id
         FROM users u
         WHERE u.role IN ('chief_examiner', 'hall_invigilator')
           AND (
             -- chief examiners tied to the exam
             EXISTS (
               SELECT 1 FROM exams e
               WHERE e.id = $1
                 AND (e.created_by = u.id OR e.chief_examiner_id = u.id)
             )
             OR
             -- invigilators assigned to a hall in this exam
             EXISTS (
               SELECT 1 FROM exam_halls eh
               WHERE eh.exam_id = $1
                 AND eh.invigilator_id = u.id
             )
           )`,
        [examId]
      );

      const userIds = staffResult.rows.map(r => r.user_id);
      if (userIds.length === 0) return;

      const tokenRows = await this.getUserTokens(userIds);
      if (tokenRows.length === 0) return;

      // Filter to valid Expo tokens only
      const validTokens = tokenRows
        .map(r => r.token)
        .filter(t => Expo.isExpoPushToken(t));

      if (validTokens.length === 0) return;

      const title = `${severity.toUpperCase()}: ${alertType}`;
      const messages: ExpoPushMessage[] = validTokens.map(token => ({
        to: token,
        title,
        body: message,
        data: { examId, alertType, severity },
        sound: severity === 'critical' ? 'default' : undefined,
        badge: 1,
      }));

      // Send in chunks of 100 (Expo SDK limit)
      const chunks = this.expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          const tickets: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync(chunk);
          tickets.forEach((ticket, i) => {
            if (ticket.status === 'error') {
              logger.warn('Push ticket error', {
                token: chunk[i]?.to,
                message: ticket.message,
                details: ticket.details,
              });
            }
          });
        } catch (chunkErr) {
          logger.warn('Push chunk send failed', { error: (chunkErr as Error).message });
        }
      }

      logger.info('Exam alert push notifications sent', {
        examId,
        alertType,
        severity,
        recipientCount: validTokens.length,
      });
    } catch (err) {
      logger.warn('sendExamAlert failed (non-fatal)', { examId, error: (err as Error).message });
    }
  }

  /**
   * Send a simple hall update notification to a specific invigilator user.
   *
   * Best-effort — errors are logged and swallowed.
   */
  async sendHallUpdate(
    hallInvigilatorId: string,
    event: string,
    examTitle: string
  ): Promise<void> {
    try {
      const tokenRows = await this.getUserTokens([hallInvigilatorId]);
      const validTokens = tokenRows
        .map(r => r.token)
        .filter(t => Expo.isExpoPushToken(t));

      if (validTokens.length === 0) return;

      const messages: ExpoPushMessage[] = validTokens.map(token => ({
        to: token,
        title: 'Hall Update',
        body: `${examTitle}: ${event}`,
        data: { event, examTitle },
        badge: 1,
      }));

      const chunks = this.expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await this.expo.sendPushNotificationsAsync(chunk);
        } catch (chunkErr) {
          logger.warn('Push chunk send failed (hall update)', {
            error: (chunkErr as Error).message,
          });
        }
      }

      logger.info('Hall update notification sent', { hallInvigilatorId, event });
    } catch (err) {
      logger.warn('sendHallUpdate failed (non-fatal)', {
        hallInvigilatorId,
        error: (err as Error).message,
      });
    }
  }
}

export const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
