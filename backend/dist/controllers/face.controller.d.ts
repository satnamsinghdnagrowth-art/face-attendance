import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
export declare const registerFaceValidators: import("express-validator").ValidationChain[];
export declare const verifyFaceValidators: import("express-validator").ValidationChain[];
export declare const registerFace: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const verifyFace: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const deleteUserFace: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getFaceStatus: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const livenessCheck: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const recomputeEmbeddings: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=face.controller.d.ts.map