import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = isProduction ? configuredOrigins : [...configuredOrigins, 'http://localhost:3000'];

if (isProduction && allowedOrigins.length === 0) {
  throw new Error('FRONTEND_URL is not configured');
}

const corsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
});

import createAuthRouter from './routes/auth';
import createAdminRouter from './routes/admin';
import createContestRouter from './routes/contest';
import leaderboardRoutes from './routes/leaderboard';
import { setupSockets } from './sockets';
import { errorMiddleware } from './middleware/errorMiddleware';

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/auth', createAuthRouter(io));
app.use('/api/admin', createAdminRouter(io));
app.use('/api/contest', createContestRouter(io));
app.use('/api/leaderboard', leaderboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Code Clash Backend is running' });
});

// Real-time socket connections for Judge-Authoritative Clock
setupSockets(io);

app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Code Clash Backend is running on port ${PORT}`);
});
