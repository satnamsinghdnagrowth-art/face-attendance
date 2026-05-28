"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = exports.withTransaction = exports.checkDatabaseHealth = exports.getClient = exports.query = void 0;
const pg_1 = require("pg");
const env_1 = __importDefault(require("./env"));
const logger_1 = __importDefault(require("../utils/logger"));
function buildPoolConfig() {
    try {
        const url = new URL(env_1.default.DATABASE_URL);
        const requiresSsl = url.searchParams.get('sslmode') === 'require' ||
            url.searchParams.get('sslmode') === 'verify-full' ||
            env_1.default.DATABASE_URL.includes('neon.tech');
        return {
            host: url.hostname,
            port: parseInt(url.port, 10) || 5432,
            database: url.pathname.replace(/^\//, ''),
            user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            ssl: requiresSsl ? { rejectUnauthorized: false } : false,
        };
    }
    catch {
        return {
            connectionString: env_1.default.DATABASE_URL,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            ssl: false,
        };
    }
}
const pool = new pg_1.Pool(buildPoolConfig());
exports.pool = pool;
pool.on('connect', () => {
    logger_1.default.debug('New database client connected');
});
pool.on('error', (err) => {
    logger_1.default.error('Unexpected error on idle database client', { error: err.message });
});
pool.on('remove', () => {
    logger_1.default.debug('Database client removed from pool');
});
const query = async (text, params) => {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        logger_1.default.debug('Executed query', {
            query: text.substring(0, 100),
            duration: `${duration}ms`,
            rows: result.rowCount,
        });
        return result;
    }
    catch (error) {
        logger_1.default.error('Database query error', {
            query: text.substring(0, 100),
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
};
exports.query = query;
const getClient = async () => {
    const client = await pool.connect();
    const originalQuery = client.query.bind(client);
    const originalRelease = client.release.bind(client);
    const timeoutId = setTimeout(() => {
        logger_1.default.warn('A client has been checked out from the pool for more than 5 seconds');
    }, 5000);
    client.release = (err) => {
        clearTimeout(timeoutId);
        return originalRelease(err);
    };
    return client;
};
exports.getClient = getClient;
const checkDatabaseHealth = async () => {
    try {
        const result = await (0, exports.query)('SELECT NOW() as now');
        logger_1.default.info('Database health check passed', { timestamp: result.rows[0]?.now });
        return true;
    }
    catch (error) {
        logger_1.default.error('Database health check failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
};
exports.checkDatabaseHealth = checkDatabaseHealth;
const withTransaction = async (callback) => {
    const client = await (0, exports.getClient)();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
};
exports.withTransaction = withTransaction;
exports.default = pool;
//# sourceMappingURL=database.js.map