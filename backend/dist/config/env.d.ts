export declare const env: {
    readonly NODE_ENV: string;
    readonly PORT: number;
    readonly IS_PRODUCTION: boolean;
    readonly IS_DEVELOPMENT: boolean;
    readonly DATABASE_URL: string;
    readonly REDIS_URL: string;
    readonly JWT_ACCESS_SECRET: string;
    readonly JWT_REFRESH_SECRET: string;
    readonly JWT_ACCESS_EXPIRES_IN: string;
    readonly JWT_REFRESH_EXPIRES_IN: string;
    readonly UPLOAD_DIR: string;
    readonly MAX_FILE_SIZE: number;
    readonly FRONTEND_URL: string;
    readonly FACE_SIMILARITY_THRESHOLD: number;
    readonly BCRYPT_SALT_ROUNDS: number;
    readonly ENCRYPTION_KEY: string;
    readonly RATE_LIMIT_WINDOW_MS: number;
    readonly RATE_LIMIT_MAX: number;
    readonly AUTH_RATE_LIMIT_MAX: number;
    readonly LOG_LEVEL: string;
    readonly LOG_DIR: string;
};
export type Env = typeof env;
export default env;
//# sourceMappingURL=env.d.ts.map