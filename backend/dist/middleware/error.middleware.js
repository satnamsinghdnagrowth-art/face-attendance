"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalErrorHandler = exports.notFoundHandler = exports.ConflictError = exports.ValidationError = exports.ForbiddenError = exports.UnauthorizedError = exports.NotFoundError = exports.CustomError = void 0;
const pg_1 = require("pg");
const multer_1 = __importDefault(require("multer"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const logger_1 = __importDefault(require("../utils/logger"));
const env_1 = __importDefault(require("../config/env"));
class CustomError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.CustomError = CustomError;
class NotFoundError extends CustomError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404);
    }
}
exports.NotFoundError = NotFoundError;
class UnauthorizedError extends CustomError {
    constructor(message = 'Unauthorized') {
        super(message, 401);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends CustomError {
    constructor(message = 'Forbidden') {
        super(message, 403);
    }
}
exports.ForbiddenError = ForbiddenError;
class ValidationError extends CustomError {
    constructor(message, fields) {
        super(message, 400);
        this.fields = fields;
    }
}
exports.ValidationError = ValidationError;
class ConflictError extends CustomError {
    constructor(message = 'Resource already exists') {
        super(message, 409);
    }
}
exports.ConflictError = ConflictError;
function handleDatabaseError(err) {
    switch (err.code) {
        case '23505':
            const match = err.detail?.match(/Key \((.+)\)=\((.+)\) already exists/);
            if (match) {
                return {
                    message: `${match[1]} '${match[2]}' already exists`,
                    statusCode: 409,
                };
            }
            return { message: 'A record with this value already exists', statusCode: 409 };
        case '23503':
            return { message: 'Referenced resource does not exist', statusCode: 400 };
        case '23502':
            return { message: `Required field '${err.column}' is missing`, statusCode: 400 };
        case '23514':
            return { message: 'Invalid value provided for field', statusCode: 400 };
        case '22P02':
            return { message: 'Invalid ID format', statusCode: 400 };
        case '42P01':
            return { message: 'Database configuration error', statusCode: 500 };
        case 'ECONNREFUSED':
        case '08006':
        case '08001':
            return { message: 'Database connection error', statusCode: 503 };
        default:
            return { message: 'A database error occurred', statusCode: 500 };
    }
}
const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
        data: null,
    });
};
exports.notFoundHandler = notFoundHandler;
const globalErrorHandler = (err, req, res, _next) => {
    let statusCode = 500;
    let message = 'Internal server error';
    let errors;
    const logContext = {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userId: req.user?.userId,
        error: err.message,
        stack: env_1.default.IS_PRODUCTION ? undefined : err.stack,
    };
    if (err instanceof pg_1.DatabaseError) {
        const dbError = handleDatabaseError(err);
        statusCode = dbError.statusCode;
        message = dbError.message;
        if (statusCode >= 500) {
            logger_1.default.error('Database error', { ...logContext, code: err.code });
        }
        else {
            logger_1.default.warn('Database constraint error', { ...logContext, code: err.code });
        }
    }
    else if (err instanceof jsonwebtoken_1.default.TokenExpiredError) {
        statusCode = 401;
        message = 'Token has expired';
        logger_1.default.warn('Expired token', logContext);
    }
    else if (err instanceof jsonwebtoken_1.default.JsonWebTokenError) {
        statusCode = 401;
        message = 'Invalid token';
        logger_1.default.warn('Invalid token', logContext);
    }
    else if (err instanceof multer_1.default.MulterError) {
        statusCode = 400;
        switch (err.code) {
            case 'LIMIT_FILE_SIZE':
                message = 'File size exceeds the maximum allowed limit';
                break;
            case 'LIMIT_FILE_COUNT':
                message = 'Too many files uploaded';
                break;
            case 'LIMIT_UNEXPECTED_FILE':
                message = `Unexpected file field: ${err.field}`;
                break;
            default:
                message = 'File upload error';
        }
        logger_1.default.warn('Multer error', { ...logContext, multerCode: err.code });
    }
    else if (err instanceof CustomError) {
        statusCode = err.statusCode;
        message = err.message;
        if (err instanceof ValidationError && err.fields) {
            errors = err.fields;
        }
        if (statusCode >= 500) {
            logger_1.default.error('Application error', logContext);
        }
        else {
            logger_1.default.warn('Client error', logContext);
        }
    }
    else if (err && typeof err.statusCode === 'number') {
        statusCode = err.statusCode;
        message = err.message;
        logger_1.default.warn('Known error', logContext);
    }
    else {
        logger_1.default.error('Unhandled error', logContext);
    }
    if (env_1.default.IS_PRODUCTION && statusCode === 500) {
        message = 'Internal server error';
        errors = undefined;
    }
    const response = {
        success: false,
        message,
        data: null,
    };
    if (errors) {
        response['errors'] = errors;
    }
    if (!env_1.default.IS_PRODUCTION && err.stack) {
        response['stack'] = err.stack;
    }
    res.status(statusCode).json(response);
};
exports.globalErrorHandler = globalErrorHandler;
//# sourceMappingURL=error.middleware.js.map