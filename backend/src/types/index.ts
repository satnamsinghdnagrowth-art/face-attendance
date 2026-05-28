import { Request } from 'express';

// ─── Enums / Union Types ──────────────────────────────────────────────────────
export type UserRole = 'super_admin' | 'admin' | 'teacher' | 'student';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave' | 'manual_override';
export type SessionStatus = 'active' | 'completed' | 'cancelled';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type OTPType = 'password_reset' | 'email_verification' | 'login';

// ─── Core Entities ────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  password_hash?: string;
  phone?: string;
  role: UserRole;
  class_id?: string;
  photo_url?: string;
  is_active: boolean;
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  photo_url?: string;
  is_active: boolean;
  last_login?: Date;
  created_at: Date;
}

export interface FaceEmbedding {
  id: string;
  user_id: string;
  embedding_vector: number[];
  image_url?: string;
  version: number;
  is_active: boolean;
  created_at: Date;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  date: Date;
  status: AttendanceStatus;
  confidence_score?: number;
  gps_latitude?: number;
  gps_longitude?: number;
  image_url?: string;
  marked_at: Date;
  created_by?: string;
  updated_at: Date;
}

export interface AttendanceSession {
  id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string;
  start_time: Date;
  end_time?: Date;
  status: SessionStatus;
  latitude?: number;
  longitude?: number;
  notes?: string;
  created_at: Date;
}

export interface Class {
  id: string;
  name: string;
  department: string;
  semester?: string;
  academic_year?: string;
  admin_id?: string;
  created_at: Date;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  class_id: string;
  teacher_id?: string;
  created_at: Date;
}

export interface ClassEnrollment {
  id: string;
  student_id: string;
  class_id: string;
  enrolled_at: Date;
}

export interface LeaveRequest {
  id: string;
  student_id: string;
  class_id: string;
  from_date: Date;
  to_date: Date;
  reason: string;
  status: LeaveStatus;
  reviewed_by?: string;
  created_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export interface OTPCode {
  id: string;
  user_id: string;
  code: string;
  type: OTPType;
  expires_at: Date;
  used: boolean;
  created_at: Date;
}

// ─── JWT / Auth ───────────────────────────────────────────────────────────────
export interface JWTPayload {
  userId: string;
  role: UserRole;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  user: PublicUser;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── API Response ─────────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: ValidationError[];
  meta?: Record<string, unknown>;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

// ─── Filter Types ─────────────────────────────────────────────────────────────
export interface AttendanceFilter {
  classId?: string;
  subjectId?: string;
  sessionId?: string;
  studentId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: AttendanceStatus;
  page?: number;
  limit?: number;
}

export interface UserFilter {
  role?: UserRole;
  classId?: string;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Face Recognition ─────────────────────────────────────────────────────────
export interface FaceMatchResult {
  matched: boolean;
  confidence: number;
  studentId?: string;
}

export interface FaceVerifyResult {
  matched: boolean;
  confidence: number;
}

export interface FaceScanResult {
  student: PublicUser | null;
  confidence: number;
  matched: boolean;
}

// ─── Report Types ─────────────────────────────────────────────────────────────
export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  manual_override: number;
  percentage: number;
}

export interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  todayAttendance: number;
  activeSessions: number;
  overallAttendanceRate: number;
}

// ─── GPS Location ─────────────────────────────────────────────────────────────
export interface GPSLocation {
  latitude: number;
  longitude: number;
}

// ─── Socket Events ────────────────────────────────────────────────────────────
export interface SocketAttendancePayload {
  sessionId: string;
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  confidence?: number;
  markedAt: Date;
}

export interface SocketSessionPayload {
  sessionId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  startTime?: Date;
  endTime?: Date;
}
