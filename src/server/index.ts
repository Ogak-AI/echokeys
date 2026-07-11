import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { getDb } from './db/index.js';
import { setupWebSocket } from './websocket/index.js';
import { startScheduledJobs } from './services/scheduledJobs.js';
import authRoutes from './routes/auth.js';
import challengeRoutes from './routes/challenges.js';
import scoreRoutes from './routes/scores.js';
import leaderboardRoutes from './routes/leaderboard.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

// Initialize database
getDb();

// Express app
const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create HTTP server for Express + Socket.io
const server = createServer(app);

// WebSocket
setupWebSocket(server);

// Scheduled jobs
startScheduledJobs();

server.listen(PORT, () => {
  console.log(`\n⚡ Echokeys server running on http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/health`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws\n`);
});
