"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const LOG_DIR = process.env['LOG_DIR'] || './logs';
const LOG_LEVEL = process.env['LOG_LEVEL'] || 'info';
const NODE_ENV = process.env['NODE_ENV'] || 'development';
if (!fs_1.default.existsSync(LOG_DIR)) {
    fs_1.default.mkdirSync(LOG_DIR, { recursive: true });
}
const { combine, timestamp, errors, json, colorize, printf, metadata } = winston_1.default.format;
const consoleFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0
        ? `\n${JSON.stringify(meta, null, 2)}`
        : '';
    return `[${ts}] ${level}: ${message}${metaStr}`;
});
const fileFormat = combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), errors({ stack: true }), metadata({ fillExcept: ['message', 'level', 'timestamp'] }), json());
const developmentFormat = combine(colorize({ all: true }), timestamp({ format: 'HH:mm:ss' }), errors({ stack: true }), consoleFormat);
const productionConsoleFormat = combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), errors({ stack: true }), json());
const transports = [];
transports.push(new winston_1.default.transports.Console({
    level: NODE_ENV === 'development' ? 'debug' : LOG_LEVEL,
    format: NODE_ENV === 'development' ? developmentFormat : productionConsoleFormat,
    handleExceptions: true,
    handleRejections: true,
}));
if (NODE_ENV !== 'test') {
    transports.push(new winston_1.default.transports.File({
        filename: path_1.default.join(LOG_DIR, 'combined.log'),
        level: 'info',
        format: fileFormat,
        maxsize: 10 * 1024 * 1024,
        maxFiles: 10,
        tailable: true,
    }));
    transports.push(new winston_1.default.transports.File({
        filename: path_1.default.join(LOG_DIR, 'error.log'),
        level: 'error',
        format: fileFormat,
        maxsize: 10 * 1024 * 1024,
        maxFiles: 10,
        tailable: true,
    }));
    if (NODE_ENV === 'development') {
        transports.push(new winston_1.default.transports.File({
            filename: path_1.default.join(LOG_DIR, 'debug.log'),
            level: 'debug',
            format: fileFormat,
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
            tailable: true,
        }));
    }
}
const logger = winston_1.default.createLogger({
    level: NODE_ENV === 'development' ? 'debug' : LOG_LEVEL,
    defaultMeta: { service: 'attendance-backend' },
    transports,
    exitOnError: false,
});
exports.default = logger;
//# sourceMappingURL=logger.js.map