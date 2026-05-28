import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function optionalNumberEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number, got: ${value}`);
  }
  return parsed;
}

export const env = {
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
  PORT: optionalNumberEnv('PORT', 3000),
  IS_PRODUCTION: optionalEnv('NODE_ENV', 'development') === 'production',
  IS_DEVELOPMENT: optionalEnv('NODE_ENV', 'development') === 'development',

  // Database
  DATABASE_URL: optionalEnv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/attendance_db'),

  // Redis
  REDIS_URL: optionalEnv('REDIS_URL', 'redis://localhost:6379'),

  // JWT
  JWT_ACCESS_SECRET: optionalEnv('JWT_ACCESS_SECRET', 'fallback_access_secret_change_in_production'),
  JWT_REFRESH_SECRET: optionalEnv('JWT_REFRESH_SECRET', 'fallback_refresh_secret_change_in_production'),
  JWT_ACCESS_EXPIRES_IN: optionalEnv('JWT_ACCESS_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: optionalEnv('JWT_REFRESH_EXPIRES_IN', '7d'),

  // File Upload
  UPLOAD_DIR: optionalEnv('UPLOAD_DIR', './uploads'),
  MAX_FILE_SIZE: optionalNumberEnv('MAX_FILE_SIZE', 10485760),

  // CORS
  FRONTEND_URL: optionalEnv('FRONTEND_URL', 'http://localhost:3000'),

  // Face Recognition
  FACE_SIMILARITY_THRESHOLD: parseFloat(optionalEnv('FACE_SIMILARITY_THRESHOLD', '0.75')),

  // Security
  BCRYPT_SALT_ROUNDS: optionalNumberEnv('BCRYPT_SALT_ROUNDS', 12),
  ENCRYPTION_KEY: optionalEnv('ENCRYPTION_KEY', 'default_32_char_encryption_key!!'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: optionalNumberEnv('RATE_LIMIT_WINDOW_MS', 900000),
  RATE_LIMIT_MAX: optionalNumberEnv('RATE_LIMIT_MAX', 100),
  AUTH_RATE_LIMIT_MAX: optionalNumberEnv('AUTH_RATE_LIMIT_MAX', 10),

  // Logging
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info'),
  LOG_DIR: optionalEnv('LOG_DIR', './logs'),
} as const;

export type Env = typeof env;

export default env;
