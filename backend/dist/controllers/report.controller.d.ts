import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
export declare const getDailyReport: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getMonthlyReport: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getStudentReport: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getDefaulters: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getAnalyticsOverview: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const exportCSV: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=report.controller.d.ts.map