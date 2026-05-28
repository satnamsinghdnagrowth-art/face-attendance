import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
export declare const createClassValidators: import("express-validator").ValidationChain[];
export declare const createSubjectValidators: import("express-validator").ValidationChain[];
export declare const enrollStudentValidators: import("express-validator").ValidationChain[];
export declare const listClasses: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getClassById: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const createClass: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const updateClass: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const deleteClass: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getClassSubjects: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const createSubject: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const updateSubject: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const deleteSubject: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getClassStudents: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const enrollStudent: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const removeStudent: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=class.controller.d.ts.map