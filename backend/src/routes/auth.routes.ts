import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import {
  login, register, refreshToken, logout,
  forgotPassword, resetPassword, verifyOTP, getMe, changePassword,
  loginValidators, registerValidators, refreshTokenValidators,
  forgotPasswordValidators, resetPasswordValidators, verifyOTPValidators,
} from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import env from '../config/env';

const router = Router();

const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  message: { success: false, message: 'Too many auth attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Public Routes ────────────────────────────────────────────────────────────
router.post('/login', authRateLimiter, loginValidators, validate, login);
router.post('/refresh-token', refreshTokenValidators, validate, refreshToken);
router.post('/forgot-password', authRateLimiter, forgotPasswordValidators, validate, forgotPassword);
router.post('/reset-password', authRateLimiter, resetPasswordValidators, validate, resetPassword);
router.post('/verify-otp', authRateLimiter, verifyOTPValidators, validate, verifyOTP);

// ─── Protected Routes ─────────────────────────────────────────────────────────
router.post('/register', authenticateToken, registerValidators, validate, register);
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, getMe);
router.post(
  '/change-password',
  authenticateToken,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('New password must be at least 8 characters with mixed case and numbers'),
  ],
  validate,
  changePassword
);

export default router;
