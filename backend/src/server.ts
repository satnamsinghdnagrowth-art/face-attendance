import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import env from './config/env';
import logger from './utils/logger';
import { checkDatabaseHealth, pool } from './config/database';
import { checkRedisHealth, redisClient } from './config/redis';
import { initializeSockets } from './sockets/attendance.socket';
import { setSocketIO } from './services/notification.service';
import cron from 'node-cron';

let server: http.Server;

const startServer = async (): Promise<void> => {
  // ─── Health Checks ──────────────────────────────────────────────────────
  logger.info('Checking service dependencies...');

  const dbOk = await checkDatabaseHealth();
  if (!dbOk) {
    logger.error('Database connection failed. Exiting.');
    process.exit(1);
  }

  const redisOk = await checkRedisHealth();
  if (!redisOk) {
    logger.warn('Redis connection failed. Some features (rate limiting, sessions) may be degraded.');
  }

  // ─── HTTP Server ────────────────────────────────────────────────────────
  server = http.createServer(app);

  // ─── Socket.IO ──────────────────────────────────────────────────────────
  const io = new SocketIOServer(server, {
    cors: {
      origin: env.FRONTEND_URL.split(',').map((o) => o.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    allowEIO3: true,
  });

  // Set Socket.IO instance in notification service
  setSocketIO(io);

  // Initialize socket event handlers
  initializeSockets(io);

  // ─── Cron Jobs ───────────────────────────────────────────────────────────
  // Clean up expired OTP codes and refresh tokens every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const { query } = await import('./config/database');
      await Promise.all([
        query('DELETE FROM otp_codes WHERE expires_at < NOW()'),
        query('DELETE FROM refresh_tokens WHERE expires_at < NOW()'),
      ]);
      logger.debug('Expired tokens cleaned up');
    } catch (error) {
      logger.error('Cron job failed: token cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Auto-cancel stale active sessions older than 4 hours
  cron.schedule('*/30 * * * *', async () => {
    try {
      const { query } = await import('./config/database');
      const result = await query(
        `UPDATE attendance_sessions
         SET status = 'cancelled', end_time = NOW()
         WHERE status = 'active'
           AND start_time < NOW() - INTERVAL '4 hours'
         RETURNING id`
      );
      if (result.rowCount && result.rowCount > 0) {
        logger.warn('Auto-cancelled stale sessions', { count: result.rowCount });
      }
    } catch (error) {
      logger.error('Cron job failed: stale session cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ─── Start Listening ────────────────────────────────────────────────────
  await new Promise<void>((resolve, reject) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Port ${env.PORT} in use — killing existing process and retrying...`);
        // Kill the process holding the port, then retry
        const { execSync } = require('child_process') as typeof import('child_process');
        try {
          execSync(`fuser -k ${env.PORT}/tcp 2>/dev/null || true`);
        } catch { /* ignore */ }
        setTimeout(() => {
          server.listen(env.PORT, () => resolve());
        }, 500);
      } else {
        reject(err);
      }
    });
    server.listen(env.PORT, () => {
      resolve();
    });
  });

  logger.info(`Server started`, {
    port: env.PORT,
    environment: env.NODE_ENV,
    pid: process.pid,
  });

  logger.info(`API available at http://localhost:${env.PORT}/api`);
  logger.info(`Health check at http://localhost:${env.PORT}/health`);
  logger.info(`Socket.IO available at ws://localhost:${env.PORT}`);
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          logger.error('Error closing HTTP server', { error: err.message });
          reject(err);
        } else {
          logger.info('HTTP server closed');
          resolve();
        }
      });
    });
  }

  // Close database pool
  try {
    await pool.end();
    logger.info('Database pool closed');
  } catch (error) {
    logger.error('Error closing database pool', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Close Redis connection
  try {
    await redisClient.quit();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error('Error closing Redis connection', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
};

// ─── Process Event Handlers ───────────────────────────────────────────────────
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  gracefulShutdown('uncaughtException').catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
startServer().catch((error: Error) => {
  logger.error('Failed to start server', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
