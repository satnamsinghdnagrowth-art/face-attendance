import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';
import env from './config/env';
import logger from './utils/logger';
import { storageService } from './services/storage.service';
import { globalErrorHandler, notFoundHandler } from './middleware/error.middleware';

// Route imports
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import faceRoutes from './routes/face.routes';
import attendanceRoutes from './routes/attendance.routes';
import classRoutes from './routes/class.routes';
import reportRoutes from './routes/report.routes';
import notificationRoutes from './routes/notification.routes';
import dashboardRoutes from './routes/dashboard.routes';

const createApp = (): Application => {
  const app = express();

  // ─── Trust Proxy (for rate limiting behind nginx/load balancer) ─────────
  app.set('trust proxy', 1);

  // ─── Security Headers ────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow static assets cross-origin
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    })
  );

  // ─── CORS ────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: (origin, callback) => {
        const allowedOrigins = env.FRONTEND_URL.split(',').map((o) => o.trim());

        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin || allowedOrigins.includes(origin) || env.IS_DEVELOPMENT) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: Origin ${origin} not allowed`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Limit'],
    })
  );

  // ─── General Rate Limiter ────────────────────────────────────────────────
  const generalRateLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    message: {
      success: false,
      message: 'Too many requests from this IP. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    },
  });
  app.use(generalRateLimiter);

  // ─── Body Parsers ────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ─── Request Logging ─────────────────────────────────────────────────────
  app.use((req, _res, next) => {
    logger.debug('Incoming request', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    next();
  });

  // ─── Static File Serving ─────────────────────────────────────────────────
  // Serve uploads directory at /uploads
  const uploadsPath = path.isAbsolute(env.UPLOAD_DIR)
    ? env.UPLOAD_DIR
    : path.join(__dirname, '..', env.UPLOAD_DIR.replace('./', ''));

  app.use(
    '/uploads',
    express.static(uploadsPath, {
      maxAge: '1d',
      etag: true,
      lastModified: true,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    })
  );

  // ─── Health Check ────────────────────────────────────────────────────────
  app.get('/health', async (req, res) => {
    const { checkDatabaseHealth } = await import('./config/database');
    const { checkRedisHealth } = await import('./config/redis');

    const [dbOk, redisOk] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);

    const status = dbOk && redisOk ? 'healthy' : 'degraded';
    const statusCode = dbOk && redisOk ? 200 : 503;

    res.status(statusCode).json({
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env['npm_package_version'] || '1.0.0',
      services: {
        database: dbOk ? 'connected' : 'disconnected',
        redis: redisOk ? 'connected' : 'disconnected',
      },
    });
  });

  // ─── API Routes ──────────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/face', faceRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/classes', classRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/dashboard', dashboardRoutes);

  // ─── 404 Handler ─────────────────────────────────────────────────────────
  app.use(notFoundHandler);

  // ─── Global Error Handler (must be last) ─────────────────────────────────
  app.use(globalErrorHandler);

  return app;
};

// Initialize upload directories on module load
storageService.ensureUploadDirs();

export const app = createApp();
export default app;
