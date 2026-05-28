import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import env from '../config/env';

const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

function getEncryptionKey(key: string): Buffer {
  // Derive a 32-byte key from the provided key string
  return crypto.createHash('sha256').update(key).digest();
}

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(env.BCRYPT_SALT_ROUNDS);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (plain: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(plain, hash);
};

export const generateToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

export const generateSecureOTP = (digits: number = 6): string => {
  const max = Math.pow(10, digits);
  const randomNumber = crypto.randomInt(0, max);
  return randomNumber.toString().padStart(digits, '0');
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const encryptData = (data: string, key: string = env.ENCRYPTION_KEY): string => {
  const derivedKey = getEncryptionKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const ivHex = iv.toString('hex');
  return `${ivHex}:${encrypted}`;
};

export const decryptData = (encrypted: string, key: string = env.ENCRYPTION_KEY): string => {
  const derivedKey = getEncryptionKey(key);
  const parts = encrypted.split(':');

  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, encryptedData] = parts;
  const iv = Buffer.from(ivHex!, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
  let decrypted = decipher.update(encryptedData!, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

export const generateUUID = (): string => {
  return crypto.randomUUID();
};

export const timingSafeCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    // Still do the comparison to prevent timing attacks based on length
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};
