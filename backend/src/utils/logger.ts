import winston from 'winston';
import path from 'path';
import fs from 'fs';

const LOG_DIR = process.env['LOG_DIR'] || './logs';
const LOG_LEVEL = process.env['LOG_LEVEL'] || 'info';
const NODE_ENV = process.env['NODE_ENV'] || 'development';

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const { combine, timestamp, errors, json, colorize, printf, metadata } = winston.format;

const consoleFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length > 0
    ? `\n${JSON.stringify(meta, null, 2)}`
    : '';
  return `[${ts}] ${level}: ${message}${metaStr}`;
});

const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  errors({ stack: true }),
  metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
  json()
);

const developmentFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  consoleFormat
);

const productionConsoleFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  errors({ stack: true }),
  json()
);

const transports: winston.transport[] = [];

// Console transport
transports.push(
  new winston.transports.Console({
    level: NODE_ENV === 'development' ? 'debug' : LOG_LEVEL,
    format: NODE_ENV === 'development' ? developmentFormat : productionConsoleFormat,
    handleExceptions: true,
    handleRejections: true,
  })
);

// File transports (only in non-test environments)
if (NODE_ENV !== 'test') {
  // Combined log
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      level: 'info',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    })
  );

  // Error log
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
      tailable: true,
    })
  );

  if (NODE_ENV === 'development') {
    transports.push(
      new winston.transports.File({
        filename: path.join(LOG_DIR, 'debug.log'),
        level: 'debug',
        format: fileFormat,
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
        tailable: true,
      })
    );
  }
}

const logger = winston.createLogger({
  level: NODE_ENV === 'development' ? 'debug' : LOG_LEVEL,
  defaultMeta: { service: 'attendance-backend' },
  transports,
  exitOnError: false,
});

export default logger;
