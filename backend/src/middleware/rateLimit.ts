import { Request, Response, NextFunction, RequestHandler } from 'express';

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 20_000;
const CLEANUP_INTERVAL_MS = 60_000;

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

export function rateLimit(windowMs: number, max: number): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${req.ip}:${req.baseUrl}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= MAX_BUCKETS) {
        for (const [expiredKey, expiredBucket] of buckets) {
          if (expiredBucket.resetAt <= now) buckets.delete(expiredKey);
        }
        if (buckets.size >= MAX_BUCKETS) {
          const oldestKey = buckets.keys().next().value;
          if (oldestKey) buckets.delete(oldestKey);
        }
      }
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}