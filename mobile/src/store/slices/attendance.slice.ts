import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { attendanceApi } from '@/api/attendance.api';
import { faceApi } from '@/api/face.api';
import socketService from '@/services/socket.service';
import {
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  AttendanceSummary,
  ScanResult,
} from '@/types';

export interface AttendanceState {
  currentSession: AttendanceSession | null;
  sessionRecords: AttendanceRecord[];
  history: AttendanceRecord[];
  summary: AttendanceSummary | null;
  isLoading: boolean;
  isSessionLoading: boolean;
  isScanLoading: boolean;
  scanResults: ScanResult[];
  error: string | null;
  historyPage: number;
  historyHasMore: boolean;
  activeSessions: AttendanceSession[];
}

const initialState: AttendanceState = {
  currentSession: null,
  sessionRecords: [],
  history: [],
  summary: null,
  isLoading: false,
  isSessionLoading: false,
  isScanLoading: false,
  scanResults: [],
  error: null,
  historyPage: 1,
  historyHasMore: true,
  activeSessions: [],
};

// Thunks
export const startSessionThunk = createAsyncThunk(
  'attendance/startSession',
  async (
    params: {
      class_id: string;
      subject_id: string;
      location?: { latitude: number; longitude: number };
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await attendanceApi.startSession(params);
      return response.data.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to start session');
    }
  }
);

export const endSessionThunk = createAsyncThunk(
  'attendance/endSession',
  async (sessionId: string, { rejectWithValue }) => {
    try {
      const response = await attendanceApi.endSession(sessionId);
      return response.data.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to end session');
    }
  }
);

export const scanFaceThunk = createAsyncThunk(
  'attendance/scanFace',
  async (
    params: { sessionId: string; imageUri: string; embedding: number[] },
    { rejectWithValue }
  ) => {
    try {
      const response = await faceApi.scanForAttendance(
        params.sessionId,
        params.imageUri,
        params.embedding
      );
      return response.data.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Scan failed');
    }
  }
);

export const loadHistoryThunk = createAsyncThunk(
  'attendance/loadHistory',
  async (
    params: { page?: number; limit?: number; from?: string; to?: string; refresh?: boolean },
    { rejectWithValue }
  ) => {
    try {
      const response = await attendanceApi.getMyHistory({
        page: params.page || 1,
        limit: params.limit || 20,
        from: params.from,
        to: params.to,
      });
      return {
        records: response.data.data,
        pagination: response.data.pagination,
        refresh: params.refresh,
      };
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to load history');
    }
  }
);

export const loadSessionRecordsThunk = createAsyncThunk(
  'attendance/loadSessionRecords',
  async (sessionId: string, { rejectWithValue }) => {
    try {
      const response = await attendanceApi.getSessionRecords(sessionId);
      return response.data.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to load session records');
    }
  }
);

export const loadSummaryThunk = createAsyncThunk(
  'attendance/loadSummary',
  async (studentId: string, { rejectWithValue }) => {
    try {
      const response = await attendanceApi.getAttendanceSummary(studentId);
      return response.data.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to load summary');
    }
  }
);

export const manualOverrideThunk = createAsyncThunk(
  'attendance/manualOverride',
  async (
    params: { recordId: string; status: AttendanceStatus; reason: string },
    { rejectWithValue }
  ) => {
    try {
      const response = await attendanceApi.manualOverride(
        params.recordId,
        params.status,
        params.reason
      );
      return response.data.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to override attendance');
    }
  }
);

export const loadActiveSessionsThunk = createAsyncThunk(
  'attendance/loadActiveSessions',
  async (_, { rejectWithValue }) => {
    try {
      const response = await attendanceApi.getActiveSessions();
      return response.data.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      return rejectWithValue(err?.response?.data?.message || 'Failed to load active sessions');
    }
  }
);

const attendanceSlice = createSlice({
  name: 'attendance',
  initialState,
  reducers: {
    setCurrentSession: (state, action: PayloadAction<AttendanceSession | null>) => {
      state.currentSession = action.payload;
    },
    addScanResult: (state, action: PayloadAction<ScanResult>) => {
      // Avoid duplicates within 5 seconds
      const now = Date.now();
      const existing = state.scanResults.find(
        (r) =>
          r.student.id === action.payload.student.id &&
          r.scanned_at &&
          now - new Date(r.scanned_at).getTime() < 5000
      );
      if (!existing) {
        state.scanResults = [action.payload, ...state.scanResults];
      }
    },
    clearScanResults: (state) => {
      state.scanResults = [];
    },
    clearError: (state) => {
      state.error = null;
    },
    updateSessionRecord: (state, action: PayloadAction<AttendanceRecord>) => {
      const idx = state.sessionRecords.findIndex((r) => r.id === action.payload.id);
      if (idx !== -1) {
        state.sessionRecords[idx] = action.payload;
      } else {
        state.sessionRecords.push(action.payload);
      }
    },
    clearSession: (state) => {
      state.currentSession = null;
      state.sessionRecords = [];
      state.scanResults = [];
    },
  },
  extraReducers: (builder) => {
    // Start session
    builder
      .addCase(startSessionThunk.pending, (state) => {
        state.isSessionLoading = true;
        state.error = null;
      })
      .addCase(startSessionThunk.fulfilled, (state, action) => {
        state.isSessionLoading = false;
        state.currentSession = action.payload;
        state.scanResults = [];
        state.sessionRecords = [];
        if (action.payload?.class_id) {
          socketService.joinClassRoom(action.payload.class_id);
        }
        if (action.payload?.id) {
          socketService.joinSession(action.payload.id);
        }
      })
      .addCase(startSessionThunk.rejected, (state, action) => {
        state.isSessionLoading = false;
        state.error = action.payload as string;
      });

    // End session
    builder
      .addCase(endSessionThunk.pending, (state) => {
        state.isSessionLoading = true;
      })
      .addCase(endSessionThunk.fulfilled, (state) => {
        state.isSessionLoading = false;
        state.currentSession = null;
      })
      .addCase(endSessionThunk.rejected, (state, action) => {
        state.isSessionLoading = false;
        state.error = action.payload as string;
      });

    // Scan face
    builder
      .addCase(scanFaceThunk.pending, (state) => {
        state.isScanLoading = true;
      })
      .addCase(scanFaceThunk.fulfilled, (state) => {
        state.isScanLoading = false;
      })
      .addCase(scanFaceThunk.rejected, (state, action) => {
        state.isScanLoading = false;
        state.error = action.payload as string;
      });

    // Load history
    builder
      .addCase(loadHistoryThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadHistoryThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        const { records, pagination, refresh } = action.payload;
        if (refresh) {
          state.history = records;
          state.historyPage = 1;
        } else {
          state.history = [...state.history, ...records];
        }
        state.historyPage = (pagination?.page || 1) + 1;
        state.historyHasMore =
          (pagination?.page || 1) < (pagination?.pages || 1);
      })
      .addCase(loadHistoryThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Load session records
    builder
      .addCase(loadSessionRecordsThunk.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(loadSessionRecordsThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.sessionRecords = action.payload;
      })
      .addCase(loadSessionRecordsThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Load summary
    builder
      .addCase(loadSummaryThunk.fulfilled, (state, action) => {
        state.summary = action.payload;
      });

    // Manual override
    builder
      .addCase(manualOverrideThunk.fulfilled, (state, action) => {
        const idx = state.sessionRecords.findIndex((r) => r.id === action.payload.id);
        if (idx !== -1) {
          state.sessionRecords[idx] = action.payload;
        }
      });

    // Load active sessions
    builder
      .addCase(loadActiveSessionsThunk.fulfilled, (state, action) => {
        state.activeSessions = action.payload;
        // Students join class rooms for active sessions to receive attendance notifications
        action.payload?.forEach((session) => {
          if (session.class_id) socketService.joinClassRoom(session.class_id);
        });
      });
  },
});

export const {
  setCurrentSession,
  addScanResult,
  clearScanResults,
  clearError,
  updateSessionRecord,
  clearSession,
} = attendanceSlice.actions;

export default attendanceSlice.reducer;
