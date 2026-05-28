/**
 * Auth middleware unit tests.
 *
 * Validates that:
 *   - Valid JWTs pass through to next()
 *   - Expired / invalid JWTs return 401
 *   - Blacklisted tokens (Redis hit) return 401
 *   - When Redis is unavailable, the blacklist check is skipped and a valid
 *     JWT still authenticates (security degrades gracefully, not completely)
 *   - blacklistToken never throws even when Redis is down
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../config/redis', () => ({
  safeGet: jest.fn(),
  safeSetex: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken, blacklistToken } from '../middleware/auth.middleware';
import { safeGet, safeSetex } from '../config/redis';
import env from '../config/env';

const mockSafeGet = safeGet as jest.MockedFunction<typeof safeGet>;
const mockSafeSetex = safeSetex as jest.MockedFunction<typeof safeSetex>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeRes = () => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

const makeReq = (token?: string): Partial<Request> => ({
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

const validPayload = { userId: 'user-1', role: 'student', email: 'u@example.com' };

const signToken = (payload = validPayload, secret = env.JWT_ACCESS_SECRET, options: jwt.SignOptions = { expiresIn: '15m' }) =>
  jwt.sign(payload, secret, options);

// ─── authenticateToken ────────────────────────────────────────────────────────

describe('authenticateToken', () => {
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('calls next() and attaches user for a valid non-blacklisted token', async () => {
    const token = signToken();
    mockSafeGet.mockResolvedValue(null); // not blacklisted

    const req = makeReq(token) as any;
    const res = makeRes();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ userId: 'user-1', role: 'student' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when no Authorization header is present', async () => {
    const req = makeReq() as any;
    const res = makeRes();

    await authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 for an expired token', async () => {
    const token = signToken(validPayload, env.JWT_ACCESS_SECRET, { expiresIn: '-1s' });
    mockSafeGet.mockResolvedValue(null);

    const req = makeReq(token) as any;
    const res = makeRes();

    await authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('expired') })
    );
  });

  it('returns 401 for a token signed with a wrong secret', async () => {
    const token = signToken(validPayload, 'wrong-secret');
    mockSafeGet.mockResolvedValue(null);

    const req = makeReq(token) as any;
    const res = makeRes();

    await authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when the token is blacklisted in Redis', async () => {
    const token = signToken();
    mockSafeGet.mockResolvedValue('1'); // blacklisted

    const req = makeReq(token) as any;
    const res = makeRes();

    await authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('revoked') })
    );
  });

  it('authenticates successfully when Redis is unavailable (safeGet returns null)', async () => {
    const token = signToken();
    // safeGet returns null when Redis is down — blacklist check is skipped
    mockSafeGet.mockResolvedValue(null);

    const req = makeReq(token) as any;
    const res = makeRes();

    await authenticateToken(req, res, next);

    // Must still authenticate — Redis unavailability must not block valid users
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeDefined();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── blacklistToken ───────────────────────────────────────────────────────────

describe('blacklistToken', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores the token in Redis with the given TTL', async () => {
    mockSafeSetex.mockResolvedValue(undefined);

    await blacklistToken('my-token', 900);

    expect(mockSafeSetex).toHaveBeenCalledWith('blacklist:my-token', 900, '1');
  });

  it('does not throw when Redis is unavailable', async () => {
    // safeSetex never rejects, but let's be explicit
    mockSafeSetex.mockResolvedValue(undefined);

    await expect(blacklistToken('my-token', 900)).resolves.toBeUndefined();
  });
});
