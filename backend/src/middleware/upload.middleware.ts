import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import env from '../config/env';
import { errorResponse } from '../utils/response';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  if (ALLOWED_MIME_TYPES.includes(mimeType) && ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
  }
};

const createMemoryUpload = (maxSize: number) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize, files: 1 },
    fileFilter,
  });

export const uploadPhoto = createMemoryUpload(5 * 1024 * 1024);
export const uploadFaceImage = createMemoryUpload(5 * 1024 * 1024);
export const uploadAttendanceImage = createMemoryUpload(env.MAX_FILE_SIZE);
export const uploadInMemory = createMemoryUpload(env.MAX_FILE_SIZE);

export const handleMulterError = (
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        errorResponse(res, `File too large. Maximum size is ${env.MAX_FILE_SIZE / 1024 / 1024}MB`, 400);
        return;
      case 'LIMIT_FILE_COUNT':
        errorResponse(res, 'Too many files uploaded', 400);
        return;
      case 'LIMIT_UNEXPECTED_FILE':
        errorResponse(res, `Unexpected field: ${err.field}`, 400);
        return;
      default:
        errorResponse(res, `Upload error: ${err.message}`, 400);
        return;
    }
  }

  if (err.message.includes('Invalid file type')) {
    errorResponse(res, err.message, 400);
    return;
  }

  next(err);
};

export const getFilePublicUrl = (filename: string, subfolder: string): string => {
  return `/uploads/${subfolder}/${filename}`;
};
