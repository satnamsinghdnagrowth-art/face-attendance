"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const app_1 = __importDefault(require("./app"));
const env_1 = __importDefault(require("./config/env"));
const logger_1 = __importDefault(require("./utils/logger"));
const database_1 = require("./config/database");
const redis_1 = require("./config/redis");
const attendance_socket_1 = require("./sockets/attendance.socket");
const notification_service_1 = require("./services/notification.service");
const node_cron_1 = __importDefault(require("node-cron"));
let server;
const startServer = async () => {
    logger_1.default.info('Checking service dependencies...');
    const dbOk = await (0, database_1.checkDatabaseHealth)();
    if (!dbOk) {
        logger_1.default.error('Database connection failed. Exiting.');
        process.exit(1);
    }
    const redisOk = await (0, redis_1.checkRedisHealth)();
    if (!redisOk) {
        logger_1.default.warn('Redis connection failed. Some features (rate limiting, sessions) may be degraded.');
    }
    server = http_1.default.createServer(app_1.default);
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: env_1.default.FRONTEND_URL.split(',').map((o) => o.trim()),
            methods: ['GET', 'POST'],
            credentials: true,
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000,
        upgradeTimeout: 30000,
        allowEIO3: true,
    });
    (0, notification_service_1.setSocketIO)(io);
    (0, attendance_socket_1.initializeSockets)(io);
    node_cron_1.default.schedule('0 * * * *', async () => {
        try {
            const { query } = await Promise.resolve().then(() => __importStar(require('./config/database')));
            await Promise.all([
                query('DELETE FROM otp_codes WHERE expires_at < NOW()'),
                query('DELETE FROM refresh_tokens WHERE expires_at < NOW()'),
            ]);
            logger_1.default.debug('Expired tokens cleaned up');
        }
        catch (error) {
            logger_1.default.error('Cron job failed: token cleanup', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
    node_cron_1.default.schedule('*/30 * * * *', async () => {
        try {
            const { query } = await Promise.resolve().then(() => __importStar(require('./config/database')));
            const result = await query(`UPDATE attendance_sessions
         SET status = 'cancelled', end_time = NOW()
         WHERE status = 'active'
           AND start_time < NOW() - INTERVAL '4 hours'
         RETURNING id`);
            if (result.rowCount && result.rowCount > 0) {
                logger_1.default.warn('Auto-cancelled stale sessions', { count: result.rowCount });
            }
        }
        catch (error) {
            logger_1.default.error('Cron job failed: stale session cleanup', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                logger_1.default.warn(`Port ${env_1.default.PORT} in use — killing existing process and retrying...`);
                const { execSync } = require('child_process');
                try {
                    execSync(`fuser -k ${env_1.default.PORT}/tcp 2>/dev/null || true`);
                }
                catch { }
                setTimeout(() => {
                    server.listen(env_1.default.PORT, () => resolve());
                }, 500);
            }
            else {
                reject(err);
            }
        });
        server.listen(env_1.default.PORT, () => {
            resolve();
        });
    });
    logger_1.default.info(`Server started`, {
        port: env_1.default.PORT,
        environment: env_1.default.NODE_ENV,
        pid: process.pid,
    });
    logger_1.default.info(`API available at http://localhost:${env_1.default.PORT}/api`);
    logger_1.default.info(`Health check at http://localhost:${env_1.default.PORT}/health`);
    logger_1.default.info(`Socket.IO available at ws://localhost:${env_1.default.PORT}`);
};
const gracefulShutdown = async (signal) => {
    logger_1.default.info(`Received ${signal}. Starting graceful shutdown...`);
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((err) => {
                if (err) {
                    logger_1.default.error('Error closing HTTP server', { error: err.message });
                    reject(err);
                }
                else {
                    logger_1.default.info('HTTP server closed');
                    resolve();
                }
            });
        });
    }
    try {
        await database_1.pool.end();
        logger_1.default.info('Database pool closed');
    }
    catch (error) {
        logger_1.default.error('Error closing database pool', {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    try {
        await redis_1.redisClient.quit();
        logger_1.default.info('Redis connection closed');
    }
    catch (error) {
        logger_1.default.error('Error closing Redis connection', {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    logger_1.default.info('Graceful shutdown complete');
    process.exit(0);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
    logger_1.default.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
    });
    gracefulShutdown('uncaughtException').catch(() => process.exit(1));
});
process.on('unhandledRejection', (reason) => {
    logger_1.default.error('Unhandled Promise Rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
    });
});
startServer().catch((error) => {
    logger_1.default.error('Failed to start server', {
        error: error.message,
        stack: error.stack,
    });
    process.exit(1);
});
//# sourceMappingURL=server.js.map