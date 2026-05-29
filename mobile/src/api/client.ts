import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import socketService from '@/services/socket.service';

// ─── API URL Configuration ────────────────────────────────────────────────────
// Option A: Render production server (ensure migrations have been run on Render)
export const API_BASE_URL = 'https://face-attendance-9kza.onrender.com/api';
// Option B: Local development (replace 192.168.x.x with your machine's WiFi IP)
// export const API_BASE_URL = 'http://localhost:3030/api';
// Option C: Android emulator only
// export const API_BASE_URL = 'http://10.0.2.2:3030/api';

// Callback registered by the app to handle full session expiry (navigate to login)
let onSessionExpired: (() => void) | null = null;
export const setOnSessionExpired = (cb: () => void): void => {
  onSessionExpired = cb;
};

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string | null) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request interceptor: attach Bearer token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await SecureStore.getItemAsync('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor: handle 401 with token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers['Authorization'] = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token: newRefreshToken } = response.data.data;

        await SecureStore.setItemAsync('access_token', access_token);
        if (newRefreshToken) {
          await SecureStore.setItemAsync('refresh_token', newRefreshToken);
        }

        // Keep the socket authenticated with the new token
        socketService.updateToken(access_token);

        processQueue(null, access_token);

        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        // Notify the app so it can dispatch logout and navigate to login
        onSessionExpired?.();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const setAuthToken = (token: string | null) => {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
};

export default apiClient;
