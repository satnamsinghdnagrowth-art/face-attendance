import { Response, NextFunction } from 'express';
import { AuthRequest, UserRole } from '../types';
import { forbiddenResponse, unauthorizedResponse } from '../utils/response';

export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      unauthorizedResponse(res, 'Authentication required');
      return;
    }

    if (!roles.includes(req.user.role)) {
      forbiddenResponse(
        res,
        `Access denied. Required roles: ${roles.join(', ')}. Your role: ${req.user.role}`
      );
      return;
    }

    next();
  };
};

export const requireAdmin = requireRole('admin', 'super_admin');

export const requireTeacher = requireRole('teacher', 'admin', 'super_admin');

export const requireSuperAdmin = requireRole('super_admin');

export const requireStudent = requireRole('student');

export const requireSelf = (userIdExtractor: (req: AuthRequest) => string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      unauthorizedResponse(res, 'Authentication required');
      return;
    }

    const targetUserId = userIdExtractor(req);
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isSelf = req.user.userId === targetUserId;

    if (!isAdmin && !isSelf) {
      forbiddenResponse(res, 'You can only access your own resources');
      return;
    }

    next();
  };
};

export const requireSelfOrAdmin = (userIdParam: string = 'id') => {
  return requireSelf((req) => req.params[userIdParam] || '');
};
