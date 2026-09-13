import { Request, Response, NextFunction, RequestHandler } from 'express';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(windowMs: number, max: number): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${req.ip}:${req.baseUrl}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}