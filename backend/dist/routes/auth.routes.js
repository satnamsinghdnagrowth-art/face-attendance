"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const env_1 = __importDefault(require("../config/env"));
const router = (0, express_1.Router)();
const authRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: env_1.default.RATE_LIMIT_WINDOW_MS,
    max: env_1.default.AUTH_RATE_LIMIT_MAX,
    message: { success: false, message: 'Too many auth attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
router.post('/login', authRateLimiter, auth_controller_1.loginValidators, validate_middleware_1.validate, auth_controller_1.login);
router.post('/refresh-token', auth_controller_1.refreshTokenValidators, validate_middleware_1.validate, auth_controller_1.refreshToken);
router.post('/forgot-password', authRateLimiter, auth_controller_1.forgotPasswordValidators, validate_middleware_1.validate, auth_controller_1.forgotPassword);
router.post('/reset-password', authRateLimiter, auth_controller_1.resetPasswordValidators, validate_middleware_1.validate, auth_controller_1.resetPassword);
router.post('/verify-otp', authRateLimiter, auth_controller_1.verifyOTPValidators, validate_middleware_1.validate, auth_controller_1.verifyOTP);
router.post('/register', auth_middleware_1.authenticateToken, auth_controller_1.registerValidators, validate_middleware_1.validate, auth_controller_1.register);
router.post('/logout', auth_middleware_1.authenticateToken, auth_controller_1.logout);
router.get('/me', auth_middleware_1.authenticateToken, auth_controller_1.getMe);
router.post('/change-password', auth_middleware_1.authenticateToken, [
    (0, express_validator_1.body)('currentPassword').notEmpty().withMessage('Current password is required'),
    (0, express_validator_1.body)('newPassword')
        .isLength({ min: 8 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('New password must be at least 8 characters with mixed case and numbers'),
], validate_middleware_1.validate, auth_controller_1.changePassword);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map