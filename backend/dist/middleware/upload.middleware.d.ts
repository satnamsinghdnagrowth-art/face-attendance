import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
export declare const uploadPhoto: multer.Multer;
export declare const uploadFaceImage: multer.Multer;
export declare const uploadAttendanceImage: multer.Multer;
export declare const uploadInMemory: multer.Multer;
export declare const handleMulterError: (err: Error, _req: Request, res: Response, next: NextFunction) => void;
export declare const getFilePublicUrl: (filename: string, subfolder: string) => string;
//# sourceMappingURL=upload.middleware.d.ts.map