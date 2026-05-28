"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const database_1 = require("../config/database");
const redis_1 = require("../config/redis");
const encryption_1 = require("../utils/encryption");
const auth_middleware_1 = require("../middleware/auth.middleware");
const error_middleware_1 = require("../middleware/error.middleware");
const logger_1 = __importDefault(require("../utils/logger"));
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;
const OTP_TTL = 5 * 60;
const ACCESS_TOKEN_TTL = 15 * 60;
const toPublicUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    photo_url: user.photo_url,
    is_active: user.is_active,
    last_login: user.last_login,
    created_at: user.created_at,
});
class AuthService {
    async login(email, password) {
        const result = await (0, database_1.query)('SELECT * FROM users WHERE email = $1 AND is_active = true', [email.toLowerCase()]);
        const user = result.rows[0];
        if (!user) {
            throw new error_middleware_1.UnauthorizedError('Invalid email or password');
        }
        const passwordValid = await (0, encryption_1.comparePassword)(password, user.password_hash || '');
        if (!passwordValid) {
            throw new error_middleware_1.UnauthorizedError('Invalid email or password');
        }
        await (0, database_1.query)('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
        const payload = { userId: user.id, role: user.role, email: user.email };
        const accessToken = (0, auth_middleware_1.generateAccessToken)(payload);
        const refreshToken = (0, auth_middleware_1.generateRefreshToken)(user.id);
        const tokenHash = (0, encryption_1.hashToken)(refreshToken);
        await (0, database_1.query)(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`, [user.id, tokenHash]);
        await redis_1.redisClient.setex(`session:${user.id}`, REFRESH_TOKEN_TTL, JSON.stringify({ userId: user.id, role: user.role, email: user.email }));
        logger_1.default.info('User logged in', { userId: user.id, email: user.email });
        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            user: toPublicUser({ ...user, last_login: new Date() }),
        };
    }
    async register(userData) {
        const existing = await (0, database_1.query)('SELECT id FROM users WHERE email = $1', [userData.email.toLowerCase()]);
        if (existing.rows.length > 0) {
            throw new error_middleware_1.ConflictError('A user with this email already exists');
        }
        const passwordHash = await (0, encryption_1.hashPassword)(userData.password);
        const result = await (0, database_1.query)(`INSERT INTO users (name, email, password_hash, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`, [userData.name, userData.email.toLowerCase(), passwordHash, userData.phone, userData.role]);
        const newUser = result.rows[0];
        if (!newUser) {
            throw new error_middleware_1.CustomError('Failed to create user', 500);
        }
        logger_1.default.info('New user registered', { userId: newUser.id, email: newUser.email, role: newUser.role });
        return toPublicUser(newUser);
    }
    async refreshToken(token) {
        let decoded;
        try {
            decoded = (0, auth_middleware_1.verifyRefreshToken)(token);
        }
        catch {
            throw new error_middleware_1.UnauthorizedError('Invalid or expired refresh token');
        }
        const tokenHash = (0, encryption_1.hashToken)(token);
        const result = await (0, database_1.query)(`SELECT id, expires_at FROM refresh_tokens
       WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()`, [decoded.userId, tokenHash]);
        if (result.rows.length === 0) {
            throw new error_middleware_1.UnauthorizedError('Refresh token not found or expired');
        }
        const userResult = await (0, database_1.query)('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.userId]);
        const user = userResult.rows[0];
        if (!user) {
            throw new error_middleware_1.UnauthorizedError('User not found or inactive');
        }
        await (0, database_1.query)('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
        const payload = { userId: user.id, role: user.role, email: user.email };
        const newAccessToken = (0, auth_middleware_1.generateAccessToken)(payload);
        const newRefreshToken = (0, auth_middleware_1.generateRefreshToken)(user.id);
        const newTokenHash = (0, encryption_1.hashToken)(newRefreshToken);
        await (0, database_1.query)(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`, [user.id, newTokenHash]);
        logger_1.default.info('Token refreshed', { userId: user.id });
        return { access_token: newAccessToken, refresh_token: newRefreshToken };
    }
    async logout(userId, refreshToken, accessToken) {
        if (refreshToken) {
            const tokenHash = (0, encryption_1.hashToken)(refreshToken);
            await (0, database_1.query)('DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2', [userId, tokenHash]);
        }
        else {
            await (0, database_1.query)('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
        }
        await redis_1.redisClient.del(`session:${userId}`);
        if (accessToken) {
            await (0, auth_middleware_1.blacklistToken)(accessToken, ACCESS_TOKEN_TTL);
        }
        logger_1.default.info('User logged out', { userId });
    }
    async logoutAll(userId) {
        await (0, database_1.query)('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
        await redis_1.redisClient.del(`session:${userId}`);
        logger_1.default.info('User logged out from all devices', { userId });
    }
    async forgotPassword(email) {
        const result = await (0, database_1.query)('SELECT id, email, name FROM users WHERE email = $1 AND is_active = true', [email.toLowerCase()]);
        const user = result.rows[0];
        if (!user) {
            logger_1.default.info('Password reset requested for non-existent email', { email });
            return;
        }
        const otp = await this.generateOTP(user.id, 'password_reset');
        logger_1.default.info('Password reset OTP generated', {
            userId: user.id,
            email: user.email,
            otp,
        });
    }
    async resetPassword(userId, otp, newPassword) {
        const isValid = await this.verifyOTP(userId, otp, 'password_reset');
        if (!isValid) {
            throw new error_middleware_1.CustomError('Invalid or expired OTP', 400);
        }
        const passwordHash = await (0, encryption_1.hashPassword)(newPassword);
        await (0, database_1.withTransaction)(async (client) => {
            await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, userId]);
            await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
            await client.query(`UPDATE otp_codes SET used = true
         WHERE user_id = $1 AND type = 'password_reset' AND used = false`, [userId]);
        });
        await redis_1.redisClient.del(`session:${userId}`);
        logger_1.default.info('Password reset successful', { userId });
    }
    async generateOTP(userId, type = 'password_reset') {
        const otp = (0, encryption_1.generateSecureOTP)(6);
        const redisKey = `otp:${userId}:${type}`;
        await redis_1.redisClient.setex(redisKey, OTP_TTL, otp);
        await (0, database_1.query)(`INSERT INTO otp_codes (user_id, code, type, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`, [userId, otp, type]);
        return otp;
    }
    async verifyOTP(userId, otp, type = 'password_reset') {
        const redisKey = `otp:${userId}:${type}`;
        const storedOTP = await redis_1.redisClient.get(redisKey);
        if (storedOTP && storedOTP === otp) {
            await redis_1.redisClient.del(redisKey);
            return true;
        }
        const result = await (0, database_1.query)(`SELECT id FROM otp_codes
       WHERE user_id = $1 AND code = $2 AND type = $3
         AND expires_at > NOW() AND used = false
       ORDER BY created_at DESC
       LIMIT 1`, [userId, otp, type]);
        if (result.rows.length > 0) {
            await (0, database_1.query)('UPDATE otp_codes SET used = true WHERE id = $1', [result.rows[0].id]);
            return true;
        }
        return false;
    }
    async getUserById(userId) {
        const result = await (0, database_1.query)('SELECT * FROM users WHERE id = $1', [userId]);
        const user = result.rows[0];
        if (!user) {
            throw new error_middleware_1.NotFoundError('User');
        }
        return toPublicUser(user);
    }
    async findUserByEmail(email) {
        const result = await (0, database_1.query)('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        return result.rows[0] || null;
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
exports.default = exports.authService;
//# sourceMappingURL=auth.service.js.map