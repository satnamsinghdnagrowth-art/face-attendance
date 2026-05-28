/**
 * Tests for Redis safe wrappers.
 * Verifies that every wrapper returns a safe default (null / void / false)
 * instead of throwing when the underlying Redis client fails.
 */

// Mock ioredis before importing anything that depends on it
jest.mock('ioredis', () => {
  const mockInstance = {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    ping: jest.fn(),
    on: jest.fn().mockReturnThis(),
  };
  return jest.fn(() => mockInstance);
});

// Also silence the logger
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import Redis from 'ioredis';
import {
  safeGet,
  safeSetex,
  safeDel,
  safeExists,
  safeIncr,
  checkRedisHealth,
} from '../config/redis';

const mockRedis = new (Redis as jest.MockedClass<typeof Redis>)('redis://localhost') as jest.Mocked<InstanceType<typeof Redis>>;

// ─── safeGet ─────────────────────────────────────────────────────────────────

describe('safeGet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the value when Redis succeeds', async () => {
    (mockRedis.get as jest.Mock).mockResolvedValue('hello');
    await expect(safeGet('key')).resolves.toBe('hello');
  });

  it('returns null when the key does not exist', async () => {
    (mockRedis.get as jest.Mock).mockResolvedValue(null);
    await expect(safeGet('missing')).resolves.toBeNull();
  });

  it('returns null instead of throwing when Redis errors', async () => {
    (mockRedis.get as jest.Mock).mockRejectedValue(new Error('Connection is closed.'));
    await expect(safeGet('key')).resolves.toBeNull();
  });

  it('returns null on command timeout', async () => {
    (mockRedis.get as jest.Mock).mockRejectedValue(new Error('Command timed out'));
    await expect(safeGet('key')).resolves.toBeNull();
  });
});

// ─── safeSetex ───────────────────────────────────────────────────────────────

describe('safeSetex', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves void when Redis succeeds', async () => {
    (mockRedis.setex as jest.Mock).mockResolvedValue('OK');
    await expect(safeSetex('key', 60, 'value')).resolves.toBeUndefined();
  });

  it('resolves void (does not throw) when Redis errors', async () => {
    (mockRedis.setex as jest.Mock).mockRejectedValue(new Error('Connection is closed.'));
    await expect(safeSetex('key', 60, 'value')).resolves.toBeUndefined();
  });

  it('resolves void on command timeout', async () => {
    (mockRedis.setex as jest.Mock).mockRejectedValue(new Error('Command timed out'));
    await expect(safeSetex('key', 60, 'value')).resolves.toBeUndefined();
  });
});

// ─── safeDel ─────────────────────────────────────────────────────────────────

describe('safeDel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves void when Redis succeeds', async () => {
    (mockRedis.del as jest.Mock).mockResolvedValue(1);
    await expect(safeDel('key1', 'key2')).resolves.toBeUndefined();
  });

  it('resolves void (does not throw) when Redis errors', async () => {
    (mockRedis.del as jest.Mock).mockRejectedValue(new Error('Connection is closed.'));
    await expect(safeDel('key1')).resolves.toBeUndefined();
  });
});

// ─── safeExists ──────────────────────────────────────────────────────────────

describe('safeExists', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns true when key exists', async () => {
    (mockRedis.exists as jest.Mock).mockResolvedValue(1);
    await expect(safeExists('key')).resolves.toBe(true);
  });

  it('returns false when key does not exist', async () => {
    (mockRedis.exists as jest.Mock).mockResolvedValue(0);
    await expect(safeExists('key')).resolves.toBe(false);
  });

  it('returns false instead of throwing when Redis errors', async () => {
    (mockRedis.exists as jest.Mock).mockRejectedValue(new Error('Connection is closed.'));
    await expect(safeExists('key')).resolves.toBe(false);
  });
});

// ─── safeIncr ────────────────────────────────────────────────────────────────

describe('safeIncr', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the incremented value', async () => {
    (mockRedis.incr as jest.Mock).mockResolvedValue(5);
    await expect(safeIncr('counter')).resolves.toBe(5);
  });

  it('returns null instead of throwing when Redis errors', async () => {
    (mockRedis.incr as jest.Mock).mockRejectedValue(new Error('Connection is closed.'));
    await expect(safeIncr('counter')).resolves.toBeNull();
  });
});

// ─── checkRedisHealth ────────────────────────────────────────────────────────

describe('checkRedisHealth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns true when ping replies PONG', async () => {
    (mockRedis.ping as jest.Mock).mockResolvedValue('PONG');
    await expect(checkRedisHealth()).resolves.toBe(true);
  });

  it('returns false when ping fails', async () => {
    (mockRedis.ping as jest.Mock).mockRejectedValue(new Error('Connection is closed.'));
    await expect(checkRedisHealth()).resolves.toBe(false);
  });

  it('returns false when ping returns unexpected value', async () => {
    (mockRedis.ping as jest.Mock).mockResolvedValue('WRONG');
    await expect(checkRedisHealth()).resolves.toBe(false);
  });
});
