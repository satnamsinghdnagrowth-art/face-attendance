import { Middleware } from '@reduxjs/toolkit';
import socketService from '@/services/socket.service';
import { loginThunk, logoutThunk, initializeAuthThunk } from '@/store/slices/auth.slice';

/**
 * Handles socket lifecycle in response to auth state changes.
 * Socket calls MUST live here (not inside reducers) because reducers
 * must be pure and synchronous — side effects in reducers cause
 * intermittent crashes when the socket library throws or the JS
 * engine has not yet stabilised after cold start.
 */
export const socketMiddleware: Middleware = (_store) => (next) => (action) => {
  const result = next(action);

  try {
    if (loginThunk.fulfilled.match(action as ReturnType<typeof loginThunk.fulfilled>)) {
      const { access_token } = (action as ReturnType<typeof loginThunk.fulfilled>).payload;
      socketService.connect(access_token);
    }

    if (initializeAuthThunk.fulfilled.match(action as ReturnType<typeof initializeAuthThunk.fulfilled>)) {
      const payload = (action as ReturnType<typeof initializeAuthThunk.fulfilled>).payload;
      if (payload?.access_token) {
        socketService.connect(payload.access_token);
      }
    }

    if (logoutThunk.fulfilled.match(action as ReturnType<typeof logoutThunk.fulfilled>) ||
        logoutThunk.rejected.match(action as ReturnType<typeof logoutThunk.rejected>)) {
      socketService.disconnect();
    }
  } catch (err) {
    // Socket errors must never crash the app — they are non-fatal
    console.warn('[socketMiddleware] Socket lifecycle error (non-fatal):', err);
  }

  return result;
};
