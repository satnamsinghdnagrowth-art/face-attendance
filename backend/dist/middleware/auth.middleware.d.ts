import { Response, NextFunction } from 'express';
import { AuthRequest, JWTPayload } from '../types';
export declare const authenticateToken: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const optionalAuthenticateToken: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const generateAccessToken: (payload: JWTPayload) => string;
export declare const generateRefreshToken: (userId: string) => string;
export declare const verifyRefreshToken: (token: string) => {
    userId: string;
};
export declare const blacklistToken: (token: string, expiresIn: number) => Promise<void>;
//# sourceMappingURL=auth.middleware.d.ts.map