import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import env from './config/env';
import logger from './utils/logger';
import { checkDatabaseHealth, pool } from './config/database';
import { checkRedisHealth, disconnectRedis } from './config/redis';
import { initializeSockets } from './sockets/attendance.socket';
import { setSocketIO } from './services/notification.service';
import cron from 'node-cron';

let server: http.Server;

const startServer = async (): Promise<void> => {
  // ─── HTTP Server ────────────────────────────────────────────────────────
  // Bind the port FIRST so Render's port scanner succeeds immediately.
  // Health checks run in the background after the server is listening.
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

  // ─── 90-day verification image cleanup (Phase 2 — GDPR compliance) ────────
  // Runs daily at 2:00 AM. Nullifies image URLs for events older than 90 days.
  // Keeps the audit record intact but removes personally identifiable images.
  cron.schedule('0 2 * * *', async () => {
    try {
      const { query: dbQuery } = await import('./config/database');
      const result = await dbQuery(
        `UPDATE verification_events
         SET face_image_url = NULL,
             id_card_image_url = NULL
         WHERE scanned_at < NOW() - INTERVAL '90 days'
           AND (face_image_url IS NOT NULL OR id_card_image_url IS NOT NULL)
         RETURNING id`,
        []
      );
      if (result.rowCount && result.rowCount > 0) {
        logger.info('Image retention cleanup complete', {
          purged: result.rowCount,
          policy: '90 days',
        });
      }
    } catch (error) {
      logger.error('Cron job failed: image retention cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ─── Auto-end stale exam sessions older than 6 hours ─────────────────────
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { query: dbQuery } = await import('./config/database');
      const result = await dbQuery(
        `UPDATE exam_sessions
         SET status = 'aborted', ended_at = NOW()
         WHERE status = 'active'
           AND started_at < NOW() - INTERVAL '6 hours'
         RETURNING id`,
        []
      );
      if (result.rowCount && result.rowCount > 0) {
        logger.warn('Auto-aborted stale exam sessions', { count: result.rowCount });
      }
    } catch (error) {
      logger.error('Cron job failed: stale exam session cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ─── Start Listening ────────────────────────────────────────────────────
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Bind to 0.0.0.0 so Render (and Docker) can reach the port externally.
    server.listen(env.PORT, '0.0.0.0', () => resolve());
  });

  logger.info('Server listening', { port: env.PORT, env: env.NODE_ENV, pid: process.pid });
  logger.info(`API:    http://0.0.0.0:${env.PORT}/api`);
  logger.info(`Health: http://0.0.0.0:${env.PORT}/health`);

  // ─── Background dependency checks ───────────────────────────────────────
  // Run AFTER the port is bound — never block the listen step.
  checkDatabaseHealth().then((ok) => {
    if (!ok) {
      logger.error('Database unreachable after server start — exiting.');
      gracefulShutdown('DB_UNAVAILABLE').catch(() => process.exit(1));
    }
  });

  checkRedisHealth().then((ok) => {
    if (!ok) logger.warn('Redis unavailable — session cache and blacklist disabled.');
  });
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

  // Close Redis (disconnectRedis handles already-closed / unavailable states safely)
  try {
    await disconnectRedis();
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
