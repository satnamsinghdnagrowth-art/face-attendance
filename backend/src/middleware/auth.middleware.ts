import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, JWTPayload } from '../types';
import env from '../config/env';
import { unauthorizedResponse } from '../utils/response';
import logger from '../utils/logger';
import { safeGet, safeSetex } from '../config/redis';

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    unauthorizedResponse(res, 'Access token is required');
    return;
  }

  try {
    // safeGet returns null when Redis is unavailable — blacklist check is skipped gracefully.
    const isBlacklisted = await safeGet(`blacklist:${token}`);
    if (isBlacklisted) {
      unauthorizedResponse(res, 'Token has been revoked');
      return;
    }

    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JWTPayload;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      unauthorizedResponse(res, 'Access token has expired. Please refresh your token.');
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      unauthorizedResponse(res, 'Invalid access token');
      return;
    }
    if (error instanceof jwt.NotBeforeError) {
      unauthorizedResponse(res, 'Token not yet valid');
      return;
    }
    logger.error('Token verification error', {
      error: error instanceof Error ? error.message : String(error),
    });
    unauthorizedResponse(res, 'Token verification failed');
  }
};

export const optionalAuthenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    next();
    return;
  }

  try {
    const isBlacklisted = await safeGet(`blacklist:${token}`);
    if (!isBlacklisted) {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JWTPayload;
      req.user = decoded;
    }
  } catch {
    // Ignore — optional auth never blocks the request
  }

  next();
};

export const generateAccessToken = (payload: JWTPayload): string => {
  return jwt.sign(
    { userId: payload.userId, role: payload.role, email: payload.email },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions
  );
};

export const generateRefreshToken = (userId: string): string => {
  return jwt.sign(
    { userId },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions
  );
};

export const verifyRefreshToken = (token: string): { userId: string } => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { userId: string };
};

// safeSetex never throws — blacklisting is best-effort when Redis is degraded.
export const blacklistToken = async (token: string, expiresIn: number): Promise<void> => {
  await safeSetex(`blacklist:${token}`, expiresIn, '1');
};
