import { Response, NextFunction } from 'express';
import { AuthRequest, UserRole } from '../types';
export declare const requireRole: (...roles: UserRole[]) => (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const requireAdmin: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const requireTeacher: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const requireSuperAdmin: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const requireStudent: (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const requireSelf: (userIdExtractor: (req: AuthRequest) => string) => (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const requireSelfOrAdmin: (userIdParam?: string) => (req: AuthRequest, res: Response, next: NextFunction) => void;
//# sourceMappingURL=role.middleware.d.ts.map