export type UserRole = 'super_admin' | 'admin' | 'chief_examiner' | 'hall_invigilator' | 'teacher' | 'student';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave' | 'manual_override';
export type SessionStatus = 'active' | 'completed' | 'cancelled';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  class_id?: string;
  photo_url?: string;
  department?: string;
  semester?: string;
  roll_number?: string;
  employee_id?: string;
  face_registered?: boolean;
  is_active?: boolean;
  created_at?: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  student_name?: string;
  class_id: string;
  subject_id: string;
  subject_name?: string;
  date: string;
  status: AttendanceStatus;
  confidence_score?: number;
  session_id: string;
  marked_at: string;
  notes?: string;
  override_reason?: string;
}

export interface AttendanceSession {
  id: string;
  teacher_id: string;
  teacher_name?: string;
  class_id: string;
  class_name?: string;
  subject_id: string;
  subject_name?: string;
  start_time: string;
  end_time?: string;
  status: SessionStatus;
  location?: {
    latitude: number;
    longitude: number;
  };
  present_count?: number;
  absent_count?: number;
  total_students?: number;
}

export interface ClassRoom {
  id: string;
  name: string;
  department: string;
  semester: string;
  section?: string;
  total_students?: number;
  teacher_id?: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  class_id: string;
  teacher_id?: string;
  credits?: number;
}

export interface ScanResult {
  student: User;
  confidence: number;
  status: AttendanceStatus;
  record_id?: string;
  scanned_at?: string;
}

export interface FaceData {
  userId: string;
  imageUri: string;
  embedding: number[];
  landmarks?: FaceLandmark[];
}

export interface FaceLandmark {
  x: number;
  y: number;
  type?: string;
}

export interface FaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFace {
  faceID?: number;
  bounds: {
    origin: { x: number; y: number };
    size: { width: number; height: number };
  };
  rollAngle?: number;
  yawAngle?: number;
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  smilingProbability?: number;
  leftEarPosition?: { x: number; y: number };
  rightEarPosition?: { x: number; y: number };
  leftEyePosition?: { x: number; y: number };
  rightEyePosition?: { x: number; y: number };
  leftCheekPosition?: { x: number; y: number };
  rightCheekPosition?: { x: number; y: number };
  leftMouthPosition?: { x: number; y: number };
  rightMouthPosition?: { x: number; y: number };
  mouthPosition?: { x: number; y: number };
  noseBasePosition?: { x: number; y: number };
  bottomMouthPosition?: { x: number; y: number };
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'attendance' | 'leave' | 'system' | 'alert';
  is_read: boolean;
  created_at: string;
  data?: Record<string, unknown>;
}

export interface LeaveRequest {
  id: string;
  student_id: string;
  student_name?: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  review_note?: string;
  created_at: string;
}

export interface AttendanceSummary {
  total_classes: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  percentage: number;
  by_subject?: SubjectAttendance[];
}

export interface SubjectAttendance {
  subject_id: string;
  subject_name: string;
  total: number;
  present: number;
  percentage: number;
}

export interface RegisterDto {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  class_id?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface LivenessData {
  frames: DetectedFace[];
  userId: string;
}

export interface OfflineAttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  status: AttendanceStatus;
  marked_at: string;
  synced: boolean;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}
