import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import env from './env';
import logger from '../utils/logger';

// Parse URL into individual params so pg never receives unsupported libpq
// query parameters (channel_binding, sslmode) that cause silent ETIMEDOUT
// failures during the TLS handshake on Neon and similar cloud providers.
function buildPoolConfig() {
  try {
    const url = new URL(env.DATABASE_URL);
    const requiresSsl = url.searchParams.get('sslmode') === 'require' ||
                        url.searchParams.get('sslmode') === 'verify-full' ||
                        env.DATABASE_URL.includes('neon.tech');
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
  } catch {
    return {
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: false,
    };
  }
}

const pool = new Pool(buildPoolConfig());

pool.on('connect', () => {
  logger.debug('New database client connected');
});

pool.on('error', (err: Error) => {
  logger.error('Unexpected error on idle database client', { error: err.message });
});

pool.on('remove', () => {
  logger.debug('Database client removed from pool');
});

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> => {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', {
      query: text.substring(0, 100),
      duration: `${duration}ms`,
      rows: result.rowCount,
    });
    return result;
  } catch (error) {
    logger.error('Database query error', {
      query: text.substring(0, 100),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

export const getClient = async (): Promise<PoolClient> => {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);

  const timeoutId = setTimeout(() => {
    logger.warn('A client has been checked out from the pool for more than 5 seconds');
  }, 5000);

  client.release = (err?: Error | boolean) => {
    clearTimeout(timeoutId);
    return originalRelease(err as Error | boolean);
  };

  return client;
};

export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    const result = await query('SELECT NOW() as now');
    logger.info('Database health check passed', { timestamp: result.rows[0]?.now });
    return true;
  } catch (error) {
    logger.error('Database health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export { pool };
export default pool;
