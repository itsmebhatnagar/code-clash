import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_code_clash_key_for_dev_only';

export const setupSockets = (io: Server) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      socket.data.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    console.log(`User connected: ${user.id} (${user.role})`);
    socket.join(user.role);

    socket.emit('SYNC_TIME', { serverTime: Date.now() });

    if (user.role === 'ADMIN') {
      
      socket.on('START_ROUND', async (data: { roundId: string }) => {
        try {
          const round = await prisma.round.update({
            where: { id: data.roundId },
            data: { status: 'ACTIVE', startTime: new Date() }
          });
          
          io.emit('ROUND_STATE_UPDATE', { 
            roundId: round.id, 
            status: 'ACTIVE', 
            startTime: round.startTime,
            duration: round.duration
          });
        } catch (error) {
          socket.emit('ERROR', { message: 'Failed to start round' });
        }
      });

      socket.on('PAUSE_ROUND', async (data: { roundId: string }) => {
        try {
          const round = await prisma.round.update({
            where: { id: data.roundId },
            data: { status: 'PAUSED' }
          });
          io.emit('ROUND_STATE_UPDATE', { roundId: round.id, status: 'PAUSED' });
        } catch (error) {
          socket.emit('ERROR', { message: 'Failed to pause round' });
        }
      });

      socket.on('END_ROUND', async (data: { roundId: string }) => {
        try {
          const round = await prisma.round.update({
            where: { id: data.roundId },
            data: { status: 'ENDED', endTime: new Date() }
          });
          io.emit('ROUND_STATE_UPDATE', { roundId: round.id, status: 'ENDED' });
          io.to('PARTICIPANT').emit('FORCE_SUBMIT', { roundId: round.id });
        } catch (error) {
          socket.emit('ERROR', { message: 'Failed to end round' });
        }
      });
    }

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${user.id}`);
    });
  });
};
