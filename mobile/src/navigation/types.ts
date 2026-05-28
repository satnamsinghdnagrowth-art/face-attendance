import { NavigatorScreenParams } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// Auth stack
export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  OTP: { email: string };
};

// Student tabs
export type StudentTabParamList = {
  Dashboard: undefined;
  AttendanceHistory: undefined;
  FaceEnrollment: undefined;
  Notifications: undefined;
  Profile: undefined;
};

// Teacher tabs
export type TeacherTabParamList = {
  Dashboard: undefined;
  StartAttendance: undefined;
  LiveScan: { sessionId: string };
  FaceEnrollment: undefined;
  Reports: undefined;
  Profile: undefined;
};

// Admin tabs
export type AdminTabParamList = {
  Dashboard: undefined;
  Students: undefined;
  Teachers: undefined;
  Reports: undefined;
  Settings: undefined;
};

// Student stack (wraps tabs + extra screens)
export type StudentStackParamList = {
  StudentTabs: NavigatorScreenParams<StudentTabParamList>;
  LeaveRequest: undefined;
  AttendanceDetail: { recordId: string };
};

// Teacher stack
export type TeacherStackParamList = {
  TeacherTabs: NavigatorScreenParams<TeacherTabParamList>;
  AttendanceReview: { sessionId: string };
  LiveScan: { sessionId: string };
};

// Admin stack
export type AdminStackParamList = {
  AdminTabs: NavigatorScreenParams<AdminTabParamList>;
  StudentDetail: { studentId: string };
  TeacherDetail: { teacherId: string };
  AttendanceReports: undefined;
};

// Root navigator
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Student: NavigatorScreenParams<StudentStackParamList>;
  Teacher: NavigatorScreenParams<TeacherStackParamList>;
  Admin: NavigatorScreenParams<AdminStackParamList>;
};

// Screen props helpers
export type AuthScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<
  AuthStackParamList,
  T
>;

export type StudentTabProps<T extends keyof StudentTabParamList> = BottomTabScreenProps<
  StudentTabParamList,
  T
>;

export type TeacherTabProps<T extends keyof TeacherTabParamList> = BottomTabScreenProps<
  TeacherTabParamList,
  T
>;

export type AdminTabProps<T extends keyof AdminTabParamList> = BottomTabScreenProps<
  AdminTabParamList,
  T
>;

export type StudentStackProps<T extends keyof StudentStackParamList> = NativeStackScreenProps<
  StudentStackParamList,
  T
>;

export type TeacherStackProps<T extends keyof TeacherStackParamList> = NativeStackScreenProps<
  TeacherStackParamList,
  T
>;

export type AdminStackProps<T extends keyof AdminStackParamList> = NativeStackScreenProps<
  AdminStackParamList,
  T
>;
