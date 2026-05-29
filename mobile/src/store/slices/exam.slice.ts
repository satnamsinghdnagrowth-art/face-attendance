import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { examApi } from '@/api/exam.api';
import type {
  Exam,
  ExamWithStats,
  ExamSession,
  StudentSessionStatus,
  ExamAlert,
  VerificationResult,
} from '@/api/exam.api';

// Local RootState shape to avoid circular import with store/index.ts
interface RootState {
  exam: ExamState;
  [key: string]: unknown;
}

export interface ExamState {
  exams: Exam[];
  currentExam: ExamWithStats | null;
  currentSession: ExamSession | null;
  sessionStudents: StudentSessionStatus[];
  activeAlerts: ExamAlert[];
  verificationResult: VerificationResult | null;
  isLoading: boolean;
  isVerifying: boolean;
  error: string | null;
}

const initialState: ExamState = {
  exams: [],
  currentExam: null,
  currentSession: null,
  sessionStudents: [],
  activeAlerts: [],
  verificationResult: null,
  isLoading: false,
  isVerifying: false,
  error: null,
};

// ─── Async Thunks ─────────────────────────────────────────────────────────────

export const loadExamsThunk = createAsyncThunk(
  'exam/loadExams',
  async (
    params: { status?: string; page?: number; limit?: number } | undefined,
    { rejectWithValue }
  ) => {
    try {
      const response = await examApi.listExams(params);
      return response.data.data.exams;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to load exams');
    }
  }
);

export const loadExamThunk = createAsyncThunk(
  'exam/loadExam',
  async (examId: string, { rejectWithValue }) => {
    try {
      const response = await examApi.getExam(examId);
      return response.data.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to load exam');
    }
  }
);

export const startSessionThunk = createAsyncThunk(
  'exam/startSession',
  async (params: { examId: string; hallId: string; force?: boolean }, { rejectWithValue }) => {
    if (!params.examId || !params.hallId) {
      return rejectWithValue('Exam ID and Hall ID are required. Please navigate from My Hall screen.');
    }
    try {
      const response = await examApi.startSession(params.examId, params.hallId, params.force ?? false);
      return response.data.data;
    } catch (error: unknown) {
      const axiosErr = error as {
        response?: { data?: { message?: string; error?: string }; status?: number };
        message?: string;
      };
      const msg =
        axiosErr?.response?.data?.message ||
        axiosErr?.response?.data?.error ||
        axiosErr?.message ||
        'Unable to start session. Please check your connection and try again.';
      return rejectWithValue(msg);
    }
  }
);

export const endSessionThunk = createAsyncThunk(
  'exam/endSession',
  async (sessionId: string, { rejectWithValue }) => {
    try {
      await examApi.endSession(sessionId);
      return sessionId;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to end session');
    }
  }
);

export const loadSessionStudentsThunk = createAsyncThunk(
  'exam/loadSessionStudents',
  async (sessionId: string, { rejectWithValue }) => {
    try {
      const response = await examApi.getSessionStudents(sessionId);
      return response.data.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to load session students');
    }
  }
);

export const verifyEntryThunk = createAsyncThunk(
  'exam/verifyEntry',
  async (formData: FormData, { rejectWithValue }) => {
    try {
      const response = await examApi.verifyEntry(formData);
      return response.data.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Verification failed');
    }
  }
);

export const loadAlertsThunk = createAsyncThunk(
  'exam/loadAlerts',
  async (examId: string, { rejectWithValue }) => {
    try {
      const response = await examApi.getAlerts(examId);
      return response.data.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to load alerts');
    }
  }
);

export const updateExamStatusThunk = createAsyncThunk(
  'exam/updateStatus',
  async (
    { examId, status }: { examId: string; status: 'active' | 'completed' | 'cancelled' },
    { rejectWithValue }
  ) => {
    try {
      const response = await examApi.updateExamStatus(examId, status);
      return response.data.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to update exam status');
    }
  }
);

// ─── Slice ─────────────────────────────────────────────────────────────────────

const examSlice = createSlice({
  name: 'exam',
  initialState,
  reducers: {
    clearVerificationResult: (state) => {
      state.verificationResult = null;
    },
    clearCurrentSession: (state) => {
      state.currentSession = null;
      state.sessionStudents = [];
      state.verificationResult = null;
    },
    updateStudentVerdict: (
      state,
      action: PayloadAction<{ studentId: string; verdict: StudentSessionStatus['latest_verdict']; confidence?: number }>
    ) => {
      const idx = state.sessionStudents.findIndex(
        (s) => s.student_id === action.payload.studentId
      );
      if (idx !== -1) {
        state.sessionStudents[idx].latest_verdict = action.payload.verdict;
        if (action.payload.confidence !== undefined) {
          state.sessionStudents[idx].confidence_score = action.payload.confidence;
        }
        state.sessionStudents[idx].scanned_at = new Date().toISOString();
      }
    },
    addAlert: (state, action: PayloadAction<ExamAlert>) => {
      state.activeAlerts = [action.payload, ...state.activeAlerts];
    },
    resolveAlertLocal: (state, action: PayloadAction<string>) => {
      const idx = state.activeAlerts.findIndex((a) => a.id === action.payload);
      if (idx !== -1) {
        state.activeAlerts[idx].is_resolved = true;
      }
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Load exams
    builder
      .addCase(loadExamsThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadExamsThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.exams = action.payload;
      })
      .addCase(loadExamsThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Load single exam
    builder
      .addCase(loadExamThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadExamThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentExam = action.payload;
      })
      .addCase(loadExamThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Start session
    builder
      .addCase(startSessionThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(startSessionThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentSession = action.payload;
        state.sessionStudents = [];
        state.verificationResult = null;
      })
      .addCase(startSessionThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // End session
    builder
      .addCase(endSessionThunk.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(endSessionThunk.fulfilled, (state) => {
        state.isLoading = false;
        state.currentSession = null;
      })
      .addCase(endSessionThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Load session students
    builder
      .addCase(loadSessionStudentsThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadSessionStudentsThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.sessionStudents = action.payload;
      })
      .addCase(loadSessionStudentsThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Verify entry
    builder
      .addCase(verifyEntryThunk.pending, (state) => {
        state.isVerifying = true;
        state.error = null;
      })
      .addCase(verifyEntryThunk.fulfilled, (state, action) => {
        state.isVerifying = false;
        state.verificationResult = action.payload;
      })
      .addCase(verifyEntryThunk.rejected, (state, action) => {
        state.isVerifying = false;
        state.error = action.payload as string;
      });

    // Load alerts
    builder
      .addCase(loadAlertsThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadAlertsThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.activeAlerts = action.payload;
      })
      .addCase(loadAlertsThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Update exam status (start / cancel / complete)
    builder
      .addCase(updateExamStatusThunk.fulfilled, (state, action) => {
        // Update status in the local exams list if present
        const idx = state.exams.findIndex((e) => e.id === action.payload.id);
        if (idx !== -1) {
          state.exams[idx] = { ...state.exams[idx], ...action.payload } as typeof state.exams[number];
        }
        // Also update currentExam if it's the same exam
        if (state.currentExam?.id === action.payload.id) {
          state.currentExam = { ...state.currentExam, ...action.payload };
        }
      })
      .addCase(updateExamStatusThunk.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const {
  clearVerificationResult,
  clearCurrentSession,
  updateStudentVerdict,
  addAlert,
  resolveAlertLocal,
  clearError,
} = examSlice.actions;

// ─── Selectors ─────────────────────────────────────────────────────────────────

export const selectExams = (state: RootState) => state.exam.exams;
export const selectCurrentExam = (state: RootState) => state.exam.currentExam;
export const selectCurrentSession = (state: RootState) => state.exam.currentSession;
export const selectSessionStudents = (state: RootState) => state.exam.sessionStudents;
export const selectActiveAlerts = (state: RootState) => state.exam.activeAlerts;
export const selectVerificationResult = (state: RootState) => state.exam.verificationResult;
export const selectExamIsLoading = (state: RootState) => state.exam.isLoading;
export const selectExamIsVerifying = (state: RootState) => state.exam.isVerifying;
export const selectExamError = (state: RootState) => state.exam.error;

export default examSlice.reducer;
