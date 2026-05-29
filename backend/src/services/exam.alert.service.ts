import { query } from '../config/database';
import { notificationService } from './notification.service';
import { pushNotificationService } from './push.notification.service';
import { VerificationResult } from './verification.service';
import logger from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
type AlertType = 'proxy_suspect' | 'low_confidence' | 'no_show' | 'repeated_failure' | 'id_mismatch';

interface RaiseAlertParams {
  exam_id: string;
  hall_id?: string;
  event_id?: string;
  student_id?: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
}

interface ExamAlert {
  id: string;
  exam_id: string;
  hall_id?: string;
  event_id?: string;
  student_id?: string;
  student_name?: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  is_resolved: boolean;
  created_at: Date;
}

// ─── Severity ordering for getActiveAlerts sort ───────────────────────────────
const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class ExamAlertService {
  // Insert an alert and broadcast it via Socket.IO to the exam room
  async raiseAlert(params: RaiseAlertParams): Promise<string> {
    const result = await query<{ id: string }>(
      `INSERT INTO exam_alerts
         (exam_id, hall_id, event_id, alert_type, severity, message, student_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [
        params.exam_id,
        params.hall_id ?? null,
        params.event_id ?? null,
        params.alert_type,
        params.severity,
        params.message,
        params.student_id ?? null,
      ]
    );

    const alertId = result.rows[0].id;

    // Targeted broadcast to `exam:{examId}` room only — chief examiners and
    // invigilators of this exam will receive it.
    notificationService.broadcastExamAlert(params.exam_id, {
      alertId,
      examId: params.exam_id,
      hallId: params.hall_id,
      eventId: params.event_id,
      studentId: params.student_id,
      alertType: params.alert_type,
      severity: params.severity,
      message: params.message,
    } as import('../types').SocketExamAlertPayload);

    // Send push notification for high/critical alerts (best-effort, non-blocking)
    if (params.severity === 'critical' || params.severity === 'high') {
      void pushNotificationService.sendExamAlert(
        params.exam_id,
        params.alert_type,
        params.severity,
        params.message,
        undefined
      ).catch((err: Error) => logger.warn('Push notification failed (non-fatal)', { error: err.message }));
    }

    logger.info('Exam alert raised', {
      alertId,
      examId: params.exam_id,
      type: params.alert_type,
      severity: params.severity,
    });

    return alertId;
  }

  // Mark an alert as resolved
  async resolveAlert(alertId: string, resolvedBy: string): Promise<void> {
    const result = await query(
      `UPDATE exam_alerts
       SET is_resolved = true,
           resolved_by = $1,
           resolved_at = NOW()
       WHERE id = $2`,
      [resolvedBy, alertId]
    );

    if ((result.rowCount ?? 0) === 0) {
      const { NotFoundError } = await import('../middleware/error.middleware');
      throw new NotFoundError('Exam alert');
    }

    logger.info('Exam alert resolved', { alertId, resolvedBy });
  }

  // Get all unresolved alerts for an exam, ordered by severity then creation time
  async getActiveAlerts(examId: string): Promise<ExamAlert[]> {
    const result = await query<ExamAlert>(
      `SELECT ea.*,
              u.name AS student_name
       FROM exam_alerts ea
       LEFT JOIN users u ON u.id = ea.student_id
       WHERE ea.exam_id = $1
         AND ea.is_resolved = false
       ORDER BY ea.created_at DESC`,
      [examId]
    );

    // Sort in application layer by severity weight so we don't need a CASE expression in SQL
    return result.rows.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
    );
  }

  // Automatically raise alerts based on a VerificationResult
  async autoRaiseFromVerification(
    result: VerificationResult,
    examId: string,
    hallId: string,
    eventId: string
  ): Promise<void> {
    const { verdict, confidence_score, expected_student } = result;

    if (verdict === 'proxy_suspect') {
      const matchedName = result.matched_user?.name ?? 'another student';
      await this.raiseAlert({
        exam_id: examId,
        hall_id: hallId,
        event_id: eventId,
        student_id: expected_student.id,
        alert_type: 'proxy_suspect',
        severity: 'critical',
        message: `PROXY SUSPECT: Face of ${expected_student.name} matched ${matchedName}. Immediate action required.`,
      });
      return;
    }

    if (verdict === 'rejected') {
      await this.raiseAlert({
        exam_id: examId,
        hall_id: hallId,
        event_id: eventId,
        student_id: expected_student.id,
        alert_type: 'low_confidence',
        severity: 'high',
        message: `Face REJECTED for ${expected_student.name} (confidence: ${(confidence_score * 100).toFixed(1)}%). Manual ID check required.`,
      });
      return;
    }

    if (verdict === 'flagged') {
      await this.raiseAlert({
        exam_id: examId,
        hall_id: hallId,
        event_id: eventId,
        student_id: expected_student.id,
        alert_type: 'low_confidence',
        severity: 'medium',
        message: `Face FLAGGED for ${expected_student.name} (confidence: ${(confidence_score * 100).toFixed(1)}%). Review recommended.`,
      });
    }
  }
}

export const examAlertService = new ExamAlertService();
export default examAlertService;
