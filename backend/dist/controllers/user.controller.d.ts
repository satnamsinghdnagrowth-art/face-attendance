import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
export declare const listUsersValidators: import("express-validator").ValidationChain[];
export declare const updateUserValidators: import("express-validator").ValidationChain[];
export declare const listUsers: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getUserById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const updateUser: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const deleteUser: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const uploadUserPhoto: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getStudentAttendanceSummary: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const activateUser: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=user.controller.d.ts.map