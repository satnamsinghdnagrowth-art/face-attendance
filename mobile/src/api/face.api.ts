import { apiClient } from './client';
import { ApiResponse } from '@/types';

export interface FaceStatusResponse {
  registered: boolean;
  sample_count: number;
  last_updated?: string;
}

export interface FaceRegisterResponse {
  success: boolean;
  message: string;
  sample_count: number;
}

export interface LivenessResult {
  passed: boolean;
  score: number;
  reason?: string;
}

export interface VerifyFaceResponse {
  matched: boolean;
  confidence: number;
  user_id?: string;
}

export interface ScanAttendanceResponse {
  success: boolean;
  student_id?: string;
  student_name?: string;
  confidence?: number;
  status?: string;
  record_id?: string;
  message: string;
}

export interface LivenessData {
  userId: string;
  frames: Array<{
    leftEyeOpenProbability?: number;
    rightEyeOpenProbability?: number;
    yawAngle?: number;
    rollAngle?: number;
  }>;
}

export const faceApi = {
  /**
   * Register a single face sample.
   *
   * @param isNewEnrollment  Pass `true` for the FIRST image of a fresh
   *   enrollment batch — this deactivates any previous embeddings so that
   *   re-enrollment fully replaces the old face data.  Pass `false` (default)
   *   for subsequent images in the same batch so all 5 angles are retained.
   */
  registerFace: (
    userId: string,
    imageUri: string,
    embedding: number[],
    isNewEnrollment: boolean = false
  ) => {
    const form = new FormData();
    form.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'face.jpg',
    } as unknown as Blob);
    form.append('user_id', userId);
    form.append('embedding', JSON.stringify(embedding));
    form.append('is_new_enrollment', String(isNewEnrollment));

    return apiClient.post<ApiResponse<FaceRegisterResponse>>('/face/register', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
  },

  registerFaceMultiple: async (
    userId: string,
    images: Array<{ uri: string; embedding: number[] }>
  ) => {
    // First image resets old enrollment; subsequent images add to the batch
    const promises = images.map(({ uri, embedding }, index) =>
      faceApi.registerFace(userId, uri, embedding, index === 0)
    );
    return Promise.all(promises);
  },

  getStatus: (userId: string) =>
    apiClient.get<ApiResponse<FaceStatusResponse>>(`/face/${userId}/status`),

  verifyFace: (userId: string, embedding: number[]) =>
    apiClient.post<ApiResponse<VerifyFaceResponse>>('/face/verify', {
      user_id: userId,
      embedding,
    }),

  scanForAttendance: (
    sessionId: string,
    imageUri: string,
    embedding: number[]
  ) => {
    const form = new FormData();
    form.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'scan.jpg',
    } as unknown as Blob);
    form.append('session_id', sessionId);
    form.append('embedding', JSON.stringify(embedding));

    return apiClient.post<ApiResponse<ScanAttendanceResponse>>('/attendance/scan', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
  },

  livenessCheck: (data: LivenessData) =>
    apiClient.post<ApiResponse<LivenessResult>>('/face/liveness-check', data),

  deleteFaceData: (userId: string) =>
    apiClient.delete<ApiResponse<{ message: string }>>(`/face/${userId}`),
};
