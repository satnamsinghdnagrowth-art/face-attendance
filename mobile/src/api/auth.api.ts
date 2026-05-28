import { apiClient } from './client';
import { RegisterDto, ApiResponse, User } from '@/types';

export interface LoginResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token?: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<ApiResponse<LoginResponse>>('/auth/login', { email, password }),

  register: (data: RegisterDto) =>
    apiClient.post<ApiResponse<LoginResponse>>('/auth/register', data),

  refreshToken: (token: string) =>
    apiClient.post<ApiResponse<RefreshTokenResponse>>('/auth/refresh-token', {
      refresh_token: token,
    }),

  logout: () => apiClient.post<ApiResponse<null>>('/auth/logout'),

  forgotPassword: (email: string) =>
    apiClient.post<ApiResponse<{ message: string }>>('/auth/forgot-password', { email }),

  resetPassword: (otp: string, email: string, password: string) =>
    apiClient.post<ApiResponse<{ message: string }>>('/auth/reset-password', {
      otp,
      email,
      new_password: password,
    }),

  verifyOTP: (email: string, otp: string) =>
    apiClient.post<ApiResponse<{ valid: boolean }>>('/auth/verify-otp', { email, otp }),

  me: () => apiClient.get<ApiResponse<User>>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<ApiResponse<{ message: string }>>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
};
