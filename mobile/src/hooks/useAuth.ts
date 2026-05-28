import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  loginThunk,
  logoutThunk,
  clearError,
  updateUser,
} from '@/store/slices/auth.slice';
import { User } from '@/types';

export const useAuth = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const isLoading = useAppSelector((state) => state.auth.isLoading);
  const error = useAppSelector((state) => state.auth.error);
  const accessToken = useAppSelector((state) => state.auth.accessToken);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await dispatch(loginThunk({ email, password }));
      if (loginThunk.rejected.match(result)) {
        throw new Error(result.payload as string);
      }
      return result.payload;
    },
    [dispatch]
  );

  const logout = useCallback(async () => {
    await dispatch(logoutThunk());
  }, [dispatch]);

  const clearAuthError = useCallback(() => {
    dispatch(clearError());
  }, [dispatch]);

  const updateUserProfile = useCallback(
    (data: Partial<User>) => {
      dispatch(updateUser(data));
    },
    [dispatch]
  );

  const isStudent = user?.role === 'student';
  const isTeacher = user?.role === 'teacher';
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuperAdmin = user?.role === 'super_admin';

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    accessToken,
    login,
    logout,
    clearAuthError,
    updateUserProfile,
    isStudent,
    isTeacher,
    isAdmin,
    isSuperAdmin,
  };
};
