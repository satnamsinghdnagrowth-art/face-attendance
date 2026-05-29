import { apiClient } from './client';
import { ApiResponse } from '@/types';

export interface Exam {
  id: string;
  title: string;
  exam_code: string;
  subject_id?: string;
  scheduled_start: string;
  scheduled_end: string;
  duration_mins: number;
  re_verify_interval_mins: number;
  face_threshold: number;
  flag_threshold: number;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  instructions?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
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
}

export interface ExamSession {
  id: string;
  exam_id: string;
  hall_id: string;
  invigilator_id: string;
  started_at: string;
  ended_at?: string;
  status: string;
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
  scanned_at?: string;
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

export interface ExamAlert {
  id: string;
  exam_id: string;
  hall_id?: string;
  event_id?: string;
  student_id?: string;
  student_name?: string;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  is_resolved: boolean;
  created_at: string;
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
  scanned_at: string;
  reviewed_by?: string;
  review_decision?: string;
  review_note?: string;
  reviewed_at?: string;
}

export interface ExamStats {
  total_enrolled: number;
  verified: number;
  flagged: number;
  rejected: number;
  no_show: number;
  proxy_suspects: number;
}

export const examApi = {
  // Exam CRUD
  createExam: (data: Partial<Exam>) =>
    apiClient.post<ApiResponse<Exam>>('/v2/exams', data),

  listExams: (params?: { status?: string; page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<{ exams: Exam[]; total: number }>>('/v2/exams', { params }),

  getExam: (examId: string) =>
    apiClient.get<ApiResponse<ExamWithStats>>(`/v2/exams/${examId}`),

  updateExam: (examId: string, data: Partial<Exam>) =>
    apiClient.patch<ApiResponse<Exam>>(`/v2/exams/${examId}`, data),

  // Exam status transition: 'active' | 'completed' | 'cancelled'
  updateExamStatus: (examId: string, status: 'active' | 'completed' | 'cancelled') =>
    apiClient.patch<ApiResponse<Exam>>(`/v2/exams/${examId}/status`, { status }),

  getExamStats: (examId: string) =>
    apiClient.get<ApiResponse<ExamStats>>(`/v2/exams/${examId}/stats`),

  // Halls
  createHall: (examId: string, data: Partial<ExamHall>) =>
    apiClient.post<ApiResponse<ExamHall>>(`/v2/exams/${examId}/halls`, data),

  getHalls: (examId: string) =>
    apiClient.get<ApiResponse<ExamHall[]>>(`/v2/exams/${examId}/halls`),

  // Enrollments
  enrollStudents: (
    examId: string,
    hallId: string,
    students: Array<{ student_id: string; seat_number?: string; roll_number?: string }>
  ) =>
    apiClient.post<ApiResponse<{ enrolled: number; skipped: number }>>(
      `/v2/exams/${examId}/halls/${hallId}/enroll`,
      { students }
    ),

  getEnrollments: (examId: string, params?: { hall_id?: string }) =>
    apiClient.get<ApiResponse<ExamEnrollment[]>>(`/v2/exams/${examId}/enrollments`, { params }),

  // CSV enrollment: formData must have field "file" with the CSV
  enrollFromCSV: (
    examId: string,
    hallId: string,
    formData: FormData
  ) =>
    apiClient.post<ApiResponse<{ total_rows: number; enrolled: number; skipped: number; errors: Array<{ row: number; reason: string }> }>>(
      `/v2/exams/${examId}/halls/${hallId}/enroll/csv`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ),

  // Sessions
  // force=true → closes any existing active session and starts a fresh one
  startSession: (examId: string, hallId: string, force = false) =>
    apiClient.post<ApiResponse<ExamSession & { resumed: boolean }>>(
      `/v2/exams/${examId}/halls/${hallId}/session/start${force ? '?force=true' : ''}`,
      {}
    ),

  endSession: (sessionId: string) =>
    apiClient.post<ApiResponse<void>>(`/v2/exams/sessions/${sessionId}/end`, {}),

  getSessionStudents: (sessionId: string) =>
    apiClient.get<ApiResponse<StudentSessionStatus[]>>(
      `/v2/exams/sessions/${sessionId}/students`
    ),

  // Alerts
  getAlerts: (examId: string) =>
    apiClient.get<ApiResponse<ExamAlert[]>>(`/v2/exams/${examId}/alerts`),

  resolveAlert: (alertId: string) =>
    apiClient.patch<ApiResponse<void>>(`/v2/exams/alerts/${alertId}/resolve`, {}),

  // Review
  reviewEvent: (eventId: string, data: { review_decision: string; review_note?: string }) =>
    apiClient.patch<ApiResponse<void>>(`/v2/exams/events/${eventId}/review`, data),

  // Verification
  verifyEntry: (formData: FormData) =>
    apiClient.post<ApiResponse<VerificationResult>>('/v2/verify/entry', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  reVerify: (formData: FormData) =>
    apiClient.post<ApiResponse<VerificationResult>>('/v2/verify/re-check', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  getVerificationEvents: (sessionId: string) =>
    apiClient.get<ApiResponse<VerificationEvent[]>>(`/v2/verify/events/${sessionId}`),
};
