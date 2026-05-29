import { Response, NextFunction, Request } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../types';
import { validateUUID } from '../utils/uuid.validator';
import { authService } from '../services/auth.service';
import { query } from '../config/database';
import { hashPassword, comparePassword } from '../utils/encryption';
import {
  successResponse,
  errorResponse,
  createdResponse,
} from '../utils/response';
import { CustomError, UnauthorizedError } from '../middleware/error.middleware';
import logger from '../utils/logger';

// ─── Validators ───────────────────────────────────────────────────────────────
export const loginValidators = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

export const registerValidators = [
  body('name')
    .trim()
    .notEmpty()
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, and a number'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Invalid phone number'),
  body('role')
    .isIn(['admin', 'teacher', 'student', 'super_admin'])
    .withMessage('Invalid role'),
];

export const refreshTokenValidators = [
  body('refresh_token')
    .notEmpty()
    .withMessage('Refresh token is required'),
];

export const forgotPasswordValidators = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
];

export const resetPasswordValidators = [
  body('userId')
    .notEmpty()
    .custom(validateUUID('userId')),
  body('otp')
    .notEmpty()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Valid 6-digit OTP is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, and a number'),
];

export const verifyOTPValidators = [
  body('userId')
    .notEmpty()
    .custom(validateUUID('userId')),
  body('otp')
    .notEmpty()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be a 6-digit number'),
  body('type')
    .optional()
    .isIn(['password_reset', 'email_verification', 'login'])
    .withMessage('Invalid OTP type'),
];

// ─── Controllers ──────────────────────────────────────────────────────────────
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const result = await authService.login(email, password);
    successResponse(res, result, 'Login successful');
  } catch (error) {
    next(error);
  }
};

export const register = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, email, password, phone, role } = req.body as {
      name: string;
      email: string;
      password: string;
      phone?: string;
      role: 'admin' | 'teacher' | 'student' | 'super_admin';
    };

    // Non-admins can only register as students
    if (req.user && !['admin', 'super_admin'].includes(req.user.role)) {
      if (role !== 'student') {
        errorResponse(res, 'You can only register as a student', 403);
        return;
      }
    }

    const user = await authService.register({ name, email, password, phone, role });
    createdResponse(res, user, 'User registered successfully');
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refresh_token: token } = req.body as { refresh_token: string };
    const tokens = await authService.refreshToken(token);
    successResponse(res, tokens, 'Token refreshed successfully');
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { refresh_token: token } = req.body as { refresh_token?: string };
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    await authService.logout(req.user.userId, token || '', accessToken);
    successResponse(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body as { email: string };
    await authService.forgotPassword(email);
    // Always return success to prevent email enumeration
    successResponse(
      res,
      null,
      'If an account exists with this email, a password reset OTP has been sent'
    );
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId, otp, newPassword } = req.body as {
      userId: string;
      otp: string;
      newPassword: string;
    };
    await authService.resetPassword(userId, otp, newPassword);
    successResponse(res, null, 'Password reset successful. Please login with your new password.');
  } catch (error) {
    next(error);
  }
};

export const verifyOTP = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId, otp, type = 'password_reset' } = req.body as {
      userId: string;
      otp: string;
      type?: string;
    };
    const isValid = await authService.verifyOTP(userId, otp, type);

    if (!isValid) {
      errorResponse(res, 'Invalid or expired OTP', 400);
      return;
    }

    successResponse(res, { verified: true }, 'OTP verified successfully');
  } catch (error) {
    next(error);
  }
};

export const getMe = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const user = await authService.getUserById(req.user.userId);
    successResponse(res, user, 'User profile retrieved');
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    const result = await query<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [req.user.userId]
    );

    const user = result.rows[0];
    if (!user) {
      throw new CustomError('User not found', 404);
    }

    const isValid = await comparePassword(currentPassword, user.password_hash);
    if (!isValid) {
      errorResponse(res, 'Current password is incorrect', 400);
      return;
    }

    const newHash = await hashPassword(newPassword);
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, req.user.userId]
    );

    logger.info('Password changed', { userId: req.user.userId });
    successResponse(res, null, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};
