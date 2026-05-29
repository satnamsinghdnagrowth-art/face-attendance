/**
 * Redis configuration with robust failure handling.
 *
 * Design contract:
 *   - The application starts and runs normally even when Redis is unreachable.
 *   - Safe wrappers (safeGet, safeSetex, …) NEVER throw.
 *   - When Redis is unavailable, reads return null and writes are silently
 *     dropped — the application falls back to DB-only operation.
 *   - Reconnection is attempted in the background with exponential back-off.
 *     Log noise is minimised: only the first failure per cycle and recovery
 *     are logged at WARN/INFO; intermediate retries are DEBUG only.
 */

import Redis from 'ioredis';
import env from './env';
import logger from '../utils/logger';

// ─── Availability state ───────────────────────────────────────────────────────
// Checked by every safe wrapper before dispatching any command.
// This avoids sending commands to a disconnected client (which would wait for
// commandTimeout before failing, creating cascading slowdowns).
let isAvailable = false;

// Suppress repeated "degraded" warnings: only log once per failure cycle.
let degradedWarningEmitted = false;

// Background reconnect timer handle.
let cooldownTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_ATTEMPTS   = env.IS_PRODUCTION ? 5 : 3;
const COOLDOWN_MS    = 60_000;                          // 60 s between retry cycles
const BASE_DELAY_MS  = 1_000;                           // first retry delay
const MAX_DELAY_MS   = 16_000;                          // cap per-retry delay at 16 s

// ─── Connection URL ───────────────────────────────────────────────────────────
const isTLS = env.REDIS_URL.startsWith('rediss://');

// ─── Client ───────────────────────────────────────────────────────────────────
export const redisClient = new Redis(env.REDIS_URL, {
  // TLS required for Upstash rediss:// endpoint
  tls: isTLS ? { rejectUnauthorized: false } : undefined,

  // Don't connect automatically on module import — we call connect() explicitly
  // below so the server port binds before any blocking I/O happens.
  lazyConnect: true,

  // Reject commands immediately when there is no active connection.
  // Without this, ioredis queues commands and drains them after reconnect,
  // which can cause large latency spikes after an outage.
  enableOfflineQueue: false,

  // Don't retry individual commands — fail fast and let the caller deal with null.
  maxRetriesPerRequest: 0,

  // Upstash and some other providers don't honour the PING ready-check sequence.
  enableReadyCheck: false,

  keepAlive: 10_000,
  connectTimeout: 6_000,
  commandTimeout: 3_000,

  // Exponential back-off: 1 s, 2 s, 4 s, 8 s, 16 s — then give up and wait.
  retryStrategy(times: number): number | null {
    if (times > MAX_ATTEMPTS) {
      // Emit the "degraded" warning exactly ONCE per outage cycle.
      if (!degradedWarningEmitted) {
        degradedWarningEmitted = true;
        logger.warn(
          '[Redis] Unreachable after max reconnect attempts — ' +
          'running in degraded mode (auth tokens & rate-limit cache disabled). ' +
          `Will retry automatically in ${COOLDOWN_MS / 1_000}s. ` +
          'Check REDIS_URL in .env if this persists.'
        );
      }
      scheduleBackgroundReconnect();
      return null; // tell ioredis to stop; we own the next connect() call
    }

    const delay = Math.min(BASE_DELAY_MS * Math.pow(2, times - 1), MAX_DELAY_MS);
    logger.debug(`[Redis] Reconnect attempt ${times}/${MAX_ATTEMPTS} in ${delay}ms`);
    return delay;
  },

  // Only auto-retry on transient transport errors on an already-open connection.
  reconnectOnError(err: Error): boolean {
    const transient = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'READONLY'];
    return transient.some((code) => err.message.includes(code));
  },
});

// ─── Event handlers ───────────────────────────────────────────────────────────

redisClient.on('ready', () => {
  isAvailable = true;
  degradedWarningEmitted = false; // reset so next failure logs again
  if (cooldownTimer !== null) {
    clearTimeout(cooldownTimer);
    cooldownTimer = null;
  }
  logger.info('[Redis] Connected and ready');
});

// 'connect' fires when the TCP socket is open but before authentication.
// This is too early to mark isAvailable — wait for 'ready'.
redisClient.on('connect', () => logger.debug('[Redis] TCP socket open'));

redisClient.on('error', (err: Error) => {
  isAvailable = false;

  // ECONNREFUSED on localhost in development is expected if Redis isn't installed.
  // Don't flood the log — one debug line is enough.
  if (err.message.includes('ECONNREFUSED')) {
    logger.debug('[Redis] Connection refused — is Redis running at the configured URL?');
    return;
  }

  // For Upstash free-tier or network issues, log at debug to avoid noise.
  // The retryStrategy will emit the WARN-level message after all attempts fail.
  logger.debug('[Redis] Connection error', { error: err.message });
});

// These fire during normal reconnect cycles — debug only.
redisClient.on('close',       () => { isAvailable = false; logger.debug('[Redis] Socket closed'); });
redisClient.on('reconnecting', () => logger.debug('[Redis] Reconnecting…'));
redisClient.on('end',         () => { isAvailable = false; logger.debug('[Redis] Connection ended'); });

// ─── Background reconnect after cooldown ─────────────────────────────────────
// Called by retryStrategy when all attempts are exhausted.
// Waits COOLDOWN_MS then kicks off a fresh connection cycle.
function scheduleBackgroundReconnect(): void {
  if (cooldownTimer !== null) return; // already scheduled — don't double-schedule
  cooldownTimer = setTimeout(async () => {
    cooldownTimer = null;
    logger.debug('[Redis] Cooldown elapsed — attempting background reconnect');
    try {
      await redisClient.connect();
    } catch {
      // retryStrategy will handle this attempt cycle's failures and logging
    }
  }, COOLDOWN_MS);
}

// ─── Initial connection (fire-and-forget, non-blocking) ──────────────────────
// The IIFE resolves immediately — server startup is never blocked by Redis.
void (async () => {
  try {
    await redisClient.connect();
  } catch {
    // retryStrategy + events handle all failure logging — nothing to do here
  }
})();

// ─── Graceful shutdown ────────────────────────────────────────────────────────
export const disconnectRedis = async (): Promise<void> => {
  if (cooldownTimer !== null) {
    clearTimeout(cooldownTimer);
    cooldownTimer = null;
  }
  try {
    await redisClient.quit();
  } catch {
    redisClient.disconnect();
  }
};

// ─── Safe wrappers ────────────────────────────────────────────────────────────
// Every caller in the app uses these — never the raw redisClient directly.
// All functions:
//   • Check isAvailable before sending any command (instant null/void on failure)
//   • Catch any unexpected errors and return a safe default value
//   • Never throw under any circumstances

export const safeGet = async (key: string): Promise<string | null> => {
  if (!isAvailable) return null;
  try {
    return await redisClient.get(key);
  } catch {
    return null;
  }
};

export const safeSetex = async (key: string, ttl: number, value: string): Promise<void> => {
  if (!isAvailable) return;
  try {
    await redisClient.setex(key, ttl, value);
  } catch { /* non-fatal write failure */ }
};

export const safeDel = async (...keys: string[]): Promise<void> => {
  if (!isAvailable) return;
  try {
    await redisClient.del(...keys);
  } catch { /* non-fatal */ }
};

export const safeExists = async (key: string): Promise<boolean> => {
  if (!isAvailable) return false;
  try {
    return (await redisClient.exists(key)) === 1;
  } catch {
    return false;
  }
};

export const safeIncr = async (key: string): Promise<number | null> => {
  if (!isAvailable) return null;
  try {
    return await redisClient.incr(key);
  } catch {
    return null;
  }
};

export const safeExpire = async (key: string, ttl: number): Promise<void> => {
  if (!isAvailable) return;
  try {
    await redisClient.expire(key, ttl);
  } catch { /* non-fatal */ }
};

// ─── Health check ─────────────────────────────────────────────────────────────
export const checkRedisHealth = async (): Promise<boolean> => {
  if (!isAvailable) return false;
  try {
    return (await redisClient.ping()) === 'PONG';
  } catch {
    return false;
  }
};

// ─── Backward-compatible aliases ─────────────────────────────────────────────
export const setWithTTL = safeSetex;
export const get        = safeGet;
export const del        = safeDel;
export const exists     = safeExists;
export const increment  = safeIncr;
export const expire     = safeExpire;

export default redisClient;
