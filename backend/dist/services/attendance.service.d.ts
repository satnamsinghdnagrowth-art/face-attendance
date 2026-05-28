import { AttendanceRecord, AttendanceSession, AttendanceStatus, AttendanceSummary, AttendanceFilter, GPSLocation } from '../types';
export declare class AttendanceService {
    startSession(teacherId: string, classId: string, subjectId: string, location?: GPSLocation, notes?: string): Promise<AttendanceSession>;
    endSession(sessionId: string, teacherId: string): Promise<void>;
    cancelSession(sessionId: string, teacherId: string): Promise<void>;
    markAttendance(sessionId: string, studentId: string, confidence: number, imageUrl?: string, location?: GPSLocation, markedBy?: string): Promise<AttendanceRecord>;
    getSessionById(sessionId: string): Promise<AttendanceSession & {
        teacher_name?: string;
        class_name?: string;
        subject_name?: string;
    }>;
    getSessionAttendance(sessionId: string): Promise<(AttendanceRecord & {
        student_name: string;
        student_email: string;
    })[]>;
    getTeacherSessions(teacherId: string, filters: {
        classId?: string;
        status?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        sessions: AttendanceSession[];
        total: number;
    }>;
    getStudentAttendance(studentId: string, filters: AttendanceFilter): Promise<{
        records: AttendanceRecord[];
        summary: AttendanceSummary;
        total: number;
    }>;
    getClassAttendance(classId: string, dateFrom?: string, dateTo?: string): Promise<unknown[]>;
    updateAttendanceStatus(recordId: string, status: AttendanceStatus, updatedBy: string): Promise<void>;
    getAttendanceSummary(classId: string, subjectId?: string, dateFrom?: string, dateTo?: string): Promise<unknown[]>;
    getDefaultersList(classId: string, threshold?: number): Promise<unknown[]>;
    getDailyReport(classId: string, date: string): Promise<unknown[]>;
    getMonthlyReport(classId: string, month: number, year: number): Promise<unknown[]>;
    getDashboardStats(): Promise<{
        totalStudents: number;
        totalTeachers: number;
        totalClasses: number;
        todayAttendance: number;
        activeSessions: number;
        overallAttendanceRate: number;
    }>;
}
export declare const attendanceService: AttendanceService;
export default attendanceService;
//# sourceMappingURL=attendance.service.d.ts.map