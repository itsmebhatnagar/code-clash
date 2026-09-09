import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import contestRoutes from './routes/contest';
import leaderboardRoutes from './routes/leaderboard';
import { setupSockets } from './sockets';

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contest', contestRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Code Clash Backend is running' });
});

// Real-time socket connections for Judge-Authoritative Clock
setupSockets(io);

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Code Clash Backend is running on port ${PORT}`);
});
