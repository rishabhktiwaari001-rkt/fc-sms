import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthUser, Role } from '@fc-sms/types';

export interface AuthRequest extends Request {
  user?: AuthUser;
  storeId?: string;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
}

// Automatically injects storeId from JWT — staff can only see their own store
export function storeScope(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role === 'SUPER_ADMIN' && req.query.storeId) {
    req.storeId = req.query.storeId as string;
  } else {
    req.storeId = req.user?.storeId;
  }
  next();
}
