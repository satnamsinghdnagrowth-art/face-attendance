import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import authReducer from './slices/auth.slice';
import attendanceReducer from './slices/attendance.slice';
import uiReducer from './slices/ui.slice';
import examReducer from './slices/exam.slice';
import { socketMiddleware } from '@/middleware/socketMiddleware';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    attendance: attendanceReducer,
    ui: uiReducer,
    exam: examReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore all auth actions — user objects may contain Date instances
        ignoredActions: [
          'auth/login/fulfilled',
          'auth/initialize/fulfilled',
          'auth/updateProfile/fulfilled',
          'exam/loadExam/fulfilled',
          'exam/loadExams/fulfilled',
          'exam/startSession/fulfilled',
          'exam/loadSessionStudents/fulfilled',
          'exam/verifyEntry/fulfilled',
          'exam/loadAlerts/fulfilled',
        ],
        ignoredPaths: [
          'auth.user',
          'exam.currentExam',
          'exam.currentSession',
          'exam.exams',
          'exam.sessionStudents',
          'exam.activeAlerts',
          'exam.verificationResult',
        ],
      },
    }).concat(socketMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Exam actions re-exported with alias disambiguation
export {
  clearVerificationResult,
  clearCurrentSession,
  updateStudentVerdict,
  addAlert,
  resolveAlertLocal,
  clearError as clearExamError,
  loadExamsThunk,
  loadExamThunk,
  startSessionThunk as startExamSessionThunk,
  endSessionThunk as endExamSessionThunk,
  loadSessionStudentsThunk,
  verifyEntryThunk,
  loadAlertsThunk,
  updateExamStatusThunk,
  selectExams,
  selectCurrentExam,
  selectCurrentSession as selectExamCurrentSession,
  selectSessionStudents,
  selectActiveAlerts,
  selectVerificationResult,
  selectExamIsLoading,
  selectExamIsVerifying,
  selectExamError,
} from './slices/exam.slice';
