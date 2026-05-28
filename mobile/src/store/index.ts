import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import authReducer from './slices/auth.slice';
import attendanceReducer from './slices/attendance.slice';
import uiReducer from './slices/ui.slice';
import examReducer from './slices/exam.slice';

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
        ignoredActions: ['auth/login/fulfilled', 'auth/initialize/fulfilled'],
        ignoredPaths: ['auth.user'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Exam actions
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
