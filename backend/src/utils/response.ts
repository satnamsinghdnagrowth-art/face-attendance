import { Response } from 'express';
import { ApiResponse, ValidationError } from '../types';

export const successResponse = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
): Response => {
  const response: ApiResponse<T> = {
    success: true,
    message: message || 'Success',
    data,
  };
  return res.status(statusCode).json(response);
};

export const createdResponse = <T>(
  res: Response,
  data: T,
  message: string = 'Created successfully'
): Response => {
  return successResponse(res, data, message, 201);
};

export const noContentResponse = (res: Response): Response => {
  return res.status(204).send();
};

export const errorResponse = (
  res: Response,
  message: string,
  statusCode: number = 400,
  errors?: ValidationError[]
): Response => {
  const response: ApiResponse<null> = {
    success: false,
    message,
    data: null,
    ...(errors && errors.length > 0 && { errors }),
  };
  return res.status(statusCode).json(response);
};

export const unauthorizedResponse = (
  res: Response,
  message: string = 'Unauthorized'
): Response => {
  return errorResponse(res, message, 401);
};

export const forbiddenResponse = (
  res: Response,
  message: string = 'Forbidden: insufficient permissions'
): Response => {
  return errorResponse(res, message, 403);
};

export const notFoundResponse = (
  res: Response,
  message: string = 'Resource not found'
): Response => {
  return errorResponse(res, message, 404);
};

export const conflictResponse = (
  res: Response,
  message: string = 'Resource already exists'
): Response => {
  return errorResponse(res, message, 409);
};

export const serverErrorResponse = (
  res: Response,
  message: string = 'Internal server error'
): Response => {
  return errorResponse(res, message, 500);
};

export const paginatedResponse = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  message: string = 'Success'
): Response => {
  const totalPages = Math.ceil(total / limit);
  const response: ApiResponse<T[]> = {
    success: true,
    message,
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
  return res.status(200).json(response);
};

export const getPaginationParams = (
  query: Record<string, unknown>
): { page: number; limit: number; offset: number } => {
  const page = Math.max(1, parseInt(String(query['page'] || '1'), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query['limit'] || '20'), 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};
