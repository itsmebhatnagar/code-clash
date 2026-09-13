import { Router } from 'express';
import { Server } from 'socket.io';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { authenticate } from '../middleware/authMiddleware';
import { getAdminMetrics } from '../presence';
import { recordAuditLog } from '../audit';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errorMiddleware';
import { connection as redis } from '../redis';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');

export async function logAuthEvent(userId: string, action: string, req: any) {
  try {
    await prisma.authLog.create({
      data: {
        userId,
        action,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    });
  } catch (err) {
    console.error('Failed to log auth event', err);
  }
}

async function issueTokens(user: { id: string; role: string }) {
  const token = jwt.sign(
    { id: user.id, role: user.role }, 
    JWT_SECRET!, 
    { expiresIn: '15m', issuer: 'code-clash', audience: 'code-clash-frontend' }
  );

  const refreshToken = crypto.randomBytes(40).toString('hex');
  await redis.set(`session:${user.id}:${refreshToken}`, user.role, 'EX', 7 * 24 * 60 * 60);

  if (user.role === 'ADMIN') {
    await redis.set(`admin_active:${user.id}`, 'true', 'EX', 7 * 24 * 60 * 60);
  }

  return { token, refreshToken };
}

export default function createAuthRouter(io: Server) {
  const router = Router();

  router.post('/register', asyncHandler(async (req: any, res) => {
    const { name, email, password, college, collegeId, phone } = req.body;
    if (!name || !email || !password) throw new AppError(400, 'Name, email, and password are required');
    if (await prisma.user.findUnique({ where: { email } })) throw new AppError(400, 'User with this email already exists');

    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const user = await prisma.user.create({ data: { name, email, passwordHash, college, collegeId, phone, role: 'PARTICIPANT', status: 'REGISTERED' } });
    
    io.to('ADMIN').emit('PARTICIPANT_REGISTERED', { id: user.id, name: user.name, email: user.email, college: user.college, collegeId: user.collegeId, status: user.status, workstation: null });
    void getAdminMetrics().then((metrics) => io.to('ADMIN').emit('ADMIN_METRICS_UPDATE', metrics));
    
    const { token, refreshToken } = await issueTokens(user);
    await logAuthEvent(user.id, 'REGISTER', req);

    res.status(201).json({ message: 'Registration successful', token, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status } });
  }));

  router.post('/login', asyncHandler(async (req: any, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError(400, 'Email and password are required');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new AppError(401, 'Invalid credentials');
    
    const { token, refreshToken } = await issueTokens(user);

    if (user.role === 'ADMIN') await recordAuditLog(user.id, 'ADMIN_LOGIN', `Admin ${user.email} logged in successfully`);
    await logAuthEvent(user.id, 'LOGIN', req);

    res.json({ message: 'Login successful', token, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status } });
  }));

  router.post('/refresh', asyncHandler(async (req: any, res) => {
    const { refreshToken, userId } = req.body;
    if (!refreshToken || !userId) throw new AppError(400, 'refreshToken and userId are required');

    const sessionKey = `session:${userId}:${refreshToken}`;
    const role = await redis.get(sessionKey);
    if (!role) {
      await logAuthEvent(userId, 'REFRESH_FAILED', req);
      throw new AppError(401, 'Invalid or expired refresh token');
    }

    await redis.del(sessionKey);

    const { token: newToken, refreshToken: newRefreshToken } = await issueTokens({ id: userId, role });
    await logAuthEvent(userId, 'REFRESH', req);

    res.json({ token: newToken, refreshToken: newRefreshToken });
  }));

  router.post('/logout', authenticate, asyncHandler(async (req: any, res) => {
    const { refreshToken } = req.body;
    const userId = req.user.id;
    
    if (refreshToken) {
      await redis.del(`session:${userId}:${refreshToken}`);
    }
    
    if (req.user.role === 'ADMIN') {
      await redis.del(`admin_active:${userId}`);
    }

    await logAuthEvent(userId, 'LOGOUT', req);
    res.json({ message: 'Logged out successfully' });
  }));

  router.get('/me', authenticate, asyncHandler(async (req: any, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true, role: true, status: true, college: true, collegeId: true } });
    if (!user) throw new AppError(404, 'User not found');
    res.json({ user });
  }));

  return router;
}
