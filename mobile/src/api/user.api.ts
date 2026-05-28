import { apiClient } from './client';
import { ApiResponse, ClassRoom, Subject, User, UserRole } from '@/types';

export interface GetUsersParams {
  role?: UserRole;
  page?: number;
  limit?: number;
  class_id?: string;
  search?: string;
  department?: string;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  phone?: string;
  class_id?: string;
  department?: string;
  semester?: string;
}

export interface DashboardStats {
  total_students: number;
  total_teachers: number;
  total_classes: number;
  today_attendance_rate: number;
  active_sessions: number;
  unread_notifications: number;
}

export const userApi = {
  getUsers: (params: GetUsersParams) =>
    apiClient.get<ApiResponse<User[]>>('/users', { params }),

  getUser: (id: string) => apiClient.get<ApiResponse<User>>(`/users/${id}`),

  updateUser: (id: string, data: UpdateUserDto) =>
    apiClient.put<ApiResponse<User>>(`/users/${id}`, data),

  deleteUser: (id: string) =>
    apiClient.delete<ApiResponse<{ message: string }>>(`/users/${id}`),

  uploadPhoto: (id: string, imageUri: string) => {
    const form = new FormData();
    form.append('photo', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'profile.jpg',
    } as unknown as Blob);
    return apiClient.post<ApiResponse<{ photo_url: string }>>(`/users/${id}/photo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getClasses: (params?: { department?: string; teacher_id?: string }) =>
    apiClient.get<ApiResponse<ClassRoom[]>>('/classes', { params }),

  getClass: (classId: string) =>
    apiClient.get<ApiResponse<ClassRoom>>(`/classes/${classId}`),

  createClass: (data: Partial<ClassRoom>) =>
    apiClient.post<ApiResponse<ClassRoom>>('/classes', data),

  updateClass: (classId: string, data: Partial<ClassRoom>) =>
    apiClient.patch<ApiResponse<ClassRoom>>(`/classes/${classId}`, data),

  getClassStudents: (classId: string, params?: { page?: number; limit?: number; search?: string }) =>
    apiClient.get<ApiResponse<User[]>>(`/classes/${classId}/students`, { params }),

  enrollStudent: (classId: string, studentId: string) =>
    apiClient.post<ApiResponse<{ message: string }>>(`/classes/${classId}/enroll`, {
      student_id: studentId,
    }),

  unenrollStudent: (classId: string, studentId: string) =>
    apiClient.delete<ApiResponse<{ message: string }>>(`/classes/${classId}/students/${studentId}`),

  getSubjects: (params?: { class_id?: string; teacher_id?: string }) =>
    apiClient.get<ApiResponse<Subject[]>>(
      params?.class_id ? `/classes/${params.class_id}/subjects` : '/classes/subjects/all',
      { params: params?.teacher_id ? { teacher_id: params.teacher_id } : undefined }
    ),

  getSubject: (classId: string, subjectId: string) =>
    apiClient.get<ApiResponse<Subject>>(`/classes/${classId}/subjects/${subjectId}`),

  createSubject: (data: Partial<Subject>) =>
    apiClient.post<ApiResponse<Subject>>('/subjects', data),

  getDashboardStats: () =>
    apiClient.get<ApiResponse<DashboardStats>>('/dashboard/stats'),

  getRecentActivity: (limit?: number) =>
    apiClient.get<ApiResponse<unknown[]>>('/dashboard/activity', { params: { limit } }),

  getNotifications: (params?: { page?: number; limit?: number; unread?: boolean }) =>
    apiClient.get<ApiResponse<unknown[]>>('/notifications', { params }),

  markNotificationRead: (notificationId: string) =>
    apiClient.patch<ApiResponse<{ message: string }>>(`/notifications/${notificationId}/read`),

  markAllNotificationsRead: () =>
    apiClient.patch<ApiResponse<{ message: string }>>('/notifications/read-all'),

  getTeacherClasses: (teacherId: string) =>
    apiClient.get<ApiResponse<ClassRoom[]>>(`/users/${teacherId}/classes`),
};
