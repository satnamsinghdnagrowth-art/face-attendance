import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
export declare const startSessionValidators: import("express-validator").ValidationChain[];
export declare const markAttendanceValidators: import("express-validator").ValidationChain[];
export declare const scanAttendanceValidators: import("express-validator").ValidationChain[];
export declare const updateAttendanceValidators: import("express-validator").ValidationChain[];
export declare const startSession: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const endSession: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getSession: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getActiveSessions: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getTeacherSessions: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const markAttendance: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const scanAttendance: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getAttendanceHistory: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getClassAttendance: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const updateAttendance: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getStudentSummary: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=attendance.controller.d.ts.map