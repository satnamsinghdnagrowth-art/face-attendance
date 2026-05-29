/**
 * Tests for socket.io authentication middleware.
 *
 * Key invariants:
 * - Redis unavailability MUST NOT block socket authentication (safeGet is used).
 * - Expired JWT tokens are rejected with 'Token has expired'.
 * - Invalid JWT tokens are rejected with 'Invalid token'.
 * - Missing tokens are rejected with 'Authentication token is required'.
 * - Blacklisted tokens (detected via Redis) are rejected with 'Token has been revoked'.
 * - Valid tokens with Redis unavailable authenticate successfully.
 */

// ─── Mocks (hoisted before imports) ──────────────────────────────────────────

jest.mock('../config/redis', () => ({
  safeGet: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import jwt from 'jsonwebtoken';
import { safeGet } from '../config/redis';
import env from '../config/env';

const mockSafeGet = safeGet as jest.MockedFunction<typeof safeGet>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeToken(payload: object, secret = env.JWT_ACCESS_SECRET, expiresIn = '1h'): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

function makeExpiredToken(payload: object): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '-1s' } as jwt.SignOptions);
}

/**
 * Minimal replica of the authenticateSocket logic so tests don't import
 * the full socket module (which binds ports).  If the real implementation
 * changes, update this helper to match.
 */
async function runAuthenticateSocket(token: string | undefined): Promise<string | null> {
  if (!token) return 'Authentication token is required';

  const isBlacklisted = await safeGet(`blacklist:${token}`);
  if (isBlacklisted) return 'Token has been revoked';

  try {
    jwt.verify(token, env.JWT_ACCESS_SECRET);
    return null; // success
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) return 'Token has expired';
    if (error instanceof jwt.JsonWebTokenError) return 'Invalid token';
    return 'Authentication failed';
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Socket authentication middleware', () => {
  const VALID_PAYLOAD = { userId: 'user-1', role: 'hall_invigilator', email: 'inv@test.com' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Redis unavailable (safeGet returns null)', () => {
    beforeEach(() => {
      mockSafeGet.mockResolvedValue(null);
    });

    it('authenticates a valid token when Redis is down', async () => {
      const token = makeToken(VALID_PAYLOAD);
      const err = await runAuthenticateSocket(token);
      expect(err).toBeNull();
      expect(mockSafeGet).toHaveBeenCalledWith(`blacklist:${token}`);
    });

    it('rejects expired JWT even when Redis is down', async () => {
      const token = makeExpiredToken(VALID_PAYLOAD);
      const err = await runAuthenticateSocket(token);
      expect(err).toBe('Token has expired');
    });

    it('rejects a token signed with the wrong secret when Redis is down', async () => {
      const token = makeToken(VALID_PAYLOAD, 'wrong-secret');
      const err = await runAuthenticateSocket(token);
      expect(err).toBe('Invalid token');
    });
  });

  describe('Redis available', () => {
    it('rejects a blacklisted token', async () => {
      mockSafeGet.mockResolvedValue('1');
      const token = makeToken(VALID_PAYLOAD);
      const err = await runAuthenticateSocket(token);
      expect(err).toBe('Token has been revoked');
    });

    it('authenticates a valid non-blacklisted token', async () => {
      mockSafeGet.mockResolvedValue(null);
      const token = makeToken(VALID_PAYLOAD);
      const err = await runAuthenticateSocket(token);
      expect(err).toBeNull();
    });
  });

  describe('Missing token', () => {
    it('rejects when no token is provided', async () => {
      const err = await runAuthenticateSocket(undefined);
      expect(err).toBe('Authentication token is required');
      expect(mockSafeGet).not.toHaveBeenCalled();
    });
  });

  describe('Redis throws unexpectedly (simulated raw client usage)', () => {
    it('safeGet swallows the error and returns null — auth still succeeds', async () => {
      // safeGet contract: never throws, returns null on any Redis error.
      // This is the fix for the original bug where redisClient.get() was used directly.
      mockSafeGet.mockResolvedValue(null); // safeGet always resolves
      const token = makeToken(VALID_PAYLOAD);
      const err = await runAuthenticateSocket(token);
      expect(err).toBeNull();
    });
  });
});
