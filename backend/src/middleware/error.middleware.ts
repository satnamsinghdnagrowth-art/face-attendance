import { Request, Response, NextFunction } from 'express';
import { DatabaseError } from 'pg';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import env from '../config/env';

interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: string;
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends CustomError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

export class UnauthorizedError extends CustomError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends CustomError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

export class ValidationError extends CustomError {
  public fields?: Record<string, string>;

  constructor(message: string, fields?: Record<string, string>) {
    super(message, 400);
    this.fields = fields;
  }
}

export class ConflictError extends CustomError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409);
  }
}

function handleDatabaseError(err: DatabaseError): { message: string; statusCode: number } {
  switch (err.code) {
    case '23505': // unique_violation
      const match = err.detail?.match(/Key \((.+)\)=\((.+)\) already exists/);
      if (match) {
        return {
          message: `${match[1]} '${match[2]}' already exists`,
          statusCode: 409,
        };
      }
      return { message: 'A record with this value already exists', statusCode: 409 };

    case '23503': // foreign_key_violation
      return { message: 'Referenced resource does not exist', statusCode: 400 };

    case '23502': // not_null_violation
      return { message: `Required field '${err.column}' is missing`, statusCode: 400 };

    case '23514': // check_violation
      return { message: 'Invalid value provided for field', statusCode: 400 };

    case '22P02': // invalid_text_representation (e.g., invalid UUID)
      return { message: 'Invalid ID format', statusCode: 400 };

    case '42P01': // undefined_table
      return { message: 'Database configuration error', statusCode: 500 };

    case 'ECONNREFUSED':
    case '08006': // connection_failure
    case '08001': // sqlclient_unable_to_establish_sqlconnection
      return { message: 'Database connection error', statusCode: 503 };

    default:
      return { message: 'A database error occurred', statusCode: 500 };
  }
}

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    data: null,
  });
};

export const globalErrorHandler = (
  err: AppError | DatabaseError | jwt.JsonWebTokenError | multer.MulterError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal server error';
  let errors: Record<string, string> | undefined;

  // Log the error
  const logContext = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: (req as Request & { user?: { userId: string } }).user?.userId,
    error: err.message,
    stack: env.IS_PRODUCTION ? undefined : err.stack,
  };

  // Handle specific error types
  if (err instanceof DatabaseError) {
    const dbError = handleDatabaseError(err);
    statusCode = dbError.statusCode;
    message = dbError.message;

    if (statusCode >= 500) {
      logger.error('Database error', { ...logContext, code: err.code });
    } else {
      logger.warn('Database constraint error', { ...logContext, code: err.code });
    }
  } else if (err instanceof jwt.TokenExpiredError) {
    statusCode = 401;
    message = 'Token has expired';
    logger.warn('Expired token', logContext);
  } else if (err instanceof jwt.JsonWebTokenError) {
    statusCode = 401;
    message = 'Invalid token';
    logger.warn('Invalid token', logContext);
  } else if (err instanceof multer.MulterError) {
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
    logger.warn('Multer error', { ...logContext, multerCode: err.code });
  } else if (err instanceof CustomError) {
    statusCode = err.statusCode;
    message = err.message;

    if (err instanceof ValidationError && err.fields) {
      errors = err.fields;
    }

    if (statusCode >= 500) {
      logger.error('Application error', logContext);
    } else {
      logger.warn('Client error', logContext);
    }
  } else if (err && typeof (err as AppError).statusCode === 'number') {
    statusCode = (err as AppError).statusCode!;
    message = err.message;
    logger.warn('Known error', logContext);
  } else {
    logger.error('Unhandled error', logContext);
  }

  // Never expose internal details in production
  if (env.IS_PRODUCTION && statusCode === 500) {
    message = 'Internal server error';
    errors = undefined;
  }

  const response: Record<string, unknown> = {
    success: false,
    message,
    data: null,
  };

  if (errors) {
    response['errors'] = errors;
  }

  if (!env.IS_PRODUCTION && err.stack) {
    response['stack'] = err.stack;
  }

  res.status(statusCode).json(response);
};
