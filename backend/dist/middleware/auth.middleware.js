"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.blacklistToken = exports.verifyRefreshToken = exports.generateRefreshToken = exports.generateAccessToken = exports.optionalAuthenticateToken = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = __importDefault(require("../config/env"));
const response_1 = require("../utils/response");
const logger_1 = __importDefault(require("../utils/logger"));
const redis_1 = require("../config/redis");
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;
    if (!token) {
        (0, response_1.unauthorizedResponse)(res, 'Access token is required');
        return;
    }
    try {
        const isBlacklisted = await redis_1.redisClient.get(`blacklist:${token}`);
        if (isBlacklisted) {
            (0, response_1.unauthorizedResponse)(res, 'Token has been revoked');
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, env_1.default.JWT_ACCESS_SECRET);
        req.user = decoded;
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            (0, response_1.unauthorizedResponse)(res, 'Access token has expired. Please refresh your token.');
            return;
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            (0, response_1.unauthorizedResponse)(res, 'Invalid access token');
            return;
        }
        if (error instanceof jsonwebtoken_1.default.NotBeforeError) {
            (0, response_1.unauthorizedResponse)(res, 'Token not yet valid');
            return;
        }
        logger_1.default.error('Token verification error', {
            error: error instanceof Error ? error.message : String(error),
        });
        (0, response_1.unauthorizedResponse)(res, 'Token verification failed');
    }
};
exports.authenticateToken = authenticateToken;
const optionalAuthenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;
    if (!token) {
        next();
        return;
    }
    try {
        const isBlacklisted = await redis_1.redisClient.get(`blacklist:${token}`);
        if (!isBlacklisted) {
            const decoded = jsonwebtoken_1.default.verify(token, env_1.default.JWT_ACCESS_SECRET);
            req.user = decoded;
        }
    }
    catch {
    }
    next();
};
exports.optionalAuthenticateToken = optionalAuthenticateToken;
const generateAccessToken = (payload) => {
    return jsonwebtoken_1.default.sign({ userId: payload.userId, role: payload.role, email: payload.email }, env_1.default.JWT_ACCESS_SECRET, { expiresIn: env_1.default.JWT_ACCESS_EXPIRES_IN });
};
exports.generateAccessToken = generateAccessToken;
const generateRefreshToken = (userId) => {
    return jsonwebtoken_1.default.sign({ userId }, env_1.default.JWT_REFRESH_SECRET, { expiresIn: env_1.default.JWT_REFRESH_EXPIRES_IN });
};
exports.generateRefreshToken = generateRefreshToken;
const verifyRefreshToken = (token) => {
    return jsonwebtoken_1.default.verify(token, env_1.default.JWT_REFRESH_SECRET);
};
exports.verifyRefreshToken = verifyRefreshToken;
const blacklistToken = async (token, expiresIn) => {
    await redis_1.redisClient.setex(`blacklist:${token}`, expiresIn, '1');
};
exports.blacklistToken = blacklistToken;
//# sourceMappingURL=auth.middleware.js.map