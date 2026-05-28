"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePassword = exports.getMe = exports.verifyOTP = exports.resetPassword = exports.forgotPassword = exports.logout = exports.refreshToken = exports.register = exports.login = exports.verifyOTPValidators = exports.resetPasswordValidators = exports.forgotPasswordValidators = exports.refreshTokenValidators = exports.registerValidators = exports.loginValidators = void 0;
const express_validator_1 = require("express-validator");
const auth_service_1 = require("../services/auth.service");
const database_1 = require("../config/database");
const encryption_1 = require("../utils/encryption");
const response_1 = require("../utils/response");
const error_middleware_1 = require("../middleware/error.middleware");
const logger_1 = __importDefault(require("../utils/logger"));
exports.loginValidators = [
    (0, express_validator_1.body)('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    (0, express_validator_1.body)('password')
        .notEmpty()
        .withMessage('Password is required'),
];
exports.registerValidators = [
    (0, express_validator_1.body)('name')
        .trim()
        .notEmpty()
        .isLength({ min: 2, max: 255 })
        .withMessage('Name must be between 2 and 255 characters'),
    (0, express_validator_1.body)('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    (0, express_validator_1.body)('password')
        .isLength({ min: 8 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must be at least 8 characters with uppercase, lowercase, and a number'),
    (0, express_validator_1.body)('phone')
        .optional()
        .isMobilePhone('any')
        .withMessage('Invalid phone number'),
    (0, express_validator_1.body)('role')
        .isIn(['admin', 'teacher', 'student', 'super_admin'])
        .withMessage('Invalid role'),
];
exports.refreshTokenValidators = [
    (0, express_validator_1.body)('refresh_token')
        .notEmpty()
        .withMessage('Refresh token is required'),
];
exports.forgotPasswordValidators = [
    (0, express_validator_1.body)('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
];
exports.resetPasswordValidators = [
    (0, express_validator_1.body)('userId')
        .notEmpty()
        .isUUID()
        .withMessage('Valid user ID is required'),
    (0, express_validator_1.body)('otp')
        .notEmpty()
        .isLength({ min: 6, max: 6 })
        .isNumeric()
        .withMessage('Valid 6-digit OTP is required'),
    (0, express_validator_1.body)('newPassword')
        .isLength({ min: 8 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must be at least 8 characters with uppercase, lowercase, and a number'),
];
exports.verifyOTPValidators = [
    (0, express_validator_1.body)('userId')
        .notEmpty()
        .isUUID()
        .withMessage('Valid user ID is required'),
    (0, express_validator_1.body)('otp')
        .notEmpty()
        .isLength({ min: 6, max: 6 })
        .isNumeric()
        .withMessage('OTP must be a 6-digit number'),
    (0, express_validator_1.body)('type')
        .optional()
        .isIn(['password_reset', 'email_verification', 'login'])
        .withMessage('Invalid OTP type'),
];
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const result = await auth_service_1.authService.login(email, password);
        (0, response_1.successResponse)(res, result, 'Login successful');
    }
    catch (error) {
        next(error);
    }
};
exports.login = login;
const register = async (req, res, next) => {
    try {
        const { name, email, password, phone, role } = req.body;
        if (req.user && !['admin', 'super_admin'].includes(req.user.role)) {
            if (role !== 'student') {
                (0, response_1.errorResponse)(res, 'You can only register as a student', 403);
                return;
            }
        }
        const user = await auth_service_1.authService.register({ name, email, password, phone, role });
        (0, response_1.createdResponse)(res, user, 'User registered successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.register = register;
const refreshToken = async (req, res, next) => {
    try {
        const { refresh_token: token } = req.body;
        const tokens = await auth_service_1.authService.refreshToken(token);
        (0, response_1.successResponse)(res, tokens, 'Token refreshed successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.refreshToken = refreshToken;
const logout = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new error_middleware_1.UnauthorizedError('Authentication required');
        }
        const { refresh_token: token } = req.body;
        const authHeader = req.headers['authorization'];
        const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
        await auth_service_1.authService.logout(req.user.userId, token || '', accessToken);
        (0, response_1.successResponse)(res, null, 'Logged out successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.logout = logout;
const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        await auth_service_1.authService.forgotPassword(email);
        (0, response_1.successResponse)(res, null, 'If an account exists with this email, a password reset OTP has been sent');
    }
    catch (error) {
        next(error);
    }
};
exports.forgotPassword = forgotPassword;
const resetPassword = async (req, res, next) => {
    try {
        const { userId, otp, newPassword } = req.body;
        await auth_service_1.authService.resetPassword(userId, otp, newPassword);
        (0, response_1.successResponse)(res, null, 'Password reset successful. Please login with your new password.');
    }
    catch (error) {
        next(error);
    }
};
exports.resetPassword = resetPassword;
const verifyOTP = async (req, res, next) => {
    try {
        const { userId, otp, type = 'password_reset' } = req.body;
        const isValid = await auth_service_1.authService.verifyOTP(userId, otp, type);
        if (!isValid) {
            (0, response_1.errorResponse)(res, 'Invalid or expired OTP', 400);
            return;
        }
        (0, response_1.successResponse)(res, { verified: true }, 'OTP verified successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.verifyOTP = verifyOTP;
const getMe = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new error_middleware_1.UnauthorizedError('Authentication required');
        }
        const user = await auth_service_1.authService.getUserById(req.user.userId);
        (0, response_1.successResponse)(res, user, 'User profile retrieved');
    }
    catch (error) {
        next(error);
    }
};
exports.getMe = getMe;
const changePassword = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new error_middleware_1.UnauthorizedError('Authentication required');
        }
        const { currentPassword, newPassword } = req.body;
        const result = await (0, database_1.query)('SELECT id, password_hash FROM users WHERE id = $1', [req.user.userId]);
        const user = result.rows[0];
        if (!user) {
            throw new error_middleware_1.CustomError('User not found', 404);
        }
        const isValid = await (0, encryption_1.comparePassword)(currentPassword, user.password_hash);
        if (!isValid) {
            (0, response_1.errorResponse)(res, 'Current password is incorrect', 400);
            return;
        }
        const newHash = await (0, encryption_1.hashPassword)(newPassword);
        await (0, database_1.query)('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user.userId]);
        logger_1.default.info('Password changed', { userId: req.user.userId });
        (0, response_1.successResponse)(res, null, 'Password changed successfully');
    }
    catch (error) {
        next(error);
    }
};
exports.changePassword = changePassword;
//# sourceMappingURL=auth.controller.js.map