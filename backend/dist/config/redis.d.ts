import Redis from 'ioredis';
export declare const redisClient: Redis;
export declare const checkRedisHealth: () => Promise<boolean>;
export declare const setWithTTL: (key: string, value: string, ttlSeconds: number) => Promise<void>;
export declare const get: (key: string) => Promise<string | null>;
export declare const del: (...keys: string[]) => Promise<number>;
export declare const exists: (key: string) => Promise<boolean>;
export declare const increment: (key: string) => Promise<number>;
export declare const expire: (key: string, ttlSeconds: number) => Promise<number>;
export default redisClient;
//# sourceMappingURL=redis.d.ts.map