import { Request, Response, NextFunction } from 'express';
import { DatabaseError } from 'pg';
import multer from 'multer';
import jwt from 'jsonwebtoken';
interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
    code?: string;
}
export declare class CustomError extends Error implements AppError {
    statusCode: number;
    isOperational: boolean;
    constructor(message: string, statusCode?: number, isOperational?: boolean);
}
export declare class NotFoundError extends CustomError {
    constructor(resource?: string);
}
export declare class UnauthorizedError extends CustomError {
    constructor(message?: string);
}
export declare class ForbiddenError extends CustomError {
    constructor(message?: string);
}
export declare class ValidationError extends CustomError {
    fields?: Record<string, string>;
    constructor(message: string, fields?: Record<string, string>);
}
export declare class ConflictError extends CustomError {
    constructor(message?: string);
}
export declare const notFoundHandler: (req: Request, res: Response) => void;
export declare const globalErrorHandler: (err: AppError | DatabaseError | jwt.JsonWebTokenError | multer.MulterError, req: Request, res: Response, _next: NextFunction) => void;
export {};
//# sourceMappingURL=error.middleware.d.ts.map