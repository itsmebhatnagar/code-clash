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

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');

export default function createAuthRouter(io: Server) {
  const router = Router();

  router.post('/register', asyncHandler(async (req, res) => {
    const { name, email, password, college, collegeId, phone } = req.body;
    if (!name || !email || !password) throw new AppError(400, 'Name, email, and password are required');
    if (await prisma.user.findUnique({ where: { email } })) throw new AppError(400, 'User with this email already exists');

    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const user = await prisma.user.create({ data: { name, email, passwordHash, college, collegeId, phone, role: 'PARTICIPANT', status: 'REGISTERED' } });
    io.to('ADMIN').emit('PARTICIPANT_REGISTERED', { id: user.id, name: user.name, email: user.email, college: user.college, collegeId: user.collegeId, status: user.status, workstation: null });
    void getAdminMetrics().then((metrics) => io.to('ADMIN').emit('ADMIN_METRICS_UPDATE', metrics));
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET!, { expiresIn: '1d' });
    res.status(201).json({ message: 'Registration successful', token, user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status } });
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError(400, 'Email and password are required');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new AppError(401, 'Invalid credentials');
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET!, { expiresIn: '1d' });
    if (user.role === 'ADMIN') await recordAuditLog(user.id, 'ADMIN_LOGIN', `Admin ${user.email} logged in successfully`);
    res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status } });
  }));

  router.get('/me', authenticate, asyncHandler(async (req: any, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true, role: true, status: true, college: true, collegeId: true } });
    if (!user) throw new AppError(404, 'User not found');
    res.json({ user });
  }));

  return router;
}
