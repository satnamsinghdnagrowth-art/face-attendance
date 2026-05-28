import { apiClient } from './client';
import {
  ApiResponse,
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  AttendanceSummary,
} from '@/types';

export interface StartSessionParams {
  class_id: string;
  subject_id: string;
  location?: { latitude: number; longitude: number };
}

export interface GetHistoryParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  subject_id?: string;
  status?: AttendanceStatus;
}

export interface GetClassAttendanceParams {
  class_id: string;
  date?: string;
  subject_id?: string;
  session_id?: string;
}

export interface AttendanceTrendPoint {
  date: string;
  percentage: number;
  present: number;
  total: number;
}

export interface ClassAttendanceStats {
  class_id: string;
  class_name: string;
  total_students: number;
  present: number;
  absent: number;
  late: number;
  percentage: number;
  records: AttendanceRecord[];
}

export const attendanceApi = {
  startSession: (params: StartSessionParams) =>
    apiClient.post<ApiResponse<AttendanceSession>>('/attendance/sessions/start', params),

  endSession: (sessionId: string) =>
    apiClient.post<ApiResponse<AttendanceSession>>(`/attendance/sessions/${sessionId}/end`),

  getSession: (sessionId: string) =>
    apiClient.get<ApiResponse<AttendanceSession>>(`/attendance/sessions/${sessionId}`),

  getActiveSessions: () =>
    apiClient.get<ApiResponse<AttendanceSession[]>>('/attendance/sessions/active'),

  getMyHistory: (params?: GetHistoryParams) =>
    apiClient.get<ApiResponse<AttendanceRecord[]>>('/attendance/my-history', { params }),

  getClassAttendance: (params: GetClassAttendanceParams) =>
    apiClient.get<ApiResponse<ClassAttendanceStats>>('/attendance/class', { params }),

  getSessionRecords: (sessionId: string) =>
    apiClient.get<ApiResponse<AttendanceRecord[]>>(`/attendance/sessions/${sessionId}/records`),

  manualOverride: (recordId: string, status: AttendanceStatus, reason: string) =>
    apiClient.patch<ApiResponse<AttendanceRecord>>(`/attendance/records/${recordId}/override`, {
      status,
      reason,
    }),

  manualMark: (sessionId: string, studentId: string, status: AttendanceStatus) =>
    apiClient.post<ApiResponse<AttendanceRecord>>('/attendance/manual-mark', {
      session_id: sessionId,
      student_id: studentId,
      status,
    }),

  getAttendanceSummary: (studentId: string, params?: { from?: string; to?: string }) =>
    apiClient.get<ApiResponse<AttendanceSummary>>(`/attendance/summary/${studentId}`, {
      params,
    }),

  getAttendanceTrend: (params: {
    class_id?: string;
    subject_id?: string;
    from?: string;
    to?: string;
    student_id?: string;
  }) => apiClient.get<ApiResponse<AttendanceTrendPoint[]>>('/attendance/trend', { params }),

  getDefaulters: (params: { threshold?: number; class_id?: string }) =>
    apiClient.get<ApiResponse<Array<{ student: { id: string; name: string }; percentage: number }>

    >>('/attendance/defaulters', { params }),

  exportAttendance: (params: {
    class_id?: string;
    subject_id?: string;
    from?: string;
    to?: string;
    format?: 'pdf' | 'csv';
  }) =>
    apiClient.get('/attendance/export', {
      params,
      responseType: 'blob',
    }),

  submitLeaveRequest: (data: {
    from_date: string;
    to_date: string;
    reason: string;
  }) => apiClient.post<ApiResponse<{ id: string; status: string }>>('/attendance/leave-request', data),

  getLeaveRequests: (studentId?: string) =>
    apiClient.get<ApiResponse<unknown[]>>('/attendance/leave-requests', {
      params: studentId ? { student_id: studentId } : undefined,
    }),

  reviewLeaveRequest: (requestId: string, status: 'approved' | 'rejected', note?: string) =>
    apiClient.patch<ApiResponse<unknown>>(`/attendance/leave-requests/${requestId}/review`, {
      status,
      note,
    }),
};
