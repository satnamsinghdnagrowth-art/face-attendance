import { Response, NextFunction, Request } from 'express';
import { AuthRequest } from '../types';
export declare const loginValidators: import("express-validator").ValidationChain[];
export declare const registerValidators: import("express-validator").ValidationChain[];
export declare const refreshTokenValidators: import("express-validator").ValidationChain[];
export declare const forgotPasswordValidators: import("express-validator").ValidationChain[];
export declare const resetPasswordValidators: import("express-validator").ValidationChain[];
export declare const verifyOTPValidators: import("express-validator").ValidationChain[];
export declare const login: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const register: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const refreshToken: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const logout: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const forgotPassword: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const resetPassword: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const verifyOTP: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getMe: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const changePassword: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=auth.controller.d.ts.map