import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import env from '../config/env';
import { errorResponse } from '../utils/response';
import logger from '../utils/logger';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const ensureDir = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`Created upload directory: ${dirPath}`);
  }
};

const getUploadBase = (): string => {
  return path.isAbsolute(env.UPLOAD_DIR)
    ? env.UPLOAD_DIR
    : path.join(process.cwd(), env.UPLOAD_DIR);
};

const createStorage = (subfolder: string): multer.StorageEngine => {
  return multer.diskStorage({
    destination: (_req: Request, _file: Express.Multer.File, cb) => {
      const uploadPath = path.join(getUploadBase(), subfolder);
      ensureDir(uploadPath);
      cb(null, uploadPath);
    },
    filename: (_req: Request, file: Express.Multer.File, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const filename = `${uuidv4()}${ext}`;
      cb(null, filename);
    },
  });
};

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  if (ALLOWED_MIME_TYPES.includes(mimeType) && ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
  }
};

// Profile photo upload (to uploads/photos/)
export const uploadPhoto = multer({
  storage: createStorage('photos'),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
  fileFilter,
});

// Face image upload (to uploads/faces/)
export const uploadFaceImage = multer({
  storage: createStorage('faces'),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
  fileFilter,
});

// Attendance image upload (to uploads/attendance/)
export const uploadAttendanceImage = multer({
  storage: createStorage('attendance'),
  limits: {
    fileSize: env.MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter,
});

// Memory storage for processing before saving
export const uploadInMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter,
});

// Error handler middleware for multer errors
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
