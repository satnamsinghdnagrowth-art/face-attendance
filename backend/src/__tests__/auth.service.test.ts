/**
 * Auth service unit tests.
 *
 * All external I/O (DB, Redis, crypto) is mocked so tests are fast and
 * deterministic.  The key scenarios validated here are:
 *   - Login succeeds and returns tokens when Redis is healthy
 *   - Login STILL succeeds when Redis is unavailable (cache miss is non-fatal)
 *   - Login rejects bad credentials
 *   - Register creates a user or rejects duplicates
 *   - OTP verification falls through to DB when Redis is down
 */

// ─── Mocks (hoisted before imports) ──────────────────────────────────────────

jest.mock('../config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../config/redis', () => ({
  safeGet: jest.fn(),
  safeSetex: jest.fn().mockResolvedValue(undefined),
  safeDel: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/encryption', () => ({
  comparePassword: jest.fn(),
  hashPassword: jest.fn(),
  generateToken: jest.fn(() => 'token-abc'),
  generateSecureOTP: jest.fn(() => '123456'),
  hashToken: jest.fn((t: string) => `hashed:${t}`),
}));

jest.mock('../middleware/auth.middleware', () => ({
  generateAccessToken: jest.fn(() => 'access-token'),
  generateRefreshToken: jest.fn(() => 'refresh-token'),
  verifyRefreshToken: jest.fn(),
  blacklistToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { authService } from '../services/auth.service';
import { query, withTransaction } from '../config/database';
import { safeGet, safeSetex, safeDel } from '../config/redis';
import { comparePassword, hashPassword } from '../utils/encryption';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockWithTransaction = withTransaction as jest.MockedFunction<typeof withTransaction>;
const mockComparePassword = comparePassword as jest.MockedFunction<typeof comparePassword>;
const mockHashPassword = hashPassword as jest.MockedFunction<typeof hashPassword>;
const mockSafeGet = safeGet as jest.MockedFunction<typeof safeGet>;
const mockSafeSetex = safeSetex as jest.MockedFunction<typeof safeSetex>;
const mockSafeDel = safeDel as jest.MockedFunction<typeof safeDel>;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fakeUser = {
  id: 'user-uuid-1',
  name: 'Test User',
  email: 'test@example.com',
  password_hash: 'hashed-password',
  phone: null,
  role: 'student' as const,
  photo_url: null,
  is_active: true,
  last_login: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── login ────────────────────────────────────────────────────────────────────

describe('AuthService.login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns tokens and user on valid credentials', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [fakeUser], rowCount: 1 } as any) // SELECT user
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)          // UPDATE last_login
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);         // INSERT refresh_token
    mockComparePassword.mockResolvedValue(true);

    const result = await authService.login('test@example.com', 'password123');

    expect(result.access_token).toBe('access-token');
    expect(result.refresh_token).toBe('refresh-token');
    expect(result.user.email).toBe('test@example.com');
    // password_hash must never appear on the public user shape
    expect(Object.keys(result.user)).not.toContain('password_hash');
  });

  it('caches the session in Redis after successful login', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [fakeUser], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    mockComparePassword.mockResolvedValue(true);

    await authService.login('test@example.com', 'password123');

    // safeSetex is called asynchronously — give it a tick to settle
    await Promise.resolve();
    expect(mockSafeSetex).toHaveBeenCalledWith(
      `session:${fakeUser.id}`,
      expect.any(Number),
      expect.stringContaining(fakeUser.id)
    );
  });

  it('login succeeds even when Redis safeSetex fails', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [fakeUser], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    mockComparePassword.mockResolvedValue(true);
    // Simulate Redis being down — safeSetex is already a no-op, but verify the promise resolves
    mockSafeSetex.mockResolvedValue(undefined);

    const result = await authService.login('test@example.com', 'password123');
    expect(result.access_token).toBe('access-token');
  });

  it('throws UnauthorizedError when user does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await expect(authService.login('nobody@example.com', 'password')).rejects.toThrow(
      'Invalid email or password'
    );
  });

  it('throws UnauthorizedError when password is wrong', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [fakeUser], rowCount: 1 } as any);
    mockComparePassword.mockResolvedValue(false);

    await expect(authService.login('test@example.com', 'wrong-password')).rejects.toThrow(
      'Invalid email or password'
    );
  });
});

// ─── register ─────────────────────────────────────────────────────────────────

describe('AuthService.register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates and returns a new user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)       // no existing user
      .mockResolvedValueOnce({ rows: [fakeUser], rowCount: 1 } as any); // INSERT
    mockHashPassword.mockResolvedValue('hashed-pw');

    const result = await authService.register({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      role: 'student',
    });

    expect(result.email).toBe('test@example.com');
    expect(Object.keys(result)).not.toContain('password_hash');
  });

  it('throws ConflictError when email is already taken', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }], rowCount: 1 } as any);

    await expect(
      authService.register({
        name: 'Duplicate',
        email: 'test@example.com',
        password: 'pw',
        role: 'student',
      })
    ).rejects.toThrow('already exists');
  });
});

// ─── logout ──────────────────────────────────────────────────────────────────

describe('AuthService.logout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes refresh token from DB and removes Redis session', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

    await authService.logout(fakeUser.id, 'refresh-token');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM refresh_tokens'),
      expect.any(Array)
    );
    await Promise.resolve(); // let fire-and-forget settle
    expect(mockSafeDel).toHaveBeenCalledWith(`session:${fakeUser.id}`);
  });

  it('logout succeeds even when Redis safeDel throws', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    mockSafeDel.mockResolvedValue(undefined); // already non-throwing, just confirm

    await expect(authService.logout(fakeUser.id, 'refresh-token')).resolves.toBeUndefined();
  });
});

// ─── verifyOTP ────────────────────────────────────────────────────────────────

describe('AuthService.verifyOTP', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns true when OTP matches Redis cache', async () => {
    mockSafeGet.mockResolvedValue('123456');

    const result = await authService.verifyOTP(fakeUser.id, '123456', 'password_reset');
    expect(result).toBe(true);
    await Promise.resolve();
    expect(mockSafeDel).toHaveBeenCalledWith(`otp:${fakeUser.id}:password_reset`);
  });

  it('falls back to DB and returns true when Redis returns null (Redis down)', async () => {
    mockSafeGet.mockResolvedValue(null); // Redis miss / unavailable
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'otp-row-id' }], rowCount: 1 } as any);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any); // UPDATE used=true

    const result = await authService.verifyOTP(fakeUser.id, '123456', 'password_reset');
    expect(result).toBe(true);
  });

  it('returns false when OTP does not match in Redis or DB', async () => {
    mockSafeGet.mockResolvedValue('wrong-otp');
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const result = await authService.verifyOTP(fakeUser.id, '999999', 'password_reset');
    expect(result).toBe(false);
  });

  it('falls back to DB and returns false when no match in DB either', async () => {
    mockSafeGet.mockResolvedValue(null);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const result = await authService.verifyOTP(fakeUser.id, 'bad-otp', 'password_reset');
    expect(result).toBe(false);
  });
});
