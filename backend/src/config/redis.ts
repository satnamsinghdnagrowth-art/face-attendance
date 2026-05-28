import Redis from 'ioredis';
import env from './env';
import logger from '../utils/logger';

const isTLS = env.REDIS_URL.startsWith('rediss://');

export const redisClient = new Redis(env.REDIS_URL, {
  // TLS required for Upstash (rediss://) and similar providers
  tls: isTLS ? { rejectUnauthorized: false } : undefined,

  // CRITICAL: reject commands immediately when disconnected instead of queuing.
  // Without this, every command waits `commandTimeout` ms before failing,
  // which blocks HTTP request handlers and causes cascading timeouts.
  enableOfflineQueue: false,

  // No per-command retries — fail fast so the safe wrappers can return null/void.
  maxRetriesPerRequest: 0,

  // Reconnect strategy: exponential back-off, give up after 6 attempts.
  retryStrategy(times: number): number | null {
    if (times > 6) {
      logger.error('Redis: max reconnection attempts reached, giving up');
      return null;
    }
    const delay = Math.min(times * 500, 5000);
    logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },

  reconnectOnError(err: Error): boolean | 1 | 2 {
    const retryable = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return retryable.some((e) => err.message.includes(e)) ? 1 : false;
  },

  lazyConnect: false,
  keepAlive: 10000,
  connectTimeout: 10000,
  commandTimeout: 2000,
  enableReadyCheck: false, // Upstash doesn't honour the PING ready-check
});

redisClient.on('connect', () => logger.info('Redis connected'));
redisClient.on('ready', () => logger.info('Redis ready'));
redisClient.on('error', (err: Error) => logger.error('Redis error', { error: err.message }));
redisClient.on('close', () => logger.warn('Redis connection closed'));
redisClient.on('reconnecting', () => logger.warn('Redis reconnecting…'));
redisClient.on('end', () => logger.warn('Redis connection ended'));

// ─── Safe wrappers ───────────────────────────────────────────────────────────
// These are the ONLY functions that should be used by the rest of the app.
// They NEVER throw — Redis is a cache; failures degrade gracefully.

export const safeGet = async (key: string): Promise<string | null> => {
  try {
    return await redisClient.get(key);
  } catch {
    return null;
  }
};

export const safeSetex = async (key: string, ttl: number, value: string): Promise<void> => {
  try {
    await redisClient.setex(key, ttl, value);
  } catch (err) {
    logger.warn('Redis setex skipped', { key, error: (err as Error).message });
  }
};

export const safeDel = async (...keys: string[]): Promise<void> => {
  try {
    await redisClient.del(...keys);
  } catch (err) {
    logger.warn('Redis del skipped', { keys, error: (err as Error).message });
  }
};

export const safeExists = async (key: string): Promise<boolean> => {
  try {
    return (await redisClient.exists(key)) === 1;
  } catch {
    return false;
  }
};

export const safeIncr = async (key: string): Promise<number | null> => {
  try {
    return await redisClient.incr(key);
  } catch {
    return null;
  }
};

export const safeExpire = async (key: string, ttl: number): Promise<void> => {
  try {
    await redisClient.expire(key, ttl);
  } catch { /* non-fatal */ }
};

// ─── Health check ─────────────────────────────────────────────────────────────
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const result = await redisClient.ping();
    logger.info('Redis health check passed', { response: result });
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

// ─── Backward-compatible aliases ─────────────────────────────────────────────
export const setWithTTL = safeSetex;
export const get = safeGet;
export const del = safeDel;
export const exists = safeExists;
export const increment = safeIncr;
export const expire = safeExpire;

export default redisClient;
