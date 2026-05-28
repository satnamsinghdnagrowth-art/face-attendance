"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expire = exports.increment = exports.exists = exports.del = exports.get = exports.setWithTTL = exports.checkRedisHealth = exports.redisClient = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = __importDefault(require("./env"));
const logger_1 = __importDefault(require("../utils/logger"));
const createRedisClient = () => {
    const client = new ioredis_1.default(env_1.default.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            if (times > 10) {
                logger_1.default.error('Redis: max reconnection attempts reached');
                return null;
            }
            const delay = Math.min(times * 100, 3000);
            logger_1.default.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`);
            return delay;
        },
        reconnectOnError(err) {
            const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
            return targetErrors.some((e) => err.message.includes(e)) ? 1 : false;
        },
        lazyConnect: false,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
        enableReadyCheck: true,
        enableOfflineQueue: true,
    });
    client.on('connect', () => {
        logger_1.default.info('Redis client connected');
    });
    client.on('ready', () => {
        logger_1.default.info('Redis client ready');
    });
    client.on('error', (err) => {
        logger_1.default.error('Redis client error', { error: err.message });
    });
    client.on('close', () => {
        logger_1.default.warn('Redis connection closed');
    });
    client.on('reconnecting', () => {
        logger_1.default.warn('Redis client reconnecting...');
    });
    client.on('end', () => {
        logger_1.default.warn('Redis client connection ended');
    });
    return client;
};
exports.redisClient = createRedisClient();
const checkRedisHealth = async () => {
    try {
        const result = await exports.redisClient.ping();
        logger_1.default.info('Redis health check passed', { response: result });
        return result === 'PONG';
    }
    catch (error) {
        logger_1.default.error('Redis health check failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
};
exports.checkRedisHealth = checkRedisHealth;
const setWithTTL = async (key, value, ttlSeconds) => {
    await exports.redisClient.setex(key, ttlSeconds, value);
};
exports.setWithTTL = setWithTTL;
const get = async (key) => {
    return exports.redisClient.get(key);
};
exports.get = get;
const del = async (...keys) => {
    return exports.redisClient.del(...keys);
};
exports.del = del;
const exists = async (key) => {
    const result = await exports.redisClient.exists(key);
    return result === 1;
};
exports.exists = exists;
const increment = async (key) => {
    return exports.redisClient.incr(key);
};
exports.increment = increment;
const expire = async (key, ttlSeconds) => {
    return exports.redisClient.expire(key, ttlSeconds);
};
exports.expire = expire;
exports.default = exports.redisClient;
//# sourceMappingURL=redis.js.map