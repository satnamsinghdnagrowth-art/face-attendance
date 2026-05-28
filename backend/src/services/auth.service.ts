import { query, withTransaction } from '../config/database';
import { redisClient } from '../config/redis';
import {
  User,
  PublicUser,
  LoginResult,
  TokenPair,
  UserRole,
} from '../types';
import {
  hashPassword,
  comparePassword,
  generateToken,
  generateSecureOTP,
  hashToken,
} from '../utils/encryption';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  blacklistToken,
} from '../middleware/auth.middleware';
import {
  CustomError,
  NotFoundError,
  UnauthorizedError,
  ConflictError,
} from '../middleware/error.middleware';
import logger from '../utils/logger';

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const OTP_TTL = 5 * 60; // 5 minutes in seconds
const ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes in seconds

const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  photo_url: user.photo_url,
  is_active: user.is_active,
  last_login: user.last_login,
  created_at: user.created_at,
});

export class AuthService {
  async login(email: string, password: string): Promise<LoginResult> {
    const result = await query<User>(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const passwordValid = await comparePassword(password, user.password_hash || '');
    if (!passwordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Update last login
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    const payload = { userId: user.id, role: user.role, email: user.email };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(user.id);
    const tokenHash = hashToken(refreshToken);

    // Store refresh token in DB
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, tokenHash]
    );

    // Cache user session in Redis (non-fatal — DB is source of truth)
    redisClient.setex(
      `session:${user.id}`,
      REFRESH_TOKEN_TTL,
      JSON.stringify({ userId: user.id, role: user.role, email: user.email })
    ).catch((err: Error) => logger.warn('Redis session cache failed', { error: err.message }));

    logger.info('User logged in', { userId: user.id, email: user.email });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: toPublicUser({ ...user, last_login: new Date() }),
    };
  }

  async register(userData: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role: UserRole;
  }): Promise<PublicUser> {
    const existing = await query(
      'SELECT id FROM users WHERE email = $1',
      [userData.email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      throw new ConflictError('A user with this email already exists');
    }

    const passwordHash = await hashPassword(userData.password);

    const result = await query<User>(
      `INSERT INTO users (name, email, password_hash, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userData.name, userData.email.toLowerCase(), passwordHash, userData.phone, userData.role]
    );

    const newUser = result.rows[0];
    if (!newUser) {
      throw new CustomError('Failed to create user', 500);
    }

    logger.info('New user registered', { userId: newUser.id, email: newUser.email, role: newUser.role });
    return toPublicUser(newUser);
  }

  async refreshToken(token: string): Promise<TokenPair> {
    let decoded: { userId: string };
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const tokenHash = hashToken(token);

    const result = await query<{ id: string; expires_at: Date }>(
      `SELECT id, expires_at FROM refresh_tokens
       WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()`,
      [decoded.userId, tokenHash]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Refresh token not found or expired');
    }

    const userResult = await query<User>(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      throw new UnauthorizedError('User not found or inactive');
    }

    // Delete old refresh token
    await query(
      'DELETE FROM refresh_tokens WHERE token_hash = $1',
      [tokenHash]
    );

    // Generate new tokens
    const payload = { userId: user.id, role: user.role, email: user.email };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(user.id);
    const newTokenHash = hashToken(newRefreshToken);

    // Store new refresh token
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, newTokenHash]
    );

    logger.info('Token refreshed', { userId: user.id });
    return { access_token: newAccessToken, refresh_token: newRefreshToken };
  }

  async logout(userId: string, refreshToken: string, accessToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query(
        'DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2',
        [userId, tokenHash]
      );
    } else {
      // No specific token provided — delete all refresh tokens for this user
      await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    }

    // Remove session from Redis (non-fatal)
    redisClient.del(`session:${userId}`)
      .catch((err: Error) => logger.warn('Redis session delete failed', { error: err.message }));

    // Blacklist access token if provided
    if (accessToken) {
      await blacklistToken(accessToken, ACCESS_TOKEN_TTL);
    }

    logger.info('User logged out', { userId });
  }

  async logoutAll(userId: string): Promise<void> {
    await query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [userId]
    );
    redisClient.del(`session:${userId}`)
      .catch((err: Error) => logger.warn('Redis session delete failed', { error: err.message }));
    logger.info('User logged out from all devices', { userId });
  }

  async forgotPassword(email: string): Promise<void> {
    const result = await query<User>(
      'SELECT id, email, name FROM users WHERE email = $1 AND is_active = true',
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) {
      // Don't reveal whether the email exists
      logger.info('Password reset requested for non-existent email', { email });
      return;
    }

    const otp = await this.generateOTP(user.id, 'password_reset');

    // In production, send via email service. Here we log it (plug in email service)
    logger.info('Password reset OTP generated', {
      userId: user.id,
      email: user.email,
      otp, // Remove this log in production; send via email
    });
  }

  async resetPassword(userId: string, otp: string, newPassword: string): Promise<void> {
    const isValid = await this.verifyOTP(userId, otp, 'password_reset');
    if (!isValid) {
      throw new CustomError('Invalid or expired OTP', 400);
    }

    const passwordHash = await hashPassword(newPassword);

    await withTransaction(async (client) => {
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, userId]
      );

      // Invalidate all existing refresh tokens
      await client.query(
        'DELETE FROM refresh_tokens WHERE user_id = $1',
        [userId]
      );

      // Mark OTP as used
      await client.query(
        `UPDATE otp_codes SET used = true
         WHERE user_id = $1 AND type = 'password_reset' AND used = false`,
        [userId]
      );
    });

    // Remove session cache (non-fatal)
    redisClient.del(`session:${userId}`)
      .catch((err: Error) => logger.warn('Redis session delete failed', { error: err.message }));

    logger.info('Password reset successful', { userId });
  }

  async generateOTP(userId: string, type: string = 'password_reset'): Promise<string> {
    const otp = generateSecureOTP(6);

    // Store OTP in Redis with TTL (non-fatal — DB is fallback)
    const redisKey = `otp:${userId}:${type}`;
    redisClient.setex(redisKey, OTP_TTL, otp)
      .catch((err: Error) => logger.warn('Redis OTP cache failed', { error: err.message }));

    // Also store in DB for audit trail
    await query(
      `INSERT INTO otp_codes (user_id, code, type, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
      [userId, otp, type]
    );

    return otp;
  }

  async verifyOTP(userId: string, otp: string, type: string = 'password_reset'): Promise<boolean> {
    // Check Redis first (fast path, falls through to DB on failure)
    const redisKey = `otp:${userId}:${type}`;
    try {
      const storedOTP = await redisClient.get(redisKey);
      if (storedOTP && storedOTP === otp) {
        redisClient.del(redisKey).catch(() => {});
        return true;
      }
    } catch {
      logger.warn('Redis OTP check failed, falling back to DB');
    }

    // Fallback to DB check
    const result = await query(
      `SELECT id FROM otp_codes
       WHERE user_id = $1 AND code = $2 AND type = $3
         AND expires_at > NOW() AND used = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, otp, type]
    );

    if (result.rows.length > 0) {
      await query(
        'UPDATE otp_codes SET used = true WHERE id = $1',
        [result.rows[0]!.id]
      );
      return true;
    }

    return false;
  }

  async getUserById(userId: string): Promise<PublicUser> {
    const result = await query<User>(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    const user = result.rows[0];
    if (!user) {
      throw new NotFoundError('User');
    }

    return toPublicUser(user);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const result = await query<User>(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    return result.rows[0] || null;
  }
}

export const authService = new AuthService();
export default authService;
