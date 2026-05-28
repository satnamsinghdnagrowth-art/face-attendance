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
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = __importDefault(require("./config/env"));
const logger_1 = __importDefault(require("./utils/logger"));
const storage_service_1 = require("./services/storage.service");
const error_middleware_1 = require("./middleware/error.middleware");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const face_routes_1 = __importDefault(require("./routes/face.routes"));
const attendance_routes_1 = __importDefault(require("./routes/attendance.routes"));
const class_routes_1 = __importDefault(require("./routes/class.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const createApp = () => {
    const app = (0, express_1.default)();
    app.set('trust proxy', 1);
    app.use((0, helmet_1.default)({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'blob:'],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
            },
        },
    }));
    app.use((0, cors_1.default)({
        origin: (origin, callback) => {
            const allowedOrigins = env_1.default.FRONTEND_URL.split(',').map((o) => o.trim());
            if (!origin || allowedOrigins.includes(origin) || env_1.default.IS_DEVELOPMENT) {
                callback(null, true);
            }
            else {
                callback(new Error(`CORS: Origin ${origin} not allowed`));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
        exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Limit'],
    }));
    const generalRateLimiter = (0, express_rate_limit_1.default)({
        windowMs: env_1.default.RATE_LIMIT_WINDOW_MS,
        max: env_1.default.RATE_LIMIT_MAX,
        message: {
            success: false,
            message: 'Too many requests from this IP. Please try again later.',
        },
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => {
            return req.path === '/health';
        },
    });
    app.use(generalRateLimiter);
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
    app.use((req, _res, next) => {
        logger_1.default.debug('Incoming request', {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userAgent: req.get('user-agent'),
        });
        next();
    });
    const uploadsPath = path_1.default.isAbsolute(env_1.default.UPLOAD_DIR)
        ? env_1.default.UPLOAD_DIR
        : path_1.default.join(__dirname, '..', env_1.default.UPLOAD_DIR.replace('./', ''));
    app.use('/uploads', express_1.default.static(uploadsPath, {
        maxAge: '1d',
        etag: true,
        lastModified: true,
        setHeaders: (res) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Cache-Control', 'public, max-age=86400');
        },
    }));
    app.get('/health', async (req, res) => {
        const { checkDatabaseHealth } = await Promise.resolve().then(() => __importStar(require('./config/database')));
        const { checkRedisHealth } = await Promise.resolve().then(() => __importStar(require('./config/redis')));
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
    app.use('/api/auth', auth_routes_1.default);
    app.use('/api/users', user_routes_1.default);
    app.use('/api/face', face_routes_1.default);
    app.use('/api/attendance', attendance_routes_1.default);
    app.use('/api/classes', class_routes_1.default);
    app.use('/api/reports', report_routes_1.default);
    app.use('/api/notifications', notification_routes_1.default);
    app.use('/api/dashboard', dashboard_routes_1.default);
    app.use(error_middleware_1.notFoundHandler);
    app.use(error_middleware_1.globalErrorHandler);
    return app;
};
storage_service_1.storageService.ensureUploadDirs();
exports.app = createApp();
exports.default = exports.app;
//# sourceMappingURL=app.js.map