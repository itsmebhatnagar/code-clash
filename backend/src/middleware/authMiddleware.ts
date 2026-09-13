import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { connection as redis } from '../redis';

export interface AuthRequest extends Request {
  user?: { id: string; role?: string };
}

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not configured');
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'code-clash',
      audience: 'code-clash-frontend'
    });
    
    if (typeof decoded === 'string' || typeof decoded.id !== 'string') {
      res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
      return;
    }
    
    req.user = { id: decoded.id, role: typeof decoded.role === 'string' ? decoded.role : undefined };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Unauthorized: Token expired' });
    } else {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    return;
  }
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return;
  }

  try {
    const { prisma } = await import('../db');
    
    const isActive = await redis.get(`admin_active:${req.user.id}`);
    if (!isActive) {
      res.status(403).json({ error: 'Forbidden: Admin session expired or revoked' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
