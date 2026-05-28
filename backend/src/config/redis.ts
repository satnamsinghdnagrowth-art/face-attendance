import Redis from 'ioredis';
import env from './env';
import logger from '../utils/logger';

const createRedisClient = (): Redis => {
  const isTLS = env.REDIS_URL.startsWith('rediss://');

  const client = new Redis(env.REDIS_URL, {
    // Required for Upstash (rediss://) and other TLS Redis providers
    tls: isTLS ? { rejectUnauthorized: false } : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        logger.error('Redis: max reconnection attempts reached');
        return null;
      }
      const delay = Math.min(times * 200, 3000);
      logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    reconnectOnError(err: Error): boolean | 1 | 2 {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e)) ? 1 : false;
    },
    lazyConnect: false,
    keepAlive: 30000,
    connectTimeout: 15000,
    commandTimeout: 10000,
    // Upstash doesn't support the ready check ping — disable it
    enableReadyCheck: false,
    enableOfflineQueue: true,
  });

  client.on('connect', () => {
    logger.info('Redis client connected');
  });

  client.on('ready', () => {
    logger.info('Redis client ready');
  });

  client.on('error', (err: Error) => {
    logger.error('Redis client error', { error: err.message });
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
  });

  client.on('reconnecting', () => {
    logger.warn('Redis client reconnecting...');
  });

  client.on('end', () => {
    logger.warn('Redis client connection ended');
  });

  return client;
};

export const redisClient = createRedisClient();

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

export const setWithTTL = async (key: string, value: string, ttlSeconds: number): Promise<void> => {
  await redisClient.setex(key, ttlSeconds, value);
};

export const get = async (key: string): Promise<string | null> => {
  return redisClient.get(key);
};

export const del = async (...keys: string[]): Promise<number> => {
  return redisClient.del(...keys);
};

export const exists = async (key: string): Promise<boolean> => {
  const result = await redisClient.exists(key);
  return result === 1;
};

export const increment = async (key: string): Promise<number> => {
  return redisClient.incr(key);
};

export const expire = async (key: string, ttlSeconds: number): Promise<number> => {
  return redisClient.expire(key, ttlSeconds);
};

export default redisClient;
